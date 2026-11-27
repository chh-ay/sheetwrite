import { normalizeSheetwriteError, SheetwriteError } from "./errors.js";
import { cloneJsonValue } from "./plain-data.js";
import { cellRange } from "./store/ranges.js";
import type { PresenceOverlay, Range, Selection } from "./types/coordinates.js";
import type { Sheet } from "./types/document.js";
import type { Grid } from "./types/grid.js";

/** Public collaborator identity attached to presence updates. */
export interface PresenceActor {
  /** Stable user ID; required, and unique among collaborators. */
  id: string;
  /** Name shown next to the user's selection. */
  displayName?: string;
  /** CSS colour of the user's selection; defaults to blue (`#2563eb`). */
  color?: string;
}

/** Ephemeral collaborator selection and activity update. */
export interface PresenceMessage {
  /** Who sent the message. */
  actor: PresenceActor;
  /** Stable ID of the sheet the sender is looking at. */
  activeSheet: string;
  /** The sender's selected ranges; empty when the sender does not share them. */
  selections: readonly Range[];
  /** When the message was sent, in milliseconds since the Unix epoch. */
  sentAt: number;
}

/** Host transport contract for ephemeral presence messages. */
export interface PresenceTransport {
  /** Sends this user's presence to the other collaborators. */
  publish(message: PresenceMessage, signal?: AbortSignal): void | Promise<void>;
  /** Calls `listener` for each message from another collaborator; may return a function that stops it. */
  subscribe(
    listener: (message: PresenceMessage) => void,
    signal?: AbortSignal,
  ): undefined | (() => void);
}

/** Controls which ephemeral collaborator details may be transmitted. */
export interface PresencePrivacyOptions {
  /** Set to `false` to leave the display name out of sent messages. */
  shareDisplayName?: boolean;
  /** Set to `false` to send no selected ranges. */
  shareSelection?: boolean;
  /** Set to `false` to ignore other collaborators' presence. */
  receivePresence?: boolean;
  /** Return `false` to ignore a collaborator's messages. */
  allowActor?: (actor: Readonly<PresenceActor>) => boolean;
}

/** Identity, privacy, and timing options for presence coordination. */
export interface PresenceCoordinatorOptions {
  /** This user, as other collaborators see them. */
  actor: PresenceActor;
  /** What this user shares and receives; by default, everything. */
  privacy?: PresencePrivacyOptions;
  /** Publish/prune interval in milliseconds; defaults to 15,000. Use 0 to disable the timer. */
  heartbeatMs?: number;
  /** Idle receipt time before a remote actor expires; defaults to 45,000 milliseconds. */
  timeoutMs?: number;
  /** Remote actors retained at once; defaults to 32 and is clamped to at least 1. */
  maxActors?: number;
  /** Selection ranges sent or accepted per actor; defaults to 8 and is clamped to at least 1. */
  maxRangesPerActor?: number;
  /** Clock in milliseconds; defaults to `Date.now`. Replace it in tests. */
  now?: () => number;
}

/** Connection or actor transition emitted by presence coordination. */
export type PresenceCoordinatorEvent =
  | { type: "published"; message: PresenceMessage }
  | { type: "updated"; actorId: string }
  | { type: "expired"; actorId: string }
  | { type: "error"; error: SheetwriteError };

type PresenceListener = (event: PresenceCoordinatorEvent) => void;

interface ReceivedPresence {
  message: PresenceMessage;
  receivedAt: number;
}

/** Keeps presence current without coupling publication to animation frames. */
const DEFAULT_PRESENCE_HEARTBEAT_MS = 15_000;
/** Allows three default heartbeat intervals before a silent actor expires. */
const DEFAULT_PRESENCE_TIMEOUT_MS = 45_000;
/** Bounds retained remote overlay state for one coordinator. */
const DEFAULT_PRESENCE_ACTORS = 32;
/** Bounds selection payload and overlay work for each actor. */
const DEFAULT_PRESENCE_RANGES_PER_ACTOR = 8;

/** Ephemeral presence lifecycle; it never calls a document mutation API. */
export class PresenceCoordinator {
  private readonly listeners = new Set<PresenceListener>();
  private readonly remote = new Map<string, ReceivedPresence>();
  private readonly abort_controller = new AbortController();
  private readonly dispose_selection: () => void;
  private readonly dispose_active_sheet: () => void;
  private readonly dispose_transport?: () => void;
  private readonly now: () => number;
  private readonly heartbeat_ms: number;
  private readonly timeout_ms: number;
  private readonly max_actors: number;
  private readonly max_ranges: number;
  private heartbeat_timer?: number;
  private destroyed = false;

  /**
   * Starts sharing `grid`'s selection and showing other collaborators' selections.
   *
   * @throws SheetwriteError with code `invalid-argument` when `options.actor.id` is empty.
   */
  constructor(
    private readonly grid: Grid,
    private readonly transport: PresenceTransport,
    private readonly options: PresenceCoordinatorOptions,
  ) {
    if (!options.actor.id) {
      throw new SheetwriteError("invalid-argument", "presence", "Presence actor ID is required");
    }
    this.now = options.now ?? Date.now;
    this.heartbeat_ms = options.heartbeatMs ?? DEFAULT_PRESENCE_HEARTBEAT_MS;
    this.timeout_ms = options.timeoutMs ?? DEFAULT_PRESENCE_TIMEOUT_MS;
    this.max_actors = Math.max(1, options.maxActors ?? DEFAULT_PRESENCE_ACTORS);
    this.max_ranges = Math.max(1, options.maxRangesPerActor ?? DEFAULT_PRESENCE_RANGES_PER_ACTOR);
    this.dispose_selection = grid.on("selection", () => this.queue_publish());
    this.dispose_active_sheet = grid.on("active-sheet", () => this.queue_publish());
    this.dispose_transport = transport.subscribe(
      (message) => this.receive(message),
      this.abort_controller.signal,
    );
    if (this.heartbeat_ms > 0 && typeof window !== "undefined") {
      this.heartbeat_timer = window.setInterval(() => {
        this.pruneStale();
        this.queue_publish();
      }, this.heartbeat_ms);
    }
    this.queue_publish();
  }

  /** Calls `listener` on each presence event; returns a function that removes it. */
  on(listener: PresenceListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** The latest message of each collaborator that has not expired. */
  remotePresence(): readonly PresenceMessage[] {
    return [...this.remote.values()].map(({ message }) => clone_presence_message(message));
  }

  /** Sends this user's presence at once; a failure is reported as an `error` event. */
  async publishNow(): Promise<void> {
    if (this.destroyed) return;
    try {
      const privacy = this.options.privacy;
      const actor: PresenceActor = {
        id: this.options.actor.id,
        ...(privacy?.shareDisplayName === false || !this.options.actor.displayName
          ? {}
          : { displayName: this.options.actor.displayName }),
        ...(this.options.actor.color ? { color: this.options.actor.color } : {}),
      };
      const sheet = this.active_sheet();
      const message: PresenceMessage = {
        actor,
        activeSheet: sheet.id,
        selections:
          privacy?.shareSelection === false
            ? []
            : selection_ranges(this.grid.getSelection(), sheet).slice(0, this.max_ranges),
        sentAt: this.now(),
      };
      await this.transport.publish(clone_presence_message(message), this.abort_controller.signal);
      if (!this.destroyed)
        this.emit({ type: "published", message: clone_presence_message(message) });
    } catch (error) {
      if (!this.destroyed) {
        this.emit({
          type: "error",
          error: normalizeSheetwriteError(error, "presence-failed", "presence", {
            action: "publish",
          }),
        });
      }
    }
  }

  /** Removes collaborators silent for longer than `timeoutMs`; the heartbeat also calls it. */
  pruneStale(): void {
    if (this.destroyed) return;
    const cutoff = this.now() - this.timeout_ms;
    let changed = false;
    for (const [actor_id, entry] of this.remote) {
      if (entry.receivedAt > cutoff) continue;
      this.remote.delete(actor_id);
      changed = true;
      this.emit({ type: "expired", actorId: actor_id });
    }
    if (changed) this.paint_presence();
  }

  /** Stops sharing, removes other collaborators' selections from the grid, and drops listeners. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.abort_controller.abort();
    this.dispose_selection();
    this.dispose_active_sheet();
    this.dispose_transport?.();
    if (this.heartbeat_timer !== undefined && typeof window !== "undefined") {
      window.clearInterval(this.heartbeat_timer);
    }
    this.remote.clear();
    this.grid.setPresenceOverlays(null);
    this.listeners.clear();
  }

  private receive(input: PresenceMessage): void {
    if (this.destroyed || this.options.privacy?.receivePresence === false) return;
    const message = normalize_presence_message(input, this.max_ranges);
    if (!message || message.actor.id === this.options.actor.id) return;
    if (this.options.privacy?.allowActor && !this.options.privacy.allowActor(message.actor)) return;

    if (!this.remote.has(message.actor.id) && this.remote.size >= this.max_actors) {
      let oldest_id: string | undefined;
      let oldest_at = Number.POSITIVE_INFINITY;
      for (const [actor_id, entry] of this.remote) {
        if (entry.receivedAt >= oldest_at) continue;
        oldest_id = actor_id;
        oldest_at = entry.receivedAt;
      }
      if (oldest_id) this.remote.delete(oldest_id);
    }
    this.remote.set(message.actor.id, { message, receivedAt: this.now() });
    this.paint_presence();
    this.emit({ type: "updated", actorId: message.actor.id });
  }

  private active_sheet(): Sheet {
    const workbook = this.grid.store.getWorkbook();
    const active = this.grid.getActiveSheet();
    const sheet = workbook.sheets.find((candidate) => candidate.id === active);
    if (!sheet) throw new Error(`Presence active sheet does not exist: ${active}`);
    return sheet;
  }

  private paint_presence(): void {
    const overlays: PresenceOverlay[] = [];
    for (const { message } of this.remote.values()) {
      overlays.push({
        actorId: message.actor.id,
        ...(message.actor.displayName ? { displayName: message.actor.displayName } : {}),
        color: message.actor.color ?? "#2563eb",
        activeSheet: message.activeSheet,
        ranges: message.selections,
      });
    }
    this.grid.setPresenceOverlays(overlays);
  }

  private queue_publish(): void {
    void this.publishNow();
  }

  private emit(event: PresenceCoordinatorEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}

/** Stable host-provided identity displayed on a comment message. */
export interface CommentAuthorRef {
  /** Stable user ID, set by the server. */
  id: string;
  /** Name shown on the message. */
  displayName?: string;
  /** URL of the author's picture. */
  avatarUrl?: string;
}

/** Document location to which a comment thread is attached. */
export type CommentAnchor =
  | { kind: "cell"; address: { sheet: string; row: number; col: number } }
  | { kind: "range"; range: Range };

/** One immutable author message in a comment thread. */
export interface CommentMessage {
  /** Stable message ID, unique in the thread. */
  id: string;
  /** Who wrote the message; the server sets it. */
  author: CommentAuthorRef;
  /** The message text. */
  body: string;
  /** When the message was written, as a timestamp string the server sets. */
  createdAt: string;
  /** When the message was last edited, as a timestamp string the server sets. */
  editedAt?: string;
}

/** Versioned discussion anchored to a document location. */
export interface CommentThread {
  /** Stable thread ID. */
  id: string;
  /** ID of the document the thread belongs to. */
  documentId: string;
  /** The cell or range the thread is attached to. */
  anchor: CommentAnchor;
  /** The thread's version number, an integer the server sets. */
  version: number;
  /** The messages, oldest first; there is always at least one. */
  messages: readonly CommentMessage[];
  /** Whether the thread is marked as resolved. */
  resolved: boolean;
  /** Who resolved the thread; required when `resolved` is `true`. */
  resolvedBy?: CommentAuthorRef;
  /** When the thread was resolved, as a timestamp string; required when `resolved` is `true`. */
  resolvedAt?: string;
}

/** Serializable operation that creates or updates comment state. */
export type CommentMutation =
  | {
      kind: "create";
      threadId: string;
      messageId: string;
      anchor: CommentAnchor;
      body: string;
    }
  | { kind: "reply"; threadId: string; messageId: string; body: string }
  | { kind: "resolve"; threadId: string; resolved: boolean };

/** Versioned comment mutation submitted to a host adapter. */
export interface CommentMutationRequest {
  /** ID of the document the comment belongs to. */
  documentId: string;
  /** The comment version the client last saw. */
  baseVersion: number;
  /** Client-chosen ID; a retried request with the same ID must apply only once. */
  clientMutationId: string;
  /** The change to make. */
  mutation: CommentMutation;
  /** Aborts when the coordinator stops waiting for the call. */
  signal?: AbortSignal;
}

/** Applied, duplicate, or conflict acknowledgement for a comment mutation. */
export type CommentMutationResponse =
  | {
      status: "applied";
      version: number;
      clientMutationId: string;
      thread: CommentThread;
    }
  | { status: "duplicate"; version: number; clientMutationId: string }
  | { status: "conflict"; currentVersion: number };

/** Versioned comment-thread listing returned by a host adapter. */
export interface CommentListResult {
  /** The document's comment version at the time of the listing. */
  version: number;
  /** Every comment thread of the document. */
  threads: readonly CommentThread[];
}

/** Comment mutation paired with its assigned server version. */
export interface VersionedCommentEvent {
  /** The comment version this change made; one more than the previous one. */
  version: number;
  /** The thread after the change. */
  thread: CommentThread;
  /** ID of the client request that made the change, when known. */
  clientMutationId?: string;
}

/** Host persistence contract for versioned comment threads. */
export interface CommentAdapter {
  /** Fetches every comment thread of the document. */
  listComments(documentId: string, signal?: AbortSignal): Promise<CommentListResult>;
  /** Sends one change to the server and returns its answer. */
  mutateComment(request: CommentMutationRequest): Promise<CommentMutationResponse>;
  /** Calls `listener` for each change other clients make; may return a function that stops it. */
  subscribeComments?(
    documentId: string,
    listener: (event: VersionedCommentEvent) => void,
    signal?: AbortSignal,
  ): undefined | (() => void);
}

/** Document identity and initial version for comment coordination. */
export interface CommentCoordinatorOptions {
  /** ID of the document whose comments to coordinate. */
  documentId: string;
  /** The comment version already known, such as from server-rendered data; defaults to 0. */
  serverVersion?: number;
}

/** State transition emitted by the comment coordinator. */
export type CommentCoordinatorEvent =
  | { type: "loaded"; version: number; threads: readonly CommentThread[] }
  | { type: "changed"; version: number; thread: CommentThread }
  | { type: "conflict"; currentVersion: number }
  | { type: "gap"; expectedVersion: number; receivedVersion: number }
  | { type: "error"; error: SheetwriteError };

type CommentListener = (event: CommentCoordinatorEvent) => void;

/** Transport/auth-neutral comment state with server-owned author and timestamp fields. */
export class CommentCoordinator {
  private readonly abort_controller = new AbortController();
  private readonly listeners = new Set<CommentListener>();
  private readonly threads = new Map<string, CommentThread>();
  private readonly dispose_remote?: () => void;
  private version: number;
  private destroyed = false;

  /** Creates the coordinator and subscribes to other clients' changes; call `load` next. */
  constructor(
    private readonly adapter: CommentAdapter,
    private readonly options: CommentCoordinatorOptions,
  ) {
    this.version = options.serverVersion ?? 0;
    this.dispose_remote = adapter.subscribeComments?.(
      options.documentId,
      (event) => this.apply_versioned_event(event),
      this.abort_controller.signal,
    );
  }

  /** The newest comment version this client has seen. */
  get serverVersion(): number {
    return this.version;
  }

  /** Calls `listener` on each comment event; returns a function that removes it. */
  on(listener: CommentListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Copies of the current threads. */
  commentThreads(): readonly CommentThread[] {
    return [...this.threads.values()].map(clone_comment_thread);
  }

  /**
   * Fetches every thread through the adapter and replaces the local ones.
   *
   * @throws SheetwriteError with code `comment-failed` when the adapter fails or returns invalid data.
   */
  async load(signal?: AbortSignal): Promise<readonly CommentThread[]> {
    signal = signal
      ? AbortSignal.any([signal, this.abort_controller.signal])
      : this.abort_controller.signal;
    try {
      signal.throwIfAborted();
      const result = await this.adapter.listComments(this.options.documentId, signal);
      signal.throwIfAborted();
      validate_adapter_version(result.version);
      const next = new Map<string, CommentThread>();
      for (const input of result.threads) {
        const thread = validate_comment_thread(input, this.options.documentId);
        next.set(thread.id, thread);
      }
      if (this.destroyed || result.version < this.version) return this.commentThreads();

      this.threads.clear();
      for (const [id, thread] of next) this.threads.set(id, thread);
      this.version = result.version;
      const threads = this.commentThreads();
      this.emit({ type: "loaded", version: this.version, threads });
      return threads;
    } catch (error) {
      signal.throwIfAborted();
      const failure = normalizeSheetwriteError(error, "comment-failed", "comment", {
        action: "load",
      });
      if (!this.destroyed) this.emit({ type: "error", error: failure });
      throw failure;
    }
  }

  /** Starts a new thread at `anchor` with its first message. */
  create(
    threadId: string,
    messageId: string,
    anchor: CommentAnchor,
    body: string,
    clientMutationId: string,
    signal?: AbortSignal,
  ): Promise<CommentMutationResponse> {
    return this.mutate(
      { kind: "create", threadId, messageId, anchor, body },
      clientMutationId,
      signal,
    );
  }

  /** Adds a message to an existing thread. */
  reply(
    threadId: string,
    messageId: string,
    body: string,
    clientMutationId: string,
    signal?: AbortSignal,
  ): Promise<CommentMutationResponse> {
    return this.mutate({ kind: "reply", threadId, messageId, body }, clientMutationId, signal);
  }

  /** Marks a thread as resolved, or as open again with `resolved: false`. */
  resolve(
    threadId: string,
    resolved: boolean,
    clientMutationId: string,
    signal?: AbortSignal,
  ): Promise<CommentMutationResponse> {
    return this.mutate({ kind: "resolve", threadId, resolved }, clientMutationId, signal);
  }

  /**
   * Sends one change through the adapter; `create`, `reply` and `resolve` call it.
   *
   * @throws SheetwriteError with code `comment-failed` when the adapter fails or returns invalid data.
   */
  async mutate(
    mutation: CommentMutation,
    clientMutationId: string,
    signal?: AbortSignal,
  ): Promise<CommentMutationResponse> {
    signal = signal
      ? AbortSignal.any([signal, this.abort_controller.signal])
      : this.abort_controller.signal;
    try {
      signal.throwIfAborted();
      const response = await this.adapter.mutateComment({
        documentId: this.options.documentId,
        baseVersion: this.version,
        clientMutationId,
        mutation: cloneJsonValue(mutation),
        signal,
      });
      signal.throwIfAborted();
      if (response.status === "conflict") {
        validate_adapter_version(response.currentVersion);
        this.version = Math.max(this.version, response.currentVersion);
        this.emit({ type: "conflict", currentVersion: this.version });
        return response;
      }

      validate_adapter_version(response.version);
      if (response.status === "applied") {
        const thread = validate_comment_thread(response.thread, this.options.documentId);
        if (thread.id !== mutation.threadId) {
          throw new Error("Comment response changed the stable thread ID");
        }
        if (response.version > this.version) {
          this.threads.set(thread.id, thread);
          this.version = response.version;
          this.emit({
            type: "changed",
            version: response.version,
            thread: clone_comment_thread(thread),
          });
        }
      } else {
        this.version = Math.max(this.version, response.version);
      }
      return response;
    } catch (error) {
      signal.throwIfAborted();
      const failure = normalizeSheetwriteError(error, "comment-failed", "comment", {
        action: "mutate",
        mutation: mutation.kind,
      });
      if (!this.destroyed) this.emit({ type: "error", error: failure });
      throw failure;
    }
  }

  /** Cancels pending calls, stops the subscription and drops threads and listeners. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.abort_controller.abort();
    this.dispose_remote?.();
    this.threads.clear();
    this.listeners.clear();
  }

  private apply_versioned_event(event: VersionedCommentEvent): void {
    if (this.destroyed) return;
    if (event.version <= this.version) return;
    if (event.version !== this.version + 1) {
      this.emit({
        type: "gap",
        expectedVersion: this.version + 1,
        receivedVersion: event.version,
      });
      return;
    }
    try {
      const thread = validate_comment_thread(event.thread, this.options.documentId);
      this.threads.set(thread.id, thread);
      this.version = event.version;
      this.emit({ type: "changed", version: event.version, thread: clone_comment_thread(thread) });
    } catch (error) {
      this.emit({
        type: "error",
        error: normalizeSheetwriteError(error, "comment-failed", "comment", {
          action: "receive",
        }),
      });
    }
  }

  private emit(event: CommentCoordinatorEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}

function selection_ranges(selection: Selection | null, sheet: Sheet): Range[] {
  if (!selection) return [];
  switch (selection.kind) {
    case "cell":
      return [cellRange(selection.addr)];
    case "range":
      return [cloneJsonValue(selection.range)];
    case "row":
      return sheet.columns.length === 0
        ? []
        : [
            {
              sheet: selection.sheet,
              start: { row: selection.row, col: 0 },
              end: { row: selection.row, col: sheet.columns.length - 1 },
            },
          ];
    case "column":
      return sheet.rowCount === 0
        ? []
        : [
            {
              sheet: selection.sheet,
              start: { row: 0, col: selection.col },
              end: { row: sheet.rowCount - 1, col: selection.col },
            },
          ];
    case "multi":
      return cloneJsonValue(selection.ranges);
  }
}

function normalize_presence_message(
  input: PresenceMessage,
  max_ranges: number,
): PresenceMessage | null {
  if (
    !input ||
    typeof input.actor?.id !== "string" ||
    input.actor.id.length === 0 ||
    typeof input.activeSheet !== "string" ||
    !Array.isArray(input.selections) ||
    !Number.isFinite(input.sentAt)
  ) {
    return null;
  }
  const selections = input.selections
    .filter(
      (range) =>
        typeof range?.sheet === "string" &&
        Number.isFinite(range.start?.row) &&
        Number.isFinite(range.start?.col) &&
        Number.isFinite(range.end?.row) &&
        Number.isFinite(range.end?.col),
    )
    .slice(0, max_ranges)
    .map((range) => cloneJsonValue(range));
  return {
    actor: {
      id: input.actor.id,
      ...(input.actor.displayName ? { displayName: input.actor.displayName } : {}),
      ...(input.actor.color ? { color: input.actor.color } : {}),
    },
    activeSheet: input.activeSheet,
    selections,
    sentAt: input.sentAt,
  };
}

function clone_presence_message(message: PresenceMessage): PresenceMessage {
  return cloneJsonValue(message);
}

function validate_adapter_version(version: number): void {
  if (!Number.isSafeInteger(version) || version < 0) {
    throw new Error("Collaboration adapter returned an invalid version");
  }
}

function validate_comment_thread(input: CommentThread, document_id: string): CommentThread {
  if (
    !input?.id ||
    input.documentId !== document_id ||
    !Number.isInteger(input.version) ||
    !Array.isArray(input.messages) ||
    input.messages.length === 0
  ) {
    throw new Error("Comment adapter returned an invalid thread");
  }
  for (const message of input.messages) {
    if (
      !message.id ||
      !message.author?.id ||
      !message.createdAt ||
      typeof message.body !== "string"
    ) {
      throw new Error("Comment authorship and timestamps must be supplied by the server adapter");
    }
  }
  if (input.resolved && (!input.resolvedBy?.id || !input.resolvedAt)) {
    throw new Error("Resolved comments require server-owned resolver and timestamp metadata");
  }
  return clone_comment_thread(input);
}

function clone_comment_thread(thread: CommentThread): CommentThread {
  return cloneJsonValue(thread);
}
