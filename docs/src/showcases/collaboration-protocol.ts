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
  private readonly commitListeners = new Set<(record: ShowcaseCommitRecord) => void>();
  private readonly versions = new Map<string, number>();
  private nextServerMutation = 1;

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
    for (const listener of this.commitListeners) listener(record);
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
    for (const listener of this.commitListeners) listener(record);
    return response;
  }

  /** Observes every sequencing decision: applied, duplicate, and conflict acks. */
  observeCommits(listener: (record: ShowcaseCommitRecord) => void): () => void {
    this.commitListeners.add(listener);
    return () => this.commitListeners.delete(listener);
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
      clientMutationId: `showcase-server-${this.nextServerMutation++}`,
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
  private disposeUpstream?: () => void;
  private readonly queued: VersionedOperation[] = [];
  private readonly held: VersionedOperation[] = [];
  /** Broadcasts that arrived while no coordinator was subscribed (boot, remount). */
  private readonly unclaimed: VersionedOperation[] = [];
  /** Versions at or below this are already in the snapshot the next coordinator mounts. */
  private snapshotVersion = -1;
  private readonly suppressedEchoes = new Set<string>();
  private readonly stateListeners = new Set<(state: ShowcaseLinkState) => void>();
  private connectedState = true;
  private dropNextAck = false;
  private holdNext = false;

  /**
   * Broadcast-less adapters (e.g. the database proof) are valid servers too.
   * The link listens from construction, so a commit sequenced between a
   * snapshot load and the coordinator subscribing is kept, not lost.
   */
  constructor(private readonly server: PersistenceAdapter & Partial<RemoteOperationSource>) {
    this.disposeUpstream = this.server.subscribe?.((operation) => this.receive(operation));
  }

  /**
   * The next coordinator mounts a snapshot at `version`: drop broadcasts it
   * already contains, keep newer ones for delivery on subscribe.
   */
  startFrom(version: number): void {
    this.snapshotVersion = version;
    const newer = this.unclaimed.filter((operation) => operation.version > version);
    this.unclaimed.splice(0, this.unclaimed.length, ...newer);
  }

  get connected(): boolean {
    return this.connectedState;
  }

  state(): ShowcaseLinkState {
    return {
      connected: this.connectedState,
      queuedBroadcasts: this.queued.length,
      heldBroadcasts: this.held.length,
      dropNextAcknowledgement: this.dropNextAck,
    };
  }

  subscribeState(listener: (state: ShowcaseLinkState) => void): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  /** Reconnecting replays every broadcast queued while offline, in order. */
  setConnected(connected: boolean): void {
    if (this.connectedState === connected) return;
    this.connectedState = connected;
    if (connected) {
      while (this.connectedState && this.queued.length > 0) {
        const operation = this.queued.shift();
        if (operation) this.deliver(operation);
      }
    }
    this.publishState();
  }

  /** The next applied commit succeeds server-side but its acknowledgement is lost. */
  dropNextAcknowledgement(): void {
    this.dropNextAck = true;
    this.publishState();
  }

  /** Parks the next inbound broadcast so later versions arrive first (a version gap). */
  holdNextBroadcast(): void {
    this.holdNext = true;
    this.publishState();
  }

  /** Delivers every held broadcast in version order and cancels a pending hold, closing the gap. */
  releaseHeldBroadcasts(): void {
    this.holdNext = false;
    const releasing = this.held.splice(0).sort((a, b) => a.version - b.version);
    for (const operation of releasing) this.deliver(operation);
    this.publishState();
  }

  /** Drops parked traffic after a remount made it stale (e.g. conflict recovery). */
  discardParkedBroadcasts(): void {
    this.held.length = 0;
    this.queued.length = 0;
    this.holdNext = false;
    this.publishState();
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
    if (!this.connectedState) {
      throw new ShowcaseLinkError("offline", "The client link is offline; the commit never left");
    }
    const dropAck = this.dropNextAck;
    if (dropAck) {
      this.dropNextAck = false;
      // Suppress this client's own echo broadcast too, so the pending commit
      // genuinely survives until an explicit idempotent retry.
      this.suppressedEchoes.add(request.clientMutationId);
      this.publishState();
    }
    const response = await commit();
    if (dropAck) {
      if (response.status === "applied") {
        throw new ShowcaseLinkError(
          "ack-lost",
          `The server applied ${request.clientMutationId}, but its acknowledgement was lost in transit`,
        );
      }
      this.suppressedEchoes.delete(request.clientMutationId);
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
    this.disposeUpstream?.();
    this.disposeUpstream = undefined;
    this.listener = undefined;
    this.queued.length = 0;
    this.unclaimed.length = 0;
    this.held.length = 0;
    this.suppressedEchoes.clear();
    this.stateListeners.clear();
  }

  private receive(operation: VersionedOperation): void {
    if (operation.version <= this.snapshotVersion) return;
    if (
      operation.clientMutationId !== undefined &&
      this.suppressedEchoes.has(operation.clientMutationId)
    ) {
      if (!operation.batch || operation.batch.index === operation.batch.count - 1) {
        this.suppressedEchoes.delete(operation.clientMutationId);
      }
      this.publishState();
      return;
    }
    if (!this.connectedState) {
      this.queued.push(operation);
      this.publishState();
      return;
    }
    if (this.holdNext) {
      this.holdNext = false;
      this.held.push(operation);
      this.publishState();
      return;
    }
    this.deliver(operation);
  }

  /**
   * Hands a broadcast to the subscribed coordinator, or keeps it for the next
   * one while a client remounts. Versions its snapshot already holds are dropped.
   */
  private deliver(operation: VersionedOperation): void {
    if (operation.version <= this.snapshotVersion) return;
    if (this.listener) this.listener(operation);
    else this.unclaimed.push(operation);
  }

  private publishState(): void {
    const state = this.state();
    for (const listener of this.stateListeners) listener(state);
  }
}
