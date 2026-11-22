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
import { siteGridTheme } from "@docs/showcases/site-grid-theme.js";
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
  emptyClientView,
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

let next_mutation = 1;

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
function describe_server_decision(record: ShowcaseCommitRecord): string {
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
  let server_disposers: Array<() => void> = [];
  /** Document both clients show, or are switching to. */
  let current_document: ShowcaseDocument = "forecast";
  /** Serializes document switches so two never interleave their remounts. */
  let switching: Promise<boolean> = Promise.resolve(true);
  /** True while the batch drill runs: nothing may move the clients off its document. */
  let drilling = false;
  /** Last account read per client, kept while the clients show the usage document. */
  const accounts: Record<ClientKey, string> = { a: "the first deal", b: "the first deal" };
  const recovering: Record<ClientKey, boolean> = { a: false, b: false };
  let boot_generation = 0;
  const flashes: Record<ClientKey, Map<string, HighlightRange & { until: number }>> = {
    a: new Map(),
    b: new Map(),
  };
  const flash_timers: Record<ClientKey, number | null> = { a: null, b: null };
  /** Rows each client shows, refreshed once per frame while it scrolls. */
  const shown_rows: Record<ClientKey, { first: number; last: number } | null> = {
    a: null,
    b: null,
  };
  let chaos_run = 0;

  /** Repaint a client's edit highlights and schedule the next expiry. */
  const paint_flashes = (key: ClientKey) => {
    const runtime = clients[key];
    const pending = flashes[key];
    const now = performance.now();
    for (const [id, flash] of pending) if (flash.until <= now) pending.delete(id);
    runtime?.grid.highlightCells(pending.size > 0 ? [...pending.values()] : null);
    const timer = flash_timers[key];
    if (timer !== null) window.clearTimeout(timer);
    flash_timers[key] = null;
    if (pending.size === 0) return;
    const next = Math.min(...[...pending.values()].map((flash) => flash.until));
    flash_timers[key] = window.setTimeout(() => paint_flashes(key), next - now + 16);
  };

  /** Highlight the cells an edit changed, in the color of the analyst who made it. */
  const flash_edit = (key: ClientKey, event: ChangeEvent) => {
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
    if (flashed) paint_flashes(key);
  };

  /** Rows of the plan sheet the reader can currently see in a client's Grid. */
  const visible_rows = (key: ClientKey): { first: number; last: number } | null => {
    const runtime = clients[key];
    const host = hosts[key];
    if (!runtime) return null;
    const rect = host.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const row_at = (y: number) => runtime.grid.getCellAtPoint(x, y)?.row;
    let first: number | undefined;
    for (let y = rect.top + 2; y < rect.top + 120 && first === undefined; y += 6) first = row_at(y);
    let last: number | undefined;
    for (let y = rect.bottom - 2; y > rect.bottom - 160 && last === undefined; y -= 6) {
      last = row_at(y);
    }
    return first === undefined || last === undefined ? null : { first, last };
  };

  /** Scroll so rows `first`..`last` are on screen (the Grid scrolls minimally). */
  const show_rows = (key: ClientKey, rows: { first: number; last: number }) => {
    const grid = clients[key]?.grid;
    grid?.scrollToCell({ sheet: "plan", row: rows.first, col: 0 });
    grid?.scrollToCell({ sheet: "plan", row: rows.last, col: 0 });
  };

  /** Account behind this client's sample edit; read from the forecast it is mounted on. */
  const sample_account = (key: ClientKey): string => {
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
  const read_client = (key: ClientKey) => {
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
      account: sample_account(key),
    });
  };

  const dispose_client = (key: ClientKey, resources: "close" | "retain" = "close") => {
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

  const retry_pending = (key: ClientKey) => {
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

  const wire_client = (key: ClientKey, runtime: ClientRuntime) => {
    const { sync, link, presence } = runtime;
    const is_current = () => clients[key] === runtime && runtime.generation === boot_generation;
    runtime.disposers.push(
      sync.on((event) => {
        if (!is_current()) return;
        switch (event.type) {
          case "state":
            patchView(key, { syncState: event.state });
            read_client(key);
            break;
          case "pending":
            // A stale boot never drains the durable queue the live session owns.
            if (link.connected && sync.state.connection === "online" && is_current()) {
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
            read_client(key);
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
            void recover_client(key, event.response);
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
        if (is_current()) flash_edit(key, event);
      }),
    );
    let rows_frame = 0;
    runtime.disposers.push(
      runtime.grid.on("scroll", () => {
        if (rows_frame !== 0) return;
        rows_frame = requestAnimationFrame(() => {
          rows_frame = 0;
          if (is_current()) shown_rows[key] = visible_rows(key);
        });
      }),
      () => cancelAnimationFrame(rows_frame),
    );
    runtime.disposers.push(
      presence.on((event) => {
        if (event.type === "updated" || event.type === "expired") {
          patchView(key, { roster: presence.remotePresence() });
        }
      }),
    );
  };

  const create_client = (
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
    const { snapshot, generation, target, link, storage, bus: presence_bus } = options;
    const host = hosts[key];
    const actor = key === "a" ? COLLABORATION_ACTORS[0] : COLLABORATION_ACTORS[1];
    host.replaceChildren();
    const grid = createGridFromSnapshot(host, snapshot, {
      presentation: "data-grid",
      theme: siteGridTheme(),
      config: {
        contextMenu: [
          { action: "copy", label: "Copy shared value" },
          { action: "paste" },
          { label: "Retry pending", onClick: () => retry_pending(key) },
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
      createMutationId: () => `${actor.id}-${Date.now().toString(36)}-${next_mutation++}`,
      limits: { maxVersionPayloadBytes: DEMO_VERSION_BYTES },
    });
    const presence = new PresenceCoordinator(grid, presence_bus.endpoint(), {
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
    wire_client(key, runtime);
    clients[key] = runtime;
    runtime.disposers.push(sync.subscribe(link));
    return runtime;
  };

  const boot_client = async (
    key: ClientKey,
    generation: number,
    target: ShowcaseDocument,
  ): Promise<void> => {
    const server = servers[target];
    if (!server || !bus || generation !== boot_generation) return;
    const link = new ShowcaseNetworkLink(server);
    const snapshot = await server.load(DOCUMENT_ID[target]);
    link.startFrom(snapshot.version ?? 0);
    if (generation !== boot_generation) {
      link.destroy();
      return;
    }
    const storage = new IndexedDbPendingCommitStorage({ databaseName: QUEUE_DATABASE[key] });
    const runtime = create_client(key, { snapshot, generation, target, link, storage, bus });
    const { sync } = runtime;
    if (generation !== boot_generation) {
      if (clients[key] === runtime) dispose_client(key);
      return;
    }
    await sync.ready();
    if (generation !== boot_generation) {
      if (clients[key] === runtime) dispose_client(key);
      return;
    }
    if (sync.pendingCount > 0) {
      await sync.flush();
      if (generation !== boot_generation) {
        if (clients[key] === runtime) dispose_client(key);
        return;
      }
    }
    patchView(key, { ready: true, online: true, linkState: link.state() });
    read_client(key);
  };

  /**
   * The sequencing server lives in this page's memory and starts again at v0
   * on every boot, but the client queues live in IndexedDB. A queue kept from
   * an earlier visit refers to a server history that no longer exists, and
   * the server correctly rejects it as a conflict. Start each server with
   * empty client queues.
   */
  const clear_queue_databases = async () => {
    for (const key of CLIENT_KEYS) {
      await deleteDatabase(QUEUE_DATABASE[key], { error: "reject", blocked: "resolve" });
    }
  };

  /** Starts a document's in-page server and logs its sequencing decisions. */
  const start_server = (target: ShowcaseDocument): ShowcaseCollaborationServer => {
    const server = new ShowcaseCollaborationServer(
      target === "forecast" ? makeCollaborationSnapshot() : makeCollaborationUsageSnapshot(),
    );
    servers[target] = server;
    server_disposers.push(
      server.observeCommits((record: ShowcaseCommitRecord) => {
        const entry = {
          id: nextLogId(),
          kind: "info" as const,
          status: record.status,
          text: describe_server_decision(record),
        };
        setServerLog((entries) => [entry, ...entries].slice(0, SERVER_LOG_LIMIT));
        // The head shown is the head of the document the clients are on.
        if (record.documentId === DOCUMENT_ID[current_document]) {
          setServerVersion((current) => Math.max(current, record.version));
        }
      }),
    );
    return server;
  };

  const stop_servers = () => {
    for (const dispose of server_disposers) dispose();
    server_disposers = [];
    servers = { forecast: null, usage: null };
  };

  const clients_busy = () =>
    CLIENT_KEYS.some(
      (key) => (clients[key]?.sync.pendingCommits().length ?? 1) > 0 || recovering[key],
    );

  /**
   * Remount both clients on another document once their queues drain. Only
   * the batch drill uses the usage document, so conflict recovery on the
   * forecast reloads 10,000 cells instead of 110,000. Resolves false if the
   * clients stayed where they were.
   */
  const show_document = (target: ShowcaseDocument): Promise<boolean> => {
    const next = switching.then(async () => {
      const on_target = CLIENT_KEYS.every((key) => clients[key]?.document === target);
      if (on_target) return true;
      if (drilling && target !== "usage") return false;
      const generation = boot_generation;
      const settle_by = performance.now() + CHAOS_SETTLE_MS;
      while (performance.now() < settle_by && clients_busy()) await delay(CHAOS_TICK_MS);
      if (clients_busy() || generation !== boot_generation) return false;
      const server = servers[target] ?? start_server(target);
      for (const key of CLIENT_KEYS) dispose_client(key);
      current_document = target;
      setServerVersion(server.headVersion(DOCUMENT_ID[target]));
      await boot_client("a", generation, target);
      await boot_client("b", generation, target);
      if (generation !== boot_generation) return false;
      await clients.a?.presence.publishNow();
      await clients.b?.presence.publishNow();
      return CLIENT_KEYS.every((key) => clients[key]?.document === target);
    });
    switching = next.catch(() => false);
    return next;
  };

  const boot_all = async (generation: number) => {
    if (generation !== boot_generation) return;
    setStatus("loading");
    setStatusDetail("Starting the in-page server…");
    try {
      await clear_queue_databases();
      if (generation !== boot_generation) return;
      await initSheetwrite();
      if (generation !== boot_generation) return;
      stop_servers();
      bus = new ShowcasePresenceBus();
      current_document = "forecast";
      setServerVersion(0);
      setServerLog([]);
      start_server("forecast");
      await boot_client("a", generation, "forecast");
      if (generation !== boot_generation) return;
      await boot_client("b", generation, "forecast");
      if (generation !== boot_generation) return;
      // Both clients are subscribed now; announce presence deterministically.
      await clients.a?.presence.publishNow();
      await clients.b?.presence.publishNow();
      if (generation !== boot_generation) return;
      setStatus("ready");
      setStatusDetail("Two live clients, one sequencing server");
    } catch (error) {
      if (generation !== boot_generation) return;
      setStatus("error");
      setStatusDetail(errorText(error));
    }
  };

  const edit_forecast = (key: ClientKey) => {
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
    read_client(key);
  };

  const toggle_online = (key: ClientKey, online: boolean) => {
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
    read_client(key);
  };

  /**
   * Documented host recovery. Recover on the live Grid when the missed server
   * versions touch other cells; otherwise rebase, clear stale durable ids,
   * remount, and resubmit.
   */
  const recover_client = async (key: ClientKey, response: ConflictResponse) => {
    if (recovering[key]) return;
    recovering[key] = true;
    let frozen: Grid | null = null;
    try {
      const runtime = clients[key];
      const server = runtime ? servers[runtime.document] : null;
      if (!runtime || !server || !bus) return;
      const in_place = await runtime.sync.recoverConflict();
      if (clients[key] !== runtime || in_place.status === "no-conflict") return;
      if (in_place.status === "recovered") {
        pushClientLog(
          key,
          "commit",
          `Recovered in place at v${in_place.serverVersion}: pending work resent`,
        );
        read_client(key);
        void runtime.sync.flush().catch(() => {});
        return;
      }
      pushClientLog(key, "info", `Reloading to recover (${in_place.reason.replaceAll("-", " ")})`);
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
      const kept_rows = visible_rows(key);
      const pending = runtime.sync.pendingCommits();
      const remote_operations = response.operationsSinceBase.flatMap((entry) => [
        ...entry.operations,
      ]);
      const rebased_batches: DocumentOp[][] = [];
      for (const record of pending) {
        const result = rebaseDocumentOperations(record.operations, remote_operations);
        if (result.status === "conflict") {
          pushClientLog(key, "error", `Manual review required: ${result.conflict.message}`);
          return;
        }
        rebased_batches.push([...result.operations]);
      }
      pushClientLog(
        key,
        "info",
        `Rebasing ${rebased_batches.length} pending commit${rebased_batches.length === 1 ? "" : "s"} over ${response.operationsSinceBase.length} newer server version${response.operationsSinceBase.length === 1 ? "" : "s"}`,
      );
      for (const record of pending) {
        await runtime.storage.remove(DOCUMENT_ID[runtime.document], record.clientMutationId);
      }
      const { link, storage, document: target } = runtime;
      dispose_client(key, "retain");

      // Loading and validating the whole document is the expensive step. Give
      // the browser a frame before each half so scrolling keeps painting.
      await delay(0);
      const latest = response.snapshot ?? (await link.load(DOCUMENT_ID[target]));
      // Broadcasts sequenced while the client remounts wait in the link for
      // the new coordinator; the ones this snapshot already holds are dropped.
      link.startFrom(latest.version ?? 0);
      await delay(0);
      const next = create_client(key, {
        snapshot: latest,
        generation: boot_generation,
        target,
        link,
        storage,
        bus,
      });
      const { grid, sync, presence } = next;
      await sync.ready();
      if (boot_generation !== next.generation) return;
      for (const batch of rebased_batches) {
        const outcome = grid.applyTransaction({ patches: batch });
        if (outcome.status !== "applied") {
          pushClientLog(key, "error", `Rebased transaction was not applied: ${outcome.status}`);
          return;
        }
      }
      await sync.flush();
      await presence.publishNow();
      if (kept_rows) show_rows(key, kept_rows);
      shown_rows[key] = visible_rows(key);
      patchView(key, { ready: true, online: true, linkState: link.state() });
      read_client(key);
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

  const hold_next_broadcast = (key: ClientKey) => {
    clients[key]?.link.holdNextBroadcast();
    pushClientLog(key, "info", "The next inbound broadcast will be held back (delivery reordered)");
  };

  const release_held = (key: ClientKey) => {
    clients[key]?.link.releaseHeldBroadcasts();
  };

  /** Waits until one client is at the given server version with nothing queued. */
  const wait_for_peer_head = async (peer: ClientRuntime, version: number): Promise<boolean> => {
    const deadline = performance.now() + CHAOS_SETTLE_MS;
    const caught_up = () =>
      peer.sync.serverVersion >= version && peer.sync.pendingCommits().length === 0;
    while (performance.now() < deadline && !caught_up()) await delay(CHAOS_TICK_MS);
    return caught_up();
  };

  /**
   * A seconds-long storm: both clients edit their own rows while connections
   * drop, reconnect, and broadcasts arrive out of order. Then both clients
   * reconnect and the page compares their Grids cell by cell.
   */
  const run_chaos = async () => {
    const run = chaos_run + 1;
    chaos_run = run;
    const still_running = () => chaos_run === run && clients.a !== null && clients.b !== null;
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
    let published_at = 0;
    const publish = (force = true) => {
      const now = performance.now();
      if (!force && now - published_at < CHAOS_PUBLISH_MS) return;
      published_at = now;
      setChaos({ ...report, ms: now - started });
    };
    // Publishing first replaces any earlier verdict and keeps the button
    // disabled while the clients leave the usage document of the batch drill.
    publish();
    try {
      if (!(await show_document("forecast"))) {
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
        show_rows(key, CHAOS_VIEW_ROWS);
        shown_rows[key] = visible_rows(key);
      }
      // Seeded per run, so a run's fault sequence can be reproduced exactly.
      const random = seededRandom(run);

      while (performance.now() - started < CHAOS_STORM_MS && still_running()) {
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
          toggle_online(key, !offline[key]);
        } else if (roll < 0.18 && !offline[key]) {
          hold_next_broadcast(key);
          report.reorders += 1;
        } else {
          // Edit a row the reader can see in this analyst's Grid when one exists.
          const owned = CHAOS_ROWS[key];
          const view = shown_rows[key];
          const on_screen = view ? owned.filter((r) => r >= view.first && r <= view.last) : [];
          const rows = on_screen.length > 0 ? on_screen : owned;
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
        if (offline[key]) toggle_online(key, true);
        release_held(key);
      }
      // Wait until both queues drain, no conflict recovery is still running,
      // and both clients sit at the server head: a client stuck on a version
      // gap has nothing queued but has not caught up.
      const settle_by = performance.now() + CHAOS_DRAIN_MS;
      const head = () => servers.forecast?.headVersion(DOCUMENT_ID.forecast) ?? -1;
      const idle = () =>
        CLIENT_KEYS.every(
          (key) =>
            (clients[key]?.sync.pendingCommits().length ?? 1) === 0 &&
            !recovering[key] &&
            clients[key]?.sync.serverVersion === head(),
        );
      while (still_running() && performance.now() < settle_by && !idle()) {
        for (const key of CLIENT_KEYS) release_held(key);
        await delay(CHAOS_TICK_MS);
      }
      await delay(CHAOS_TICK_MS * 4);
      if (!still_running()) return;
      if (!idle()) {
        // Never call a still-moving state converged.
        report.phase = "timed-out";
        publish();
        return;
      }
      const a = clients.a?.grid;
      const b = clients.b?.grid;
      if (!a || !b || !still_running()) return;
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
      if (still_running()) {
        if (report.phase === "storm" || report.phase === "settling") {
          report.phase = "timed-out";
          publish();
        }
        for (const key of CLIENT_KEYS) {
          toggle_online(key, true);
          release_held(key);
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
  const restore_usage = () => {
    const started = performance.now();
    setRestoreRunning(true);
    setBatchReport(null);
    drilling = true;
    void (async () => {
      try {
        if (!(await show_document("usage"))) {
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
        const settle_by = performance.now() + CHAOS_SETTLE_MS;
        while (performance.now() < settle_by && clients_busy()) await delay(CHAOS_TICK_MS);
        if (clients_busy()) {
          pushClientLog("a", "warn", "Restore drill stopped: a client still has queued work.");
          return;
        }
        const total_before = Number(restorer.grid.store.getCell(USAGE_TOTAL_CELL).resolved);
        await restorer.sync.flush();
        const cleared = restorer.grid.applyTransaction({
          patches: [{ op: "clearRange", range: USAGE_RANGE, contents: true }],
        });
        if (cleared.status !== "applied") {
          pushClientLog("a", "error", `Usage clear was ${cleared.status}.`);
          return;
        }
        await restorer.sync.flush();
        await wait_for_peer_head(peer, restorer.sync.serverVersion);
        // The batch window starts here: only the batch may touch Bram's Grid.
        let versions = 0;
        let pieces = 0;
        let operation_bytes = 0;
        let peer_changes = 0;
        const stop_server = server.observeCommits((record) => {
          if (record.batchVersions && record.batchVersions > 1) versions = record.batchVersions;
        });
        const stop_peer = peer.grid.on("change", (event) => {
          if (event.source === "remote") peer_changes += 1;
        });
        const stop_undo = restorer.grid.on("change", (event) => {
          if (event.commitReason !== "undo") return;
          pieces += event.transaction.patches.length;
          operation_bytes += new TextEncoder().encode(
            JSON.stringify(event.transaction.patches),
          ).length;
        });
        try {
          restorer.grid.undo();
          await restorer.sync.flush();
          const reached_head = await wait_for_peer_head(peer, restorer.sync.serverVersion);
          const total_after = Number(restorer.grid.store.getCell(USAGE_TOTAL_CELL).resolved);
          const peer_total = Number(peer.grid.store.getCell(USAGE_TOTAL_CELL).resolved);
          const passed =
            versions > 1 &&
            pieces > 1 &&
            total_after === total_before &&
            peer_total === total_before &&
            peer_changes === 1 &&
            reached_head;
          setBatchReport({
            versions,
            pieces,
            operationBytes: operation_bytes,
            peerChanges: peer_changes,
            totalBefore: total_before,
            totalAfter: total_after,
            peerTotal: peer_total,
            ms: performance.now() - started,
            passed,
          });
          pushClientLog(
            "a",
            passed ? "commit" : "warn",
            passed
              ? `Undo committed ${versions} versions of one atomic batch; Bram applied the batch once (${peer_changes} transaction).`
              : "The batch drill did not meet every check.",
          );
        } finally {
          stop_server();
          stop_peer();
          stop_undo();
        }
      } catch (error) {
        pushClientLog("a", "error", errorText(error));
      } finally {
        drilling = false;
        setRestoreRunning(false);
      }
    })();
  };

  const stop_theme = observeSiteTheme(() => {
    for (const key of CLIENT_KEYS) clients[key]?.grid.replaceTheme(siteGridTheme());
  });

  // The page owns one boot session; reset starts the next generation.
  boot_generation = 1;
  void boot_all(1);

  return {
    sampleEdit(key) {
      void action.run(
        async () => {
          if (!(await show_document("forecast"))) throw new Error("The forecast is not ready.");
          edit_forecast(key);
        },
        () => "Cannot apply the sample edit. Try again.",
      );
    },
    toggleOnline: toggle_online,
    retryPending: retry_pending,
    loseNextAck(key) {
      clients[key]?.link.dropNextAcknowledgement();
      pushClientLog(key, "info", "The next acknowledgement (and its echo) will be lost in transit");
    },
    holdNextBroadcast: hold_next_broadcast,
    releaseHeld: release_held,
    runChaos: run_chaos,
    restoreUsage: restore_usage,
    serverEdit() {
      void action.run(
        async () => {
          if (!(await show_document("forecast"))) throw new Error("The forecast is not ready.");
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
          const generation = boot_generation + 1;
          boot_generation = generation;
          for (const key of CLIENT_KEYS) dispose_client(key);
          stop_servers();
          if (generation !== boot_generation) return;
          setViews({ a: emptyClientView(), b: emptyClientView() });
          await boot_all(generation);
        },
        () => "Cannot reset the demo. Try again.",
      );
    },
    dispose() {
      boot_generation += 1;
      stop_theme();
      for (const key of CLIENT_KEYS) dispose_client(key);
      stop_servers();
      bus = null;
    },
  };
}
