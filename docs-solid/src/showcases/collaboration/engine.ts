// The collaboration demo's engine: both clients, the in-page sequencing
// server, the durable outboxes, recovery and the fault drills. Loaded once the
// clients come near the viewport (CollaborationStage.tsx); it writes the
// page's shared state (state.ts).
import "@sheetwrite/core/styles.css";
import { deleteDatabase } from "@docs/lib/delete-database.js";
import { errorText } from "@docs/lib/errors.js";
import { seededRandom } from "@docs/lib/random.js";
import { observeSiteTheme } from "@docs/lib/site-theme.js";
import {
  COLLABORATION_ACTORS,
  type ShowcaseActor,
  ShowcaseCollaborationServer,
  type ShowcaseCommitRecord,
  ShowcaseLinkError,
  ShowcaseNetworkLink,
  ShowcasePresenceBus,
} from "@docs/showcases/collaboration-protocol.js";
import {
  COLLABORATION_DOCUMENT_ID,
  COLLABORATION_FORECAST_ROWS,
  COLLABORATION_TOTAL_CELL,
  COLLABORATION_USAGE_DOCUMENT_ID,
  COLLABORATION_WORKBOOK_COLUMNS,
  COLLABORATION_WORKBOOK_ROWS,
  makeCollaborationSnapshot,
  makeCollaborationUsageSnapshot,
} from "@docs/showcases/collaboration-seed.js";
import { USAGE_RANGE, USAGE_TOTAL_CELL } from "@docs/showcases/scenarios/durable-usage.js";
import {
  type ChangeEvent,
  createGridFromSnapshot,
  type DocumentOp,
  type Grid,
  type HighlightRange,
  initSheetwrite,
  type PersistenceCommitResponse,
  PresenceCoordinator,
  rebaseDocumentOperations,
  SyncCoordinator,
  type WorkbookSnapshot,
} from "@sheetwrite/core";
import { IndexedDbPendingCommitStorage } from "@sheetwrite/core/browser";

import {
  action,
  type ChaosReport,
  CHAOS_DRAIN_MS,
  CLIENT_KEYS,
  type ClientKey,
  EMPTY_CLIENT_VIEW,
  nextLogId,
  patchView,
  pushClientLog,
  SERVER_LOG_LIMIT,
  setBatchReport,
  setChaos,
  setRestoreRunning,
  setServerLog,
  setServerVersion,
  setStatus,
  setStatusDetail,
  setViews,
} from "./state.js";

const SAMPLE_ROW: Record<ClientKey, number> = { a: 0, b: COLLABORATION_FORECAST_ROWS / 2 };
/** Each analyst owns half the forecast, so concurrent edits do not overwrite each other. */
const CHAOS_ROWS: Record<ClientKey, readonly number[]> = {
  a: Array.from({ length: COLLABORATION_FORECAST_ROWS / 2 }, (_, row) => row),
  b: Array.from(
    { length: COLLABORATION_FORECAST_ROWS / 2 },
    (_, row) => row + COLLABORATION_FORECAST_ROWS / 2,
  ),
};
const FORECAST_ADJUSTMENT = 500;
const CHAOS_STORM_MS = 6_000;
const CHAOS_SETTLE_MS = 15_000;
/** Storm progress text refreshes at most this often. */
const CHAOS_PUBLISH_MS = 400;
const CHAOS_TICK_MS = 110;
/** Rows around the Ana/Bram boundary that the chaos test brings on screen. */
const CHAOS_VIEW_ROWS = {
  first: COLLABORATION_FORECAST_ROWS / 2 - 6,
  last: COLLABORATION_FORECAST_ROWS / 2 + 7,
};
/** How long an edited cell stays highlighted on each client. */
const EDIT_FLASH_MS = 900;
/** Larger edits (paste, restore) are not flashed cell by cell. */
const EDIT_FLASH_MAX_CELLS = 64;
const ACTOR_FLASH: Record<ClientKey, string> = {
  a: "rgba(225, 29, 72, 0.32)",
  b: "rgba(14, 165, 233, 0.32)",
};
/**
 * Demo ceilings for the batch proof. The 100,000-cell usage restore is far
 * above one version, so the engine splits it into an atomic batch; the
 * production defaults allow 8 MiB per version and 16 versions per batch.
 */
const DEMO_VERSION_BYTES = 1024 * 1024;
const DEMO_TRANSACTION_BYTES = 1024 * 1024;

const QUEUE_DATABASE: Record<ClientKey, string> = {
  a: "sheetwrite-showcase-collab-ana",
  b: "sheetwrite-showcase-collab-bram",
};

type ConflictResponse = Extract<PersistenceCommitResponse, { status: "conflict" }>;

/**
 * The two documents both clients can mount. The forecast carries every proof
 * except the batch drill; the usage document is only loaded for that drill.
 */
type ShowcaseDocument = "forecast" | "usage";
const DOCUMENT_ID: Record<ShowcaseDocument, string> = {
  forecast: COLLABORATION_DOCUMENT_ID,
  usage: COLLABORATION_USAGE_DOCUMENT_ID,
};

interface ClientRuntime {
  actor: ShowcaseActor;
  /** Boot generation that created this runtime; stale callbacks never touch the queue. */
  generation: number;
  /** Document this client is mounted on; its link talks to that document's server. */
  document: ShowcaseDocument;
  link: ShowcaseNetworkLink;
  storage: IndexedDbPendingCommitStorage;
  grid: Grid;
  sync: SyncCoordinator;
  presence: PresenceCoordinator;
  disposers: Array<() => void>;
}

let nextMutation = 1;

/** Waits between drill steps so the page state and the durable queue keep up. */
function delay(ms: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, ms);
  return promise;
}

/**
 * One sequencer decision in plain words; mutation ids stay out of the UI. Both
 * documents share the log, so usage-document versions carry their document.
 */
function describeServerDecision(record: ShowcaseCommitRecord): string {
  const label =
    record.status === "applied"
      ? "applied to both clients"
      : record.status === "duplicate"
        ? "duplicate acknowledgement"
        : "rejected · client rebases";
  const document = record.documentId === COLLABORATION_USAGE_DOCUMENT_ID ? "Usage " : "";
  return `${document}v${record.version} ${label} · ${record.operationCount} op${
    record.operationCount === 1 ? "" : "s"
  }`;
}

export interface CollaborationEngine {
  sampleEdit(key: ClientKey): void;
  toggleOnline(key: ClientKey, online: boolean): void;
  retryPending(key: ClientKey): void;
  loseNextAck(key: ClientKey): void;
  holdNextBroadcast(key: ClientKey): void;
  releaseHeld(key: ClientKey): void;
  runChaos(): Promise<void>;
  restoreUsage(): void;
  serverEdit(): void;
  resetDemo(): void;
  dispose(): void;
}

/** Starts both clients in their hosts and the in-page server they share. */
export function createCollaborationEngine(
  hosts: Readonly<Record<ClientKey, HTMLElement>>,
): CollaborationEngine {
  /** One sequencing server per document; the usage server starts on first use. */
  let servers: Record<ShowcaseDocument, ShowcaseCollaborationServer | null> = {
    forecast: null,
    usage: null,
  };
  let bus: ShowcasePresenceBus | null = null;
  const clients: Record<ClientKey, ClientRuntime | null> = { a: null, b: null };
  let serverDisposers: Array<() => void> = [];
  /** Document both clients show, or are switching to. */
  let currentDocument: ShowcaseDocument = "forecast";
  /** Serializes document switches so two never interleave their remounts. */
  let switching: Promise<boolean> = Promise.resolve(true);
  /** True while the batch drill runs: nothing may move the clients off its document. */
  let drilling = false;
  /** Last account read per client, kept while the clients show the usage document. */
  const accounts: Record<ClientKey, string> = { a: "the first deal", b: "the first deal" };
  const recovering: Record<ClientKey, boolean> = { a: false, b: false };
  let bootGeneration = 0;
  let bootQueue: Promise<void> = Promise.resolve();
  const flashes: Record<ClientKey, Map<string, HighlightRange & { until: number }>> = {
    a: new Map(),
    b: new Map(),
  };
  const flashTimers: Record<ClientKey, number | null> = { a: null, b: null };
  /** Rows each client shows, refreshed once per frame while it scrolls. */
  const shownRows: Record<ClientKey, { first: number; last: number } | null> = {
    a: null,
    b: null,
  };
  let chaosRun = 0;

  /** Repaint a client's edit highlights and schedule the next expiry. */
  const paintFlashes = (key: ClientKey) => {
    const runtime = clients[key];
    const pending = flashes[key];
    const now = performance.now();
    for (const [id, flash] of pending) if (flash.until <= now) pending.delete(id);
    runtime?.grid.highlightCells(pending.size > 0 ? [...pending.values()] : null);
    const timer = flashTimers[key];
    if (timer !== null) window.clearTimeout(timer);
    flashTimers[key] = null;
    if (pending.size === 0) return;
    const next = Math.min(...[...pending.values()].map((flash) => flash.until));
    flashTimers[key] = window.setTimeout(() => paintFlashes(key), next - now + 16);
  };

  /** Highlight the cells an edit changed, in the color of the analyst who made it. */
  const flashEdit = (key: ClientKey, event: ChangeEvent) => {
    if (event.transaction.patches.length > EDIT_FLASH_MAX_CELLS) return;
    const author: ClientKey = event.source === "remote" ? (key === "a" ? "b" : "a") : key;
    const until = performance.now() + EDIT_FLASH_MS;
    let flashed = false;
    for (const patch of event.transaction.patches) {
      if (patch.op !== "set") continue;
      const { addr } = patch;
      flashes[key].set(`${addr.sheet}:${addr.row}:${addr.col}`, {
        sheet: addr.sheet,
        start: { row: addr.row, col: addr.col },
        end: { row: addr.row, col: addr.col },
        color: ACTOR_FLASH[author],
        until,
      });
      flashed = true;
    }
    if (flashed) paintFlashes(key);
  };

  /** Rows of the plan sheet the reader can currently see in a client's Grid. */
  const visibleRows = (key: ClientKey): { first: number; last: number } | null => {
    const runtime = clients[key];
    const host = hosts[key];
    if (!runtime) return null;
    const rect = host.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const rowAt = (y: number) => runtime.grid.getCellAtPoint(x, y)?.row;
    let first: number | undefined;
    for (let y = rect.top + 2; y < rect.top + 120 && first === undefined; y += 6) first = rowAt(y);
    let last: number | undefined;
    for (let y = rect.bottom - 2; y > rect.bottom - 160 && last === undefined; y -= 6) {
      last = rowAt(y);
    }
    return first === undefined || last === undefined ? null : { first, last };
  };

  /** Scroll so rows `first`..`last` are on screen (the Grid scrolls minimally). */
  const showRows = (key: ClientKey, rows: { first: number; last: number }) => {
    const grid = clients[key]?.grid;
    grid?.scrollToCell({ sheet: "plan", row: rows.first, col: 0 });
    grid?.scrollToCell({ sheet: "plan", row: rows.last, col: 0 });
  };

  /** Account behind this client's sample edit; read from the forecast it is mounted on. */
  const sampleAccount = (key: ClientKey): string => {
    const runtime = clients[key];
    if (runtime?.document !== "forecast") return accounts[key];
    const resolved = runtime.grid.store.getCell({
      sheet: "plan",
      row: SAMPLE_ROW[key],
      col: 0,
    }).resolved;
    if (typeof resolved === "string") accounts[key] = resolved;
    return accounts[key];
  };

  /** The forecast total and sync state; on the usage document the total keeps its last value. */
  const readClient = (key: ClientKey) => {
    const runtime = clients[key];
    if (!runtime) return;
    if (runtime.document !== "forecast") {
      patchView(key, { syncState: runtime.sync.state });
      return;
    }
    const resolved = runtime.grid.store.getCell(COLLABORATION_TOTAL_CELL).resolved;
    patchView(key, {
      total:
        typeof resolved === "number"
          ? `$${resolved.toLocaleString("en-US")}`
          : String(resolved ?? "–"),
      syncState: runtime.sync.state,
      account: sampleAccount(key),
    });
  };

  const disposeClient = (key: ClientKey, resources: "close" | "retain" = "close") => {
    const runtime = clients[key];
    if (!runtime) return;
    for (const dispose of runtime.disposers) dispose();
    runtime.disposers.length = 0;
    runtime.presence.destroy();
    runtime.sync.destroy();
    runtime.grid.destroy();
    if (resources === "close") {
      runtime.link.destroy();
      runtime.storage.close();
    } else {
      // Recovery keeps the open queue and link, but drops broadcasts covered by the reload.
      runtime.link.discardParkedBroadcasts();
    }
    clients[key] = null;
  };

  const retryPending = (key: ClientKey) => {
    const runtime = clients[key];
    if (!runtime) return;
    const head = runtime.sync.pendingCommits()[0];
    if (!head) {
      pushClientLog(key, "info", "Nothing pending to retry");
      return;
    }
    pushClientLog(key, "info", `Retrying ${head.clientMutationId} with its original mutation id`);
    void runtime.sync.retry(head.clientMutationId).catch(() => {});
  };

  const wireClient = (key: ClientKey, runtime: ClientRuntime) => {
    const { sync, link, presence } = runtime;
    const isCurrent = () => clients[key] === runtime && runtime.generation === bootGeneration;
    runtime.disposers.push(
      sync.on((event) => {
        if (!isCurrent()) return;
        switch (event.type) {
          case "state":
            patchView(key, { syncState: event.state });
            readClient(key);
            break;
          case "pending":
            // A stale boot never drains the durable queue the live session owns.
            if (link.connected && sync.state.connection === "online" && isCurrent()) {
              void sync.flush().catch(() => {});
            }
            break;
          case "acknowledged":
            pushClientLog(
              key,
              "commit",
              event.duplicate
                ? `Duplicate acknowledgement: the server had already sequenced ${event.clientMutationId} at v${event.version}`
                : `Committed v${event.version}`,
            );
            break;
          case "remote-applied":
            pushClientLog(key, "remote", `Applied remote v${event.operation.version}`);
            readClient(key);
            break;
          case "restored":
            if (event.pending.length > 0) {
              pushClientLog(
                key,
                "info",
                `Restored ${event.pending.length} durable pending commit${event.pending.length === 1 ? "" : "s"}`,
              );
            }
            break;
          case "reload-required":
            pushClientLog(
              key,
              "warn",
              `Version gap: expected v${event.expectedVersion}, received v${event.receivedVersion} — buffered until the gap closes`,
            );
            break;
          case "conflict":
            pushClientLog(
              key,
              "warn",
              `Conflict: commit based on v${event.mutation.baseVersion}, server is at v${event.response.currentVersion}`,
            );
            void recoverClient(key, event.response);
            break;
          case "error":
            if (event.error instanceof ShowcaseLinkError) {
              pushClientLog(key, "warn", event.error.message);
            } else if (
              !(event.error instanceof Error && event.error.name === "SyncProtocolError")
            ) {
              pushClientLog(key, "error", errorText(event.error));
            }
            break;
          default:
            break;
        }
      }),
    );
    runtime.disposers.push(link.subscribeState((state) => patchView(key, { linkState: state })));
    runtime.disposers.push(
      runtime.grid.on("change", (event) => {
        if (isCurrent()) flashEdit(key, event);
      }),
    );
    let rowsFrame = 0;
    runtime.disposers.push(
      runtime.grid.on("scroll", () => {
        if (rowsFrame !== 0) return;
        rowsFrame = requestAnimationFrame(() => {
          rowsFrame = 0;
          if (isCurrent()) shownRows[key] = visibleRows(key);
        });
      }),
      () => cancelAnimationFrame(rowsFrame),
    );
    runtime.disposers.push(
      presence.on((event) => {
        if (event.type === "updated" || event.type === "expired") {
          patchView(key, { roster: presence.remotePresence() });
        }
      }),
    );
  };

  const createClient = (
    key: ClientKey,
    options: {
      snapshot: WorkbookSnapshot;
      generation: number;
      target: ShowcaseDocument;
      link: ShowcaseNetworkLink;
      storage: IndexedDbPendingCommitStorage;
      bus: ShowcasePresenceBus;
    },
  ): ClientRuntime => {
    const { snapshot, generation, target, link, storage, bus: presenceBus } = options;
    const host = hosts[key];
    const actor = key === "a" ? COLLABORATION_ACTORS[0] : COLLABORATION_ACTORS[1];
    host.replaceChildren();
    const grid = createGridFromSnapshot(host, snapshot, {
      presentation: "data-grid",
      config: {
        contextMenu: [
          { action: "copy", label: "Copy shared value" },
          { action: "paste" },
          { label: "Retry pending", onClick: () => retryPending(key) },
          { action: "exportXlsx", label: "Export this client's workbook" },
        ],
      },
      transactionResourceLimits: { maxEncodedBytes: DEMO_TRANSACTION_BYTES },
    });
    const sync = new SyncCoordinator(grid, link, {
      documentId: DOCUMENT_ID[target],
      serverVersion: snapshot.version ?? 0,
      pendingStorage: storage,
      // Each client's commits carry its person, as version history records them.
      authorId: actor.id,
      createMutationId: () => `${actor.id}-${Date.now().toString(36)}-${nextMutation++}`,
      limits: { maxVersionPayloadBytes: DEMO_VERSION_BYTES },
    });
    const presence = new PresenceCoordinator(grid, presenceBus.endpoint(), {
      actor,
      heartbeatMs: 0,
    });
    const runtime: ClientRuntime = {
      actor,
      generation,
      document: target,
      link,
      storage,
      grid,
      sync,
      presence,
      disposers: [],
    };
    wireClient(key, runtime);
    clients[key] = runtime;
    runtime.disposers.push(sync.subscribe(link));
    return runtime;
  };

  const bootClient = async (
    key: ClientKey,
    generation: number,
    target: ShowcaseDocument,
  ): Promise<void> => {
    const server = servers[target];
    if (!server || !bus || generation !== bootGeneration) return;
    const link = new ShowcaseNetworkLink(server);
    const snapshot = await server.load(DOCUMENT_ID[target]);
    link.startFrom(snapshot.version ?? 0);
    if (generation !== bootGeneration) {
      link.destroy();
      return;
    }
    const storage = new IndexedDbPendingCommitStorage({ databaseName: QUEUE_DATABASE[key] });
    const runtime = createClient(key, { snapshot, generation, target, link, storage, bus });
    const { sync } = runtime;
    if (generation !== bootGeneration) {
      if (clients[key] === runtime) disposeClient(key);
      return;
    }
    await sync.ready();
    if (generation !== bootGeneration) {
      if (clients[key] === runtime) disposeClient(key);
      return;
    }
    if (sync.pendingCount > 0) {
      await sync.flush();
      if (generation !== bootGeneration) {
        if (clients[key] === runtime) disposeClient(key);
        return;
      }
    }
    patchView(key, { ready: true, online: true, linkState: link.state() });
    readClient(key);
  };

  /**
   * The sequencing server lives in this page's memory and starts again at v0
   * on every boot, but the client queues live in IndexedDB. A queue kept from
   * an earlier visit refers to a server history that no longer exists, and
   * the server correctly rejects it as a conflict. Start each server with
   * empty client queues.
   */
  const clearQueueDatabases = async () => {
    for (const key of CLIENT_KEYS) {
      await deleteDatabase(QUEUE_DATABASE[key], { error: "reject", blocked: "resolve" });
    }
  };

  /** Starts a document's in-page server and logs its sequencing decisions. */
  const startServer = (target: ShowcaseDocument): ShowcaseCollaborationServer => {
    const server = new ShowcaseCollaborationServer(
      target === "forecast" ? makeCollaborationSnapshot() : makeCollaborationUsageSnapshot(),
    );
    servers[target] = server;
    serverDisposers.push(
      server.observeCommits((record: ShowcaseCommitRecord) => {
        const entry = {
          id: nextLogId(),
          kind: "info" as const,
          status: record.status,
          text: describeServerDecision(record),
        };
        setServerLog((entries) => [entry, ...entries].slice(0, SERVER_LOG_LIMIT));
        // The head shown is the head of the document the clients are on.
        if (record.documentId === DOCUMENT_ID[currentDocument]) {
          setServerVersion((current) => Math.max(current, record.version));
        }
      }),
    );
    return server;
  };

  const stopServers = () => {
    for (const dispose of serverDisposers) dispose();
    serverDisposers = [];
    servers = { forecast: null, usage: null };
  };

  const clientsBusy = () =>
    CLIENT_KEYS.some(
      (key) => (clients[key]?.sync.pendingCommits().length ?? 1) > 0 || recovering[key],
    );

  /**
   * Remount both clients on another document once their queues drain. Only
   * the batch drill uses the usage document, so conflict recovery on the
   * forecast reloads 10,000 cells instead of 110,000. Resolves false if the
   * clients stayed where they were.
   */
  const showDocument = (target: ShowcaseDocument): Promise<boolean> => {
    const next = switching.then(async () => {
      const onTarget = CLIENT_KEYS.every((key) => clients[key]?.document === target);
      if (onTarget) return true;
      if (drilling && target !== "usage") return false;
      const generation = bootGeneration;
      const settleBy = performance.now() + CHAOS_SETTLE_MS;
      while (performance.now() < settleBy && clientsBusy()) await delay(CHAOS_TICK_MS);
      if (clientsBusy() || generation !== bootGeneration) return false;
      const server = servers[target] ?? startServer(target);
      for (const key of CLIENT_KEYS) disposeClient(key);
      currentDocument = target;
      setServerVersion(server.headVersion(DOCUMENT_ID[target]));
      await bootClient("a", generation, target);
      await bootClient("b", generation, target);
      if (generation !== bootGeneration) return false;
      await clients.a?.presence.publishNow();
      await clients.b?.presence.publishNow();
      return CLIENT_KEYS.every((key) => clients[key]?.document === target);
    });
    switching = next.catch(() => false);
    return next;
  };

  const bootAll = async (generation: number) => {
    if (generation !== bootGeneration) return;
    setStatus("loading");
    setStatusDetail("Starting the in-page server…");
    try {
      await clearQueueDatabases();
      if (generation !== bootGeneration) return;
      await initSheetwrite();
      if (generation !== bootGeneration) return;
      stopServers();
      bus = new ShowcasePresenceBus();
      currentDocument = "forecast";
      setServerVersion(0);
      setServerLog([]);
      startServer("forecast");
      await bootClient("a", generation, "forecast");
      if (generation !== bootGeneration) return;
      await bootClient("b", generation, "forecast");
      if (generation !== bootGeneration) return;
      // Both clients are subscribed now; announce presence deterministically.
      await clients.a?.presence.publishNow();
      await clients.b?.presence.publishNow();
      if (generation !== bootGeneration) return;
      setStatus("ready");
      setStatusDetail("Two live clients, one sequencing server");
    } catch (error) {
      if (generation !== bootGeneration) return;
      setStatus("error");
      setStatusDetail(errorText(error));
    }
  };

  const editForecast = (key: ClientKey) => {
    const runtime = clients[key];
    if (!runtime) return;
    const row = SAMPLE_ROW[key];
    const addr = { sheet: "plan", row, col: 2 };
    const current = runtime.grid.store.getCell(addr).resolved;
    const forecast =
      typeof current === "number" ? current + FORECAST_ADJUSTMENT : FORECAST_ADJUSTMENT;
    runtime.grid.setSelection({ kind: "cell", addr });
    const outcome = runtime.grid.applyTransaction({
      patches: [{ op: "set", addr, value: { kind: "literal", value: forecast } }],
    });
    if (outcome.status !== "applied") {
      pushClientLog(key, "error", `Edit was not applied: ${outcome.status}`);
    }
    readClient(key);
  };

  const toggleOnline = (key: ClientKey, online: boolean) => {
    const runtime = clients[key];
    if (!runtime) return;
    if (online) {
      runtime.link.setConnected(true);
      runtime.sync.setOnline(true);
      pushClientLog(key, "info", "Reconnected: queued broadcasts replayed, pending work draining");
    } else {
      runtime.sync.setOnline(false);
      runtime.link.setConnected(false);
      pushClientLog(key, "info", "Offline: edits keep committing locally into the durable queue");
    }
    patchView(key, { online, linkState: runtime.link.state() });
    readClient(key);
  };

  /**
   * Documented host recovery. Recover on the live Grid when the missed server
   * versions touch other cells; otherwise rebase, clear stale durable ids,
   * remount, and resubmit.
   */
  const recoverClient = async (key: ClientKey, response: ConflictResponse) => {
    if (recovering[key]) return;
    recovering[key] = true;
    let frozen: Grid | null = null;
    try {
      const runtime = clients[key];
      const server = runtime ? servers[runtime.document] : null;
      if (!runtime || !server || !bus) return;
      const inPlace = await runtime.sync.recoverConflict();
      if (clients[key] !== runtime || inPlace.status === "no-conflict") return;
      if (inPlace.status === "recovered") {
        pushClientLog(
          key,
          "commit",
          `Recovered in place at v${inPlace.serverVersion}: pending work resent`,
        );
        readClient(key);
        void runtime.sync.flush().catch(() => {});
        return;
      }
      pushClientLog(key, "info", `Reloading to recover (${inPlace.reason.replaceAll("-", " ")})`);
      if (!response.operationsSinceBase) {
        pushClientLog(key, "error", "Manual review required: no operation tail returned");
        return;
      }
      // Freeze the client before taking its pending list: an edit made while
      // recovery awaits would be neither rebased nor removed, and a queue
      // write still in flight could land after the removal below. Either
      // would come back on the remounted client with a stale base version.
      runtime.grid.setReadOnly(true);
      frozen = runtime.grid;
      await runtime.sync.ready();
      if (clients[key] !== runtime) return;
      // Remounting resets the scroll position; keep the reader's place.
      const keptRows = visibleRows(key);
      const pending = runtime.sync.pendingCommits();
      const remoteOperations = response.operationsSinceBase.flatMap((entry) => [
        ...entry.operations,
      ]);
      const rebasedBatches: DocumentOp[][] = [];
      for (const record of pending) {
        const result = rebaseDocumentOperations(record.operations, remoteOperations);
        if (result.status === "conflict") {
          pushClientLog(key, "error", `Manual review required: ${result.conflict.message}`);
          return;
        }
        rebasedBatches.push([...result.operations]);
      }
      pushClientLog(
        key,
        "info",
        `Rebasing ${rebasedBatches.length} pending commit${rebasedBatches.length === 1 ? "" : "s"} over ${response.operationsSinceBase.length} newer server version${response.operationsSinceBase.length === 1 ? "" : "s"}`,
      );
      for (const record of pending) {
        await runtime.storage.remove(DOCUMENT_ID[runtime.document], record.clientMutationId);
      }
      const { link, storage, document: target } = runtime;
      disposeClient(key, "retain");

      // Loading and validating the whole document is the expensive step. Give
      // the browser a frame before each half so scrolling keeps painting.
      await delay(0);
      const latest = response.snapshot ?? (await link.load(DOCUMENT_ID[target]));
      // Broadcasts sequenced while the client remounts wait in the link for
      // the new coordinator; the ones this snapshot already holds are dropped.
      link.startFrom(latest.version ?? 0);
      await delay(0);
      const next = createClient(key, {
        snapshot: latest,
        generation: bootGeneration,
        target,
        link,
        storage,
        bus,
      });
      const { grid, sync, presence } = next;
      await sync.ready();
      if (bootGeneration !== next.generation) return;
      for (const batch of rebasedBatches) {
        const outcome = grid.applyTransaction({ patches: batch });
        if (outcome.status !== "applied") {
          pushClientLog(key, "error", `Rebased transaction was not applied: ${outcome.status}`);
          return;
        }
      }
      await sync.flush();
      await presence.publishNow();
      if (keptRows) showRows(key, keptRows);
      shownRows[key] = visibleRows(key);
      patchView(key, { ready: true, online: true, linkState: link.state() });
      readClient(key);
      pushClientLog(
        key,
        "commit",
        `Recovered at v${latest.version ?? 0}: rebased work resubmitted as new mutations`,
      );
    } catch (error) {
      pushClientLog(key, "error", errorText(error));
    } finally {
      // A recovery that stopped before the remount leaves the old Grid live.
      if (frozen && clients[key]?.grid === frozen) frozen.setReadOnly(false);
      recovering[key] = false;
    }
  };

  const holdNextBroadcast = (key: ClientKey) => {
    clients[key]?.link.holdNextBroadcast();
    pushClientLog(key, "info", "The next inbound broadcast will be held back (delivery reordered)");
  };

  const releaseHeld = (key: ClientKey) => {
    clients[key]?.link.releaseHeldBroadcasts();
  };

  /** Waits until one client is at the given server version with nothing queued. */
  const waitForPeerHead = async (peer: ClientRuntime, version: number): Promise<boolean> => {
    const deadline = performance.now() + CHAOS_SETTLE_MS;
    const caughtUp = () =>
      peer.sync.serverVersion >= version && peer.sync.pendingCommits().length === 0;
    while (performance.now() < deadline && !caughtUp()) await delay(CHAOS_TICK_MS);
    return caughtUp();
  };

  /**
   * A seconds-long storm: both clients edit their own rows while connections
   * drop, reconnect, and broadcasts arrive out of order. Then both clients
   * reconnect and the page compares their Grids cell by cell.
   */
  const runChaos = async () => {
    const run = chaosRun + 1;
    chaosRun = run;
    const stillRunning = () => chaosRun === run && clients.a !== null && clients.b !== null;
    const report: ChaosReport = {
      phase: "storm",
      edits: 0,
      disconnects: 0,
      reorders: 0,
      mismatches: 0,
      cells: 0,
      ms: 0,
    };
    let started = performance.now();
    let publishedAt = 0;
    const publish = (force = true) => {
      const now = performance.now();
      if (!force && now - publishedAt < CHAOS_PUBLISH_MS) return;
      publishedAt = now;
      setChaos({ ...report, ms: now - started });
    };
    // Publishing first replaces any earlier verdict and keeps the button
    // disabled while the clients leave the usage document of the batch drill.
    publish();
    try {
      if (!(await showDocument("forecast"))) {
        report.phase = "timed-out";
        publish();
        return;
      }
      started = performance.now();
      // Read after the switch: a remount brings both clients back online.
      const offline: Record<ClientKey, boolean> = {
        a: clients.a?.link.connected === false,
        b: clients.b?.link.connected === false,
      };
      // Bring the rows where Ana's half meets Bram's on screen in both Grids,
      // so every edit and every synced arrival is visible while the storm runs.
      for (const key of CLIENT_KEYS) {
        showRows(key, CHAOS_VIEW_ROWS);
        shownRows[key] = visibleRows(key);
      }
      // Seeded per run, so a run's fault sequence can be reproduced exactly.
      const random = seededRandom(run);

      while (performance.now() - started < CHAOS_STORM_MS && stillRunning()) {
        const key: ClientKey = random() < 0.5 ? "a" : "b";
        const runtime = clients[key];
        // A recovering client is being remounted and accepts no new edits.
        if (!runtime || recovering[key]) {
          await delay(CHAOS_TICK_MS);
          continue;
        }
        const roll = random();
        if (roll < 0.1) {
          offline[key] = !offline[key];
          if (offline[key]) report.disconnects += 1;
          toggleOnline(key, !offline[key]);
        } else if (roll < 0.18 && !offline[key]) {
          holdNextBroadcast(key);
          report.reorders += 1;
        } else {
          // Edit a row the reader can see in this analyst's Grid when one exists.
          const owned = CHAOS_ROWS[key];
          const view = shownRows[key];
          const onScreen = view ? owned.filter((r) => r >= view.first && r <= view.last) : [];
          const rows = onScreen.length > 0 ? onScreen : owned;
          const row = rows[Math.floor(random() * rows.length)];
          if (row === undefined) throw new Error("The analyst has no forecast rows.");
          const addr = { sheet: "plan", row, col: 2 };
          const outcome = runtime.grid.applyTransaction({
            patches: [
              {
                op: "set",
                addr,
                value: { kind: "literal", value: 10_000 + Math.floor(random() * 71) * 1_000 },
              },
            ],
          });
          if (outcome.status === "applied") report.edits += 1;
        }
        publish(false);
        await delay(CHAOS_TICK_MS);
      }

      report.phase = "settling";
      publish();
      for (const key of CLIENT_KEYS) {
        if (offline[key]) toggleOnline(key, true);
        releaseHeld(key);
      }
      // Wait until both queues drain, no conflict recovery is still running,
      // and both clients sit at the server head: a client stuck on a version
      // gap has nothing queued but has not caught up.
      const settleBy = performance.now() + CHAOS_DRAIN_MS;
      const head = () => servers.forecast?.headVersion(DOCUMENT_ID.forecast) ?? -1;
      const idle = () =>
        CLIENT_KEYS.every(
          (key) =>
            (clients[key]?.sync.pendingCommits().length ?? 1) === 0 &&
            !recovering[key] &&
            clients[key]?.sync.serverVersion === head(),
        );
      while (stillRunning() && performance.now() < settleBy && !idle()) {
        for (const key of CLIENT_KEYS) releaseHeld(key);
        await delay(CHAOS_TICK_MS);
      }
      await delay(CHAOS_TICK_MS * 4);
      if (!stillRunning()) return;
      if (!idle()) {
        // Never call a still-moving state converged.
        report.phase = "timed-out";
        publish();
        return;
      }
      const a = clients.a?.grid;
      const b = clients.b?.grid;
      if (!a || !b || !stillRunning()) return;
      let mismatches = 0;
      let cells = 0;
      for (let row = 0; row < COLLABORATION_WORKBOOK_ROWS; row++) {
        for (let col = 0; col < COLLABORATION_WORKBOOK_COLUMNS; col++) {
          const addr = { sheet: "plan", row, col };
          cells += 1;
          if (a.store.getCell(addr).resolved !== b.store.getCell(addr).resolved) mismatches += 1;
        }
      }
      report.cells = cells;
      report.mismatches = mismatches;
      report.phase = mismatches === 0 ? "converged" : "diverged";
      publish();
    } finally {
      if (stillRunning()) {
        if (report.phase === "storm" || report.phase === "settling") {
          report.phase = "timed-out";
          publish();
        }
        for (const key of CLIENT_KEYS) {
          toggleOnline(key, true);
          releaseHeld(key);
        }
      }
    }
  };

  /**
   * Atomic batch: clear 100,000 metered-usage cells on Ana's client, then undo
   * it once. The restore is far above one server version, so the engine
   * splits it into one atomic multi-version batch; Bram applies every version
   * in a single transaction or none of them.
   */
  const restoreUsage = () => {
    const started = performance.now();
    setRestoreRunning(true);
    setBatchReport(null);
    drilling = true;
    void (async () => {
      try {
        if (!(await showDocument("usage"))) {
          pushClientLog(
            "a",
            "warn",
            "Restore drill stopped: the clients could not open the usage document.",
          );
          return;
        }
        const restorer = clients.a;
        const peer = clients.b;
        const server = servers.usage;
        if (!restorer || !peer || !server) return;
        const settleBy = performance.now() + CHAOS_SETTLE_MS;
        while (performance.now() < settleBy && clientsBusy()) await delay(CHAOS_TICK_MS);
        if (clientsBusy()) {
          pushClientLog("a", "warn", "Restore drill stopped: a client still has queued work.");
          return;
        }
        const totalBefore = Number(restorer.grid.store.getCell(USAGE_TOTAL_CELL).resolved);
        await restorer.sync.flush();
        const cleared = restorer.grid.applyTransaction({
          patches: [{ op: "clearRange", range: USAGE_RANGE, contents: true }],
        });
        if (cleared.status !== "applied") {
          pushClientLog("a", "error", `Usage clear was ${cleared.status}.`);
          return;
        }
        await restorer.sync.flush();
        await waitForPeerHead(peer, restorer.sync.serverVersion);
        // The batch window starts here: only the batch may touch Bram's Grid.
        let versions = 0;
        let pieces = 0;
        let operationBytes = 0;
        let peerChanges = 0;
        const stopServer = server.observeCommits((record) => {
          if (record.batchVersions && record.batchVersions > 1) versions = record.batchVersions;
        });
        const stopPeer = peer.grid.on("change", (event) => {
          if (event.source === "remote") peerChanges += 1;
        });
        const stopUndo = restorer.grid.on("change", (event) => {
          if (event.commitReason !== "undo") return;
          pieces += event.transaction.patches.length;
          operationBytes += new TextEncoder().encode(
            JSON.stringify(event.transaction.patches),
          ).length;
        });
        try {
          restorer.grid.undo();
          await restorer.sync.flush();
          const reachedHead = await waitForPeerHead(peer, restorer.sync.serverVersion);
          const totalAfter = Number(restorer.grid.store.getCell(USAGE_TOTAL_CELL).resolved);
          const peerTotal = Number(peer.grid.store.getCell(USAGE_TOTAL_CELL).resolved);
          const passed =
            versions > 1 &&
            pieces > 1 &&
            totalAfter === totalBefore &&
            peerTotal === totalBefore &&
            peerChanges === 1 &&
            reachedHead;
          setBatchReport({
            versions,
            pieces,
            operationBytes,
            peerChanges,
            totalBefore,
            totalAfter,
            peerTotal,
            ms: performance.now() - started,
            passed,
          });
          pushClientLog(
            "a",
            passed ? "commit" : "warn",
            passed
              ? `Undo committed ${versions} versions of one atomic batch; Bram applied the batch once (${peerChanges} transaction).`
              : "The batch drill did not meet every check.",
          );
        } finally {
          stopServer();
          stopPeer();
          stopUndo();
        }
      } catch (error) {
        pushClientLog("a", "error", errorText(error));
      } finally {
        drilling = false;
        setRestoreRunning(false);
      }
    })();
  };

  const stopTheme = observeSiteTheme(() => {
    for (const key of CLIENT_KEYS) clients[key]?.grid.replaceTheme({});
  });

  // The page owns one boot session; reset starts the next generation.
  bootGeneration = 1;
  bootQueue = bootQueue.then(() => bootAll(1));

  return {
    sampleEdit(key) {
      void action.run(
        async () => {
          if (!(await showDocument("forecast"))) throw new Error("The forecast is not ready.");
          editForecast(key);
        },
        () => "Cannot apply the sample edit. Try again.",
      );
    },
    toggleOnline,
    retryPending,
    loseNextAck(key) {
      clients[key]?.link.dropNextAcknowledgement();
      pushClientLog(key, "info", "The next acknowledgement (and its echo) will be lost in transit");
    },
    holdNextBroadcast,
    releaseHeld,
    runChaos,
    restoreUsage,
    serverEdit() {
      void action.run(
        async () => {
          if (!(await showDocument("forecast"))) throw new Error("The forecast is not ready.");
          const server = servers.forecast;
          if (!server) return;
          const runtime = clients.a ?? clients.b;
          const addr = { sheet: "plan", row: 4, col: 2 };
          const current = runtime?.grid.store.getCell(addr).resolved;
          const forecast =
            typeof current === "number" ? current + FORECAST_ADJUSTMENT : FORECAST_ADJUSTMENT;
          await server.commitServerOperations(DOCUMENT_ID.forecast, [
            { op: "set", addr, value: { kind: "literal", value: forecast } },
          ]);
        },
        () => "Cannot commit the server edit. Try again.",
      );
    },
    resetDemo() {
      void action.run(
        async () => {
          const generation = bootGeneration + 1;
          bootGeneration = generation;
          for (const key of CLIENT_KEYS) disposeClient(key);
          stopServers();
          if (generation !== bootGeneration) return;
          setViews({ a: EMPTY_CLIENT_VIEW, b: EMPTY_CLIENT_VIEW });
          await bootAll(generation);
        },
        () => "Cannot reset the demo. Try again.",
      );
    },
    dispose() {
      bootGeneration += 1;
      stopTheme();
      for (const key of CLIENT_KEYS) disposeClient(key);
      stopServers();
      bus = null;
    },
  };
}
