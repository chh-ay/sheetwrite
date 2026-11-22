import {
  type DocumentOp,
  MemoryPersistenceAdapter,
  type PersistenceAdapter,
  type PersistenceBatchCommitRequest,
  type PersistenceCommitRequest,
  type PersistenceCommitResponse,
  type PresenceMessage,
  type PresenceTransport,
  type RemoteOperationSource,
  type VersionedOperation,
  type WorkbookSnapshot,
} from "@sheetwrite/core";

/**
 * In-page stand-in for the collaboration backend a host owns in production.
 *
 * It sequences commits through the database-neutral reference adapter and
 * fans applied operations out to every subscribed client — the exact
 * `PersistenceAdapter` + `RemoteOperationSource` pair a real deployment
 * implements over its own transport and database. Demo-only: nothing here
 * leaves the browser tab.
 */
export class ShowcaseCollaborationServer implements PersistenceAdapter, RemoteOperationSource {
  private readonly adapter: MemoryPersistenceAdapter;
  private readonly listeners = new Set<(operation: VersionedOperation) => void>();
  private readonly commit_listeners = new Set<(record: ShowcaseCommitRecord) => void>();
  private readonly versions = new Map<string, number>();
  private next_server_mutation = 1;

  constructor(...snapshots: readonly WorkbookSnapshot[]) {
    this.adapter = new MemoryPersistenceAdapter(...snapshots);
    for (const snapshot of snapshots) {
      if (snapshot.documentId) this.versions.set(snapshot.documentId, snapshot.version ?? 0);
    }
  }

  load(documentId: string, signal?: AbortSignal): Promise<WorkbookSnapshot> {
    return this.adapter.load(documentId, signal);
  }

  async commit(request: PersistenceCommitRequest): Promise<PersistenceCommitResponse> {
    const response = await this.adapter.commit(request);
    if (response.status === "applied") {
      this.versions.set(request.documentId, response.version);
      this.broadcast({
        version: response.version,
        clientMutationId: request.clientMutationId,
        operations: request.operations,
      });
    }
    const record: ShowcaseCommitRecord = {
      documentId: request.documentId,
      clientMutationId: request.clientMutationId,
      baseVersion: request.baseVersion,
      status: response.status,
      version: response.status === "conflict" ? response.currentVersion : response.version,
      operationCount: request.operations.length,
    };
    for (const listener of this.commit_listeners) listener(record);
    return response;
  }
  async commitBatch(request: PersistenceBatchCommitRequest): Promise<PersistenceCommitResponse> {
    const response = await this.adapter.commitBatch(request);
    if (response.status === "applied") {
      this.versions.set(request.documentId, response.version);
      let offset = 0;
      request.versionOperationCounts.forEach((count, index) => {
        this.broadcast({
          version: request.baseVersion + index + 1,
          clientMutationId: request.clientMutationId,
          operations: request.operations.slice(offset, offset + count),
          batch: { index, count: request.versionOperationCounts.length },
        });
        offset += count;
      });
    }
    const record: ShowcaseCommitRecord = {
      documentId: request.documentId,
      clientMutationId: request.clientMutationId,
      baseVersion: request.baseVersion,
      status: response.status,
      version: response.status === "conflict" ? response.currentVersion : response.version,
      operationCount: request.operations.length,
      batchVersions: request.versionOperationCounts.length,
    };
    for (const listener of this.commit_listeners) listener(record);
    return response;
  }

  /** Observes every sequencing decision: applied, duplicate, and conflict acks. */
  observeCommits(listener: (record: ShowcaseCommitRecord) => void): () => void {
    this.commit_listeners.add(listener);
    return () => this.commit_listeners.delete(listener);
  }

  /** Latest version the server has sequenced for a document. */
  headVersion(documentId: string): number {
    return this.versions.get(documentId) ?? 0;
  }

  subscribe(listener: (operation: VersionedOperation) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Commits a server-authored transaction against the current head version,
   * so any client still holding an older base version hits a real
   * base-version conflict on its next send.
   */
  async commitServerOperations(
    documentId: string,
    operations: readonly DocumentOp[],
  ): Promise<number> {
    const response = await this.commit({
      documentId,
      baseVersion: this.versions.get(documentId) ?? 0,
      clientMutationId: `showcase-server-${this.next_server_mutation++}`,
      operations,
    });
    if (response.status !== "applied") {
      throw new Error(`Server-authored showcase commit was not applied: ${response.status}`);
    }
    return response.version;
  }

  private broadcast(operation: VersionedOperation): void {
    for (const listener of this.listeners) listener(structuredClone(operation));
  }
}

/**
 * Loss-free same-tab presence fanout. Each client takes one `endpoint()`;
 * in production this is the host's websocket or realtime channel.
 */
export class ShowcasePresenceBus {
  private readonly listeners = new Set<(message: PresenceMessage) => void>();

  endpoint(): PresenceTransport {
    return {
      publish: (message) => {
        for (const listener of this.listeners) listener(structuredClone(message));
      },
      subscribe: (listener) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
      },
    };
  }
}

/** Stable identity each collaboration proof client publishes over presence. */
export interface ShowcaseActor {
  id: string;
  displayName: string;
  color: string;
}

/** The two demo collaborators; a real deployment issues identities from its auth system. */
export const COLLABORATION_ACTORS: readonly [ShowcaseActor, ShowcaseActor] = [
  { id: "actor-ana", displayName: "Ana", color: "#e11d48" },
  { id: "actor-bram", displayName: "Bram", color: "#0ea5e9" },
];

/** One sequenced commit acknowledgement observed at the demo server. */
export interface ShowcaseCommitRecord {
  documentId: string;
  clientMutationId: string;
  baseVersion: number;
  status: "applied" | "duplicate" | "conflict";
  /** Head version after the request: assigned, previously assigned, or current. */
  version: number;
  operationCount: number;
  batchVersions?: number;
}

/** Transit fault raised by {@link ShowcaseNetworkLink} fault injection. */
export class ShowcaseLinkError extends Error {
  constructor(
    readonly reason: "offline" | "ack-lost",
    message: string,
  ) {
    super(message);
    this.name = "ShowcaseLinkError";
  }
}

/** Observable wire state of one simulated client network link. */
export interface ShowcaseLinkState {
  connected: boolean;
  /** Broadcasts parked while the link is offline; replayed in order on reconnect. */
  queuedBroadcasts: number;
  /** Broadcasts held back explicitly to manufacture a version gap. */
  heldBroadcasts: number;
  /** Whether the next applied commit's acknowledgement will be dropped. */
  dropNextAcknowledgement: boolean;
}

/**
 * One client's simulated network path to the demo server. It reproduces the
 * transport faults a host has to survive — lost acknowledgements, offline
 * windows, and out-of-order delivery — without touching protocol semantics:
 * the server still sequences every commit exactly once.
 */
export class ShowcaseNetworkLink implements PersistenceAdapter, RemoteOperationSource {
  private listener?: (operation: VersionedOperation) => void;
  private dispose_upstream?: () => void;
  private readonly queued: VersionedOperation[] = [];
  private readonly held: VersionedOperation[] = [];
  /** Broadcasts that arrived while no coordinator was subscribed (boot, remount). */
  private readonly unclaimed: VersionedOperation[] = [];
  /** Versions at or below this are already in the snapshot the next coordinator mounts. */
  private snapshot_version = -1;
  private readonly suppressed_echoes = new Set<string>();
  private readonly state_listeners = new Set<(state: ShowcaseLinkState) => void>();
  private connected_state = true;
  private drop_next_ack = false;
  private hold_next = false;

  /**
   * Broadcast-less adapters (e.g. the database proof) are valid servers too.
   * The link listens from construction, so a commit sequenced between a
   * snapshot load and the coordinator subscribing is kept, not lost.
   */
  constructor(private readonly server: PersistenceAdapter & Partial<RemoteOperationSource>) {
    this.dispose_upstream = this.server.subscribe?.((operation) => this.receive(operation));
  }

  /**
   * The next coordinator mounts a snapshot at `version`: drop broadcasts it
   * already contains, keep newer ones for delivery on subscribe.
   */
  startFrom(version: number): void {
    this.snapshot_version = version;
    const newer = this.unclaimed.filter((operation) => operation.version > version);
    this.unclaimed.splice(0, this.unclaimed.length, ...newer);
  }

  get connected(): boolean {
    return this.connected_state;
  }

  state(): ShowcaseLinkState {
    return {
      connected: this.connected_state,
      queuedBroadcasts: this.queued.length,
      heldBroadcasts: this.held.length,
      dropNextAcknowledgement: this.drop_next_ack,
    };
  }

  subscribeState(listener: (state: ShowcaseLinkState) => void): () => void {
    this.state_listeners.add(listener);
    return () => this.state_listeners.delete(listener);
  }

  /** Reconnecting replays every broadcast queued while offline, in order. */
  setConnected(connected: boolean): void {
    if (this.connected_state === connected) return;
    this.connected_state = connected;
    if (connected) {
      while (this.connected_state && this.queued.length > 0) {
        const operation = this.queued.shift();
        if (operation) this.deliver(operation);
      }
    }
    this.publish_state();
  }

  /** The next applied commit succeeds server-side but its acknowledgement is lost. */
  dropNextAcknowledgement(): void {
    this.drop_next_ack = true;
    this.publish_state();
  }

  /** Parks the next inbound broadcast so later versions arrive first (a version gap). */
  holdNextBroadcast(): void {
    this.hold_next = true;
    this.publish_state();
  }

  /** Delivers every held broadcast in version order and cancels a pending hold, closing the gap. */
  releaseHeldBroadcasts(): void {
    this.hold_next = false;
    const releasing = this.held.splice(0).sort((a, b) => a.version - b.version);
    for (const operation of releasing) this.deliver(operation);
    this.publish_state();
  }

  /** Drops parked traffic after a remount made it stale (e.g. conflict recovery). */
  discardParkedBroadcasts(): void {
    this.held.length = 0;
    this.queued.length = 0;
    this.hold_next = false;
    this.publish_state();
  }

  load(documentId: string, signal?: AbortSignal): Promise<WorkbookSnapshot> {
    return this.server.load(documentId, signal);
  }

  commit(request: PersistenceCommitRequest): Promise<PersistenceCommitResponse> {
    return this.send(request, () => this.server.commit(request));
  }

  commitBatch(request: PersistenceBatchCommitRequest): Promise<PersistenceCommitResponse> {
    return this.send(request, () => {
      if (!this.server.commitBatch) throw new Error("This adapter cannot commit an atomic batch.");
      return this.server.commitBatch(request);
    });
  }

  private async send(
    request: PersistenceCommitRequest,
    commit: () => Promise<PersistenceCommitResponse>,
  ): Promise<PersistenceCommitResponse> {
    if (!this.connected_state) {
      throw new ShowcaseLinkError("offline", "The client link is offline; the commit never left");
    }
    const drop_ack = this.drop_next_ack;
    if (drop_ack) {
      this.drop_next_ack = false;
      // Suppress this client's own echo broadcast too, so the pending commit
      // genuinely survives until an explicit idempotent retry.
      this.suppressed_echoes.add(request.clientMutationId);
      this.publish_state();
    }
    const response = await commit();
    if (drop_ack) {
      if (response.status === "applied") {
        throw new ShowcaseLinkError(
          "ack-lost",
          `The server applied ${request.clientMutationId}, but its acknowledgement was lost in transit`,
        );
      }
      this.suppressed_echoes.delete(request.clientMutationId);
    }
    return response;
  }

  subscribe(listener: (operation: VersionedOperation) => void): () => void {
    this.listener = listener;
    const unclaimed = this.unclaimed.splice(0).sort((a, b) => a.version - b.version);
    for (const operation of unclaimed) this.listener?.(operation);
    return () => {
      if (this.listener === listener) this.listener = undefined;
    };
  }

  destroy(): void {
    this.dispose_upstream?.();
    this.dispose_upstream = undefined;
    this.listener = undefined;
    this.queued.length = 0;
    this.unclaimed.length = 0;
    this.held.length = 0;
    this.suppressed_echoes.clear();
    this.state_listeners.clear();
  }

  private receive(operation: VersionedOperation): void {
    if (operation.version <= this.snapshot_version) return;
    if (
      operation.clientMutationId !== undefined &&
      this.suppressed_echoes.has(operation.clientMutationId)
    ) {
      if (!operation.batch || operation.batch.index === operation.batch.count - 1) {
        this.suppressed_echoes.delete(operation.clientMutationId);
      }
      this.publish_state();
      return;
    }
    if (!this.connected_state) {
      this.queued.push(operation);
      this.publish_state();
      return;
    }
    if (this.hold_next) {
      this.hold_next = false;
      this.held.push(operation);
      this.publish_state();
      return;
    }
    this.deliver(operation);
  }

  /**
   * Hands a broadcast to the subscribed coordinator, or keeps it for the next
   * one while a client remounts. Versions its snapshot already holds are dropped.
   */
  private deliver(operation: VersionedOperation): void {
    if (operation.version <= this.snapshot_version) return;
    if (this.listener) this.listener(operation);
    else this.unclaimed.push(operation);
  }

  private publish_state(): void {
    const state = this.state();
    for (const listener of this.state_listeners) listener(state);
  }
}
