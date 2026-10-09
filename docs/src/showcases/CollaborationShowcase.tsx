import {
  type ChangeEvent,
  createGridFromSnapshot,
  type DocumentOp,
  type Grid,
  type HighlightRange,
  initSheetwrite,
  type PersistenceCommitResponse,
  PresenceCoordinator,
  type PresenceMessage,
  rebaseDocumentOperations,
  SyncCoordinator,
  type SyncStateSnapshot,
} from "@sheetwrite/core";
import { IndexedDbPendingCommitStorage } from "@sheetwrite/core/browser";
import "@sheetwrite/core/styles.css";
import { type ReactNode, useEffect, useRef, useState } from "react";
import {
  COLLABORATION_ACTORS,
  type ShowcaseActor,
  ShowcaseCollaborationServer,
  type ShowcaseCommitRecord,
  ShowcaseLinkError,
  type ShowcaseLinkState,
  ShowcaseNetworkLink,
  ShowcasePresenceBus,
} from "./collaboration-protocol.js";
import {
  COLLABORATION_DOCUMENT_ID,
  COLLABORATION_FORECAST_ROWS,
  COLLABORATION_TOTAL_CELL,
  COLLABORATION_USAGE_DOCUMENT_ID,
  COLLABORATION_WORKBOOK_COLUMNS,
  COLLABORATION_WORKBOOK_ROWS,
  makeCollaborationSnapshot,
  makeCollaborationUsageSnapshot,
} from "./collaboration-seed.js";
import { USAGE_RANGE, USAGE_TOTAL_CELL } from "./scenarios/durable-usage.js";

const LOG_LIMIT = 10;
const SERVER_LOG_LIMIT = 12;
type ClientKey = "a" | "b";
const CLIENT_KEYS: readonly ClientKey[] = ["a", "b"];
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
/** Chaos leaves both clients with long queues and recoveries; allow them longer to drain. */
const CHAOS_DRAIN_MS = 30_000;
/** Storm progress text refreshes at most this often, so it never re-renders the page per tick. */
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
 * Demo ceilings for the 0.5.0 batch proof. The 100,000-cell usage restore is
 * far above one version, so the engine splits it into an atomic batch; the
 * production defaults allow 8 MiB per version and 16 versions per batch.
 */
const DEMO_VERSION_BYTES = 1024 * 1024;
const DEMO_TRANSACTION_BYTES = 1024 * 1024;

interface ChaosReport {
  phase: "storm" | "settling" | "converged" | "diverged" | "timed-out";
  edits: number;
  disconnects: number;
  reorders: number;
  mismatches: number;
  cells: number;
  ms: number;
}

/** What one atomic multi-version restore looked like on both clients. */
interface BatchReport {
  versions: number;
  pieces: number;
  operationBytes: number;
  peerChanges: number;
  totalBefore: number;
  totalAfter: number;
  peerTotal: number;
  ms: number;
  passed: boolean;
}

/** Small deterministic generator (mulberry32) for repeatable chaos runs. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 0x1_0000_0000;
  };
}

/** Waits between drill steps so React state and the durable queue keep up. */
function delay(ms: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, ms);
  return promise;
}

/** One sequencer decision in plain words; mutation ids stay out of the UI. */
function describeServerDecision(record: ShowcaseCommitRecord): string {
  const label =
    record.status === "applied"
      ? "applied to both clients"
      : record.status === "duplicate"
        ? "duplicate acknowledgement"
        : "rejected · client rebases";
  return `v${record.version} ${label} · ${record.operationCount} op${
    record.operationCount === 1 ? "" : "s"
  }`;
}

/** Milliseconds as a short duration: sub-second stays in ms, longer reads in s. */
function formatDuration(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms.toFixed(0)} ms`;
}

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

interface LogEntry {
  id: number;
  kind: "info" | "commit" | "remote" | "warn" | "error";
  text: string;
}

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

interface ClientView {
  ready: boolean;
  online: boolean;
  syncState: SyncStateSnapshot | null;
  linkState: ShowcaseLinkState | null;
  total: string;
  roster: readonly PresenceMessage[];
  log: readonly LogEntry[];
}

const EMPTY_CLIENT_VIEW: ClientView = {
  ready: false,
  online: true,
  syncState: null,
  linkState: null,
  total: "–",
  roster: [],
  log: [],
};

let nextMutation = 1;

export default function CollaborationShowcase() {
  const hostRefs: Record<ClientKey, React.RefObject<HTMLDivElement | null>> = {
    a: useRef<HTMLDivElement>(null),
    b: useRef<HTMLDivElement>(null),
  };
  /** One sequencing server per document; the usage server starts on first use. */
  const serversRef = useRef<Record<ShowcaseDocument, ShowcaseCollaborationServer | null>>({
    forecast: null,
    usage: null,
  });
  const busRef = useRef<ShowcasePresenceBus | null>(null);
  const clientsRef = useRef<Record<ClientKey, ClientRuntime | null>>({ a: null, b: null });
  const serverDisposersRef = useRef<Array<() => void>>([]);
  /** Document both clients show, or are switching to. */
  const documentRef = useRef<ShowcaseDocument>("forecast");
  /** Serializes document switches so two never interleave their remounts. */
  const switchRef = useRef<Promise<boolean>>(Promise.resolve(true));
  /** True while the batch drill runs: nothing may move the clients off its document. */
  const drillRef = useRef(false);
  /** Last account read per client, kept while the clients show the usage document. */
  const accountRef = useRef<Record<ClientKey, string>>({
    a: "the first deal",
    b: "the first deal",
  });
  const logIdRef = useRef(0);
  const recoveringRef = useRef<Record<ClientKey, boolean>>({ a: false, b: false });
  const bootGenerationRef = useRef(0);
  const bootQueueRef = useRef<Promise<void>>(Promise.resolve());

  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [statusDetail, setStatusDetail] = useState("Starting the in-page server…");
  const [views, setViews] = useState<Record<ClientKey, ClientView>>({
    a: EMPTY_CLIENT_VIEW,
    b: EMPTY_CLIENT_VIEW,
  });
  const [serverLog, setServerLog] = useState<Array<LogEntry & { status: string }>>([]);
  const [serverVersion, setServerVersion] = useState(0);
  const [chaos, setChaos] = useState<ChaosReport | null>(null);
  const [batchReport, setBatchReport] = useState<BatchReport | null>(null);
  const [restoreRunning, setRestoreRunning] = useState(false);
  const chaosRunRef = useRef(0);
  const flashesRef = useRef<Record<ClientKey, Map<string, HighlightRange & { until: number }>>>({
    a: new Map(),
    b: new Map(),
  });
  const flashTimerRef = useRef<Record<ClientKey, number | null>>({ a: null, b: null });
  /** Rows each client shows, refreshed once per frame while it scrolls. */
  const shownRowsRef = useRef<Record<ClientKey, { first: number; last: number } | null>>({
    a: null,
    b: null,
  });

  /** Repaint a client's edit highlights and schedule the next expiry. */
  const paintFlashes = (key: ClientKey) => {
    const runtime = clientsRef.current[key];
    const flashes = flashesRef.current[key];
    const now = performance.now();
    for (const [id, flash] of flashes) if (flash.until <= now) flashes.delete(id);
    runtime?.grid.highlightCells(flashes.size > 0 ? [...flashes.values()] : null);
    const timer = flashTimerRef.current[key];
    if (timer !== null) window.clearTimeout(timer);
    flashTimerRef.current[key] = null;
    if (flashes.size === 0) return;
    const next = Math.min(...[...flashes.values()].map((flash) => flash.until));
    flashTimerRef.current[key] = window.setTimeout(() => paintFlashes(key), next - now + 16);
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
      flashesRef.current[key].set(`${addr.sheet}:${addr.row}:${addr.col}`, {
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
    const runtime = clientsRef.current[key];
    const host = hostRefs[key].current;
    if (!runtime || !host) return null;
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
    const grid = clientsRef.current[key]?.grid;
    grid?.scrollToCell({ sheet: "plan", row: rows.first, col: 0 });
    grid?.scrollToCell({ sheet: "plan", row: rows.last, col: 0 });
  };

  const patchView = (key: ClientKey, patch: Partial<ClientView>) => {
    setViews((current) => ({ ...current, [key]: { ...current[key], ...patch } }));
  };

  const pushClientLog = (key: ClientKey, kind: LogEntry["kind"], text: string) => {
    logIdRef.current += 1;
    const entry: LogEntry = { id: logIdRef.current, kind, text };
    setViews((current) => ({
      ...current,
      [key]: { ...current[key], log: [entry, ...current[key].log].slice(0, LOG_LIMIT) },
    }));
  };

  /** The forecast total and sync state; on the usage document the total keeps its last value. */
  const readClient = (key: ClientKey) => {
    const runtime = clientsRef.current[key];
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
    });
  };

  /** Account behind this client's sample edit; read from the forecast it is mounted on. */
  const sampleAccount = (key: ClientKey): string => {
    const runtime = clientsRef.current[key];
    if (runtime?.document !== "forecast") return accountRef.current[key];
    const resolved = runtime.grid.store.getCell({
      sheet: "plan",
      row: SAMPLE_ROW[key],
      col: 0,
    }).resolved;
    if (typeof resolved === "string") accountRef.current[key] = resolved;
    return accountRef.current[key];
  };

  const bootClient = async (
    key: ClientKey,
    generation: number,
    target: ShowcaseDocument,
  ): Promise<void> => {
    const host = hostRefs[key].current;
    const server = serversRef.current[target];
    const bus = busRef.current;
    if (!host || !server || !bus || generation !== bootGenerationRef.current) return;
    const actor = key === "a" ? COLLABORATION_ACTORS[0] : COLLABORATION_ACTORS[1];
    const link = new ShowcaseNetworkLink(server);
    const snapshot = await server.load(DOCUMENT_ID[target]);
    link.startFrom(snapshot.version ?? 0);
    if (generation !== bootGenerationRef.current) {
      link.destroy();
      return;
    }
    host.replaceChildren();
    const grid = createGridFromSnapshot(host, snapshot, {
      presentation: "data-grid",
      transactionResourceLimits: { maxEncodedBytes: DEMO_TRANSACTION_BYTES },
    });
    const storage = new IndexedDbPendingCommitStorage({ databaseName: QUEUE_DATABASE[key] });
    const sync = new SyncCoordinator(grid, link, {
      documentId: DOCUMENT_ID[target],
      serverVersion: snapshot.version ?? 0,
      pendingStorage: storage,
      createMutationId: () => `${actor.id}-${Date.now().toString(36)}-${nextMutation++}`,
      limits: { maxVersionPayloadBytes: DEMO_VERSION_BYTES },
    });
    const presence = new PresenceCoordinator(grid, bus.endpoint(), { actor, heartbeatMs: 0 });
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
    clientsRef.current[key] = runtime;
    runtime.disposers.push(sync.subscribe(link));
    if (generation !== bootGenerationRef.current) {
      if (clientsRef.current[key] === runtime) disposeClient(key);
      return;
    }
    await sync.ready();
    if (generation !== bootGenerationRef.current) {
      if (clientsRef.current[key] === runtime) disposeClient(key);
      return;
    }
    if (sync.pendingCount > 0) {
      await sync.flush();
      if (generation !== bootGenerationRef.current) {
        if (clientsRef.current[key] === runtime) disposeClient(key);
        return;
      }
    }
    patchView(key, { ready: true, online: true, linkState: link.state() });
    readClient(key);
  };

  const wireClient = (key: ClientKey, runtime: ClientRuntime) => {
    const { sync, link, presence } = runtime;
    const isCurrent = () =>
      clientsRef.current[key] === runtime && runtime.generation === bootGenerationRef.current;
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
              pushClientLog(
                key,
                "error",
                event.error instanceof Error ? event.error.message : String(event.error),
              );
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
          if (isCurrent()) shownRowsRef.current[key] = visibleRows(key);
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

  const disposeClient = (key: ClientKey, keepStores = false) => {
    const runtime = clientsRef.current[key];
    if (!runtime) return;
    for (const dispose of runtime.disposers) dispose();
    runtime.disposers.length = 0;
    runtime.presence.destroy();
    runtime.sync.destroy();
    runtime.grid.destroy();
    runtime.link.destroy();
    if (!keepStores) runtime.storage.close();
    clientsRef.current[key] = null;
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
      const { promise, resolve, reject } = Promise.withResolvers<void>();
      const request = indexedDB.deleteDatabase(QUEUE_DATABASE[key]);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error("IndexedDB deletion failed"));
      request.onblocked = () => resolve();
      await promise;
    }
  };

  /** Starts a document's in-page server and logs its sequencing decisions. */
  const startServer = (target: ShowcaseDocument): ShowcaseCollaborationServer => {
    const server = new ShowcaseCollaborationServer(
      target === "forecast" ? makeCollaborationSnapshot() : makeCollaborationUsageSnapshot(),
    );
    serversRef.current[target] = server;
    serverDisposersRef.current.push(
      server.observeCommits((record: ShowcaseCommitRecord) => {
        logIdRef.current += 1;
        const entry = {
          id: logIdRef.current,
          kind: "info" as const,
          status: record.status,
          text: describeServerDecision(record),
        };
        setServerLog((entries) => [entry, ...entries].slice(0, SERVER_LOG_LIMIT));
        // The head shown is the head of the document the clients are on.
        if (record.documentId === DOCUMENT_ID[documentRef.current]) {
          setServerVersion((current) => Math.max(current, record.version));
        }
      }),
    );
    return server;
  };

  const stopServers = () => {
    for (const dispose of serverDisposersRef.current) dispose();
    serverDisposersRef.current = [];
    serversRef.current = { forecast: null, usage: null };
  };

  /**
   * Remount both clients on another document once their queues drain. Only
   * the batch drill uses the usage document, so conflict recovery on the
   * forecast reloads 10,000 cells instead of 110,000. Resolves false if the
   * clients stayed where they were.
   */
  const showDocument = (target: ShowcaseDocument): Promise<boolean> => {
    const next = switchRef.current.then(async () => {
      const onTarget = CLIENT_KEYS.every((key) => clientsRef.current[key]?.document === target);
      if (onTarget) return true;
      if (drillRef.current && target !== "usage") return false;
      const generation = bootGenerationRef.current;
      const settleBy = performance.now() + CHAOS_SETTLE_MS;
      while (performance.now() < settleBy && clientsBusy()) await delay(CHAOS_TICK_MS);
      if (clientsBusy() || generation !== bootGenerationRef.current) return false;
      const server = serversRef.current[target] ?? startServer(target);
      for (const key of CLIENT_KEYS) disposeClient(key);
      documentRef.current = target;
      setServerVersion(server.headVersion(DOCUMENT_ID[target]));
      await bootClient("a", generation, target);
      await bootClient("b", generation, target);
      if (generation !== bootGenerationRef.current) return false;
      await clientsRef.current.a?.presence.publishNow();
      await clientsRef.current.b?.presence.publishNow();
      return CLIENT_KEYS.every((key) => clientsRef.current[key]?.document === target);
    });
    switchRef.current = next.catch(() => false);
    return next;
  };

  const bootAll = async (generation: number) => {
    if (generation !== bootGenerationRef.current) return;
    setStatus("loading");
    setStatusDetail("Starting the in-page server…");
    try {
      await clearQueueDatabases();
      if (generation !== bootGenerationRef.current) return;
      await initSheetwrite();
      if (generation !== bootGenerationRef.current) return;
      stopServers();
      busRef.current = new ShowcasePresenceBus();
      documentRef.current = "forecast";
      setServerVersion(0);
      setServerLog([]);
      startServer("forecast");
      await bootClient("a", generation, "forecast");
      if (generation !== bootGenerationRef.current) return;
      await bootClient("b", generation, "forecast");
      if (generation !== bootGenerationRef.current) return;
      // Both clients are subscribed now; announce presence deterministically.
      await clientsRef.current.a?.presence.publishNow();
      await clientsRef.current.b?.presence.publishNow();
      if (generation !== bootGenerationRef.current) return;
      setStatus("ready");
      setStatusDetail("Two live clients, one sequencing server");
    } catch (error) {
      if (generation !== bootGenerationRef.current) return;
      setStatus("error");
      setStatusDetail(error instanceof Error ? error.message : String(error));
    }
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: the public page owns one mount/unmount session; reset invokes the current callbacks explicitly.
  useEffect(() => {
    const generation = bootGenerationRef.current + 1;
    bootGenerationRef.current = generation;
    bootQueueRef.current = bootQueueRef.current.then(() => bootAll(generation));
    return () => {
      if (bootGenerationRef.current === generation) bootGenerationRef.current += 1;
      for (const key of CLIENT_KEYS) disposeClient(key);
      stopServers();
      busRef.current = null;
    };
  }, []);

  useEffect(() => {
    const observer = new MutationObserver(() => {
      for (const key of CLIENT_KEYS) clientsRef.current[key]?.grid.replaceTheme({});
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  const sampleEdit = (key: ClientKey) => {
    void (async () => {
      if (!(await showDocument("forecast"))) return;
      editForecast(key);
    })();
  };

  const editForecast = (key: ClientKey) => {
    const runtime = clientsRef.current[key];
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
    const runtime = clientsRef.current[key];
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
   * A seconds-long storm: both clients edit their own rows while connections
   * drop, reconnect, and broadcasts arrive out of order. Then both clients
   * reconnect and the page compares their Grids cell by cell.
   */
  const runChaos = async () => {
    const run = chaosRunRef.current + 1;
    chaosRunRef.current = run;
    const stillRunning = () =>
      chaosRunRef.current === run && clientsRef.current.a !== null && clientsRef.current.b !== null;
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
    if (!(await showDocument("forecast"))) {
      report.phase = "timed-out";
      publish();
      return;
    }
    started = performance.now();
    // Read after the switch: a remount brings both clients back online.
    const offline: Record<ClientKey, boolean> = {
      a: clientsRef.current.a?.link.connected === false,
      b: clientsRef.current.b?.link.connected === false,
    };
    // Bring the rows where Ana's half meets Bram's on screen in both Grids, so
    // every edit and every synced arrival is visible while the storm runs.
    for (const key of CLIENT_KEYS) {
      showRows(key, CHAOS_VIEW_ROWS);
      shownRowsRef.current[key] = visibleRows(key);
    }
    // Seeded per run, so a run's fault sequence can be reproduced exactly.
    const random = seededRandom(run);

    while (performance.now() - started < CHAOS_STORM_MS && stillRunning()) {
      const key: ClientKey = random() < 0.5 ? "a" : "b";
      const runtime = clientsRef.current[key];
      // A recovering client is being remounted and accepts no new edits.
      if (!runtime || recoveringRef.current[key]) {
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
        const view = shownRowsRef.current[key];
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
    // Wait until both queues drain, no conflict recovery is still running, and
    // both clients sit at the server head: a client stuck on a version gap has
    // nothing queued but has not caught up.
    const settleBy = performance.now() + CHAOS_DRAIN_MS;
    const head = () => serversRef.current.forecast?.headVersion(DOCUMENT_ID.forecast) ?? -1;
    const idle = () =>
      CLIENT_KEYS.every(
        (key) =>
          (clientsRef.current[key]?.sync.pendingCommits().length ?? 1) === 0 &&
          !recoveringRef.current[key] &&
          clientsRef.current[key]?.sync.serverVersion === head(),
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
    const a = clientsRef.current.a?.grid;
    const b = clientsRef.current.b?.grid;
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
  };

  const clientsBusy = () =>
    CLIENT_KEYS.some(
      (key) =>
        (clientsRef.current[key]?.sync.pendingCommits().length ?? 1) > 0 ||
        recoveringRef.current[key],
    );

  /**
   * 0.5.0 atomic batch: clear 100,000 metered-usage cells on Ana's client,
   * then undo it once. The restore is far above one server version, so the
   * engine splits it into one atomic multi-version batch; Bram applies every
   * version in a single transaction or none of them.
   */
  const restoreUsage = () => {
    const started = performance.now();
    setRestoreRunning(true);
    setBatchReport(null);
    drillRef.current = true;
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
        const restorer = clientsRef.current.a;
        const peer = clientsRef.current.b;
        const server = serversRef.current.usage;
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
        pushClientLog("a", "error", error instanceof Error ? error.message : String(error));
      } finally {
        drillRef.current = false;
        setRestoreRunning(false);
      }
    })();
  };

  /** Waits until one client is at the given server version with nothing queued. */
  const waitForPeerHead = async (peer: ClientRuntime, version: number): Promise<boolean> => {
    const deadline = performance.now() + CHAOS_SETTLE_MS;
    const atHead = () =>
      peer.sync.serverVersion >= version && peer.sync.pendingCommits().length === 0;
    while (performance.now() < deadline && !atHead()) await delay(CHAOS_TICK_MS);
    return atHead();
  };

  const loseNextAck = (key: ClientKey) => {
    clientsRef.current[key]?.link.dropNextAcknowledgement();
    pushClientLog(key, "info", "The next acknowledgement (and its echo) will be lost in transit");
  };

  const retryPending = (key: ClientKey) => {
    const runtime = clientsRef.current[key];
    if (!runtime) return;
    const head = runtime.sync.pendingCommits()[0];
    if (!head) {
      pushClientLog(key, "info", "Nothing pending to retry");
      return;
    }
    pushClientLog(key, "info", `Retrying ${head.clientMutationId} with its original mutation id`);
    void runtime.sync.retry(head.clientMutationId).catch(() => {});
  };

  const holdNextBroadcast = (key: ClientKey) => {
    clientsRef.current[key]?.link.holdNextBroadcast();
    pushClientLog(key, "info", "The next inbound broadcast will be held back (delivery reordered)");
  };

  const releaseHeld = (key: ClientKey) => {
    clientsRef.current[key]?.link.releaseHeldBroadcasts();
  };

  const serverEdit = () => {
    void (async () => {
      if (!(await showDocument("forecast"))) return;
      const server = serversRef.current.forecast;
      if (!server) return;
      const runtime = clientsRef.current.a ?? clientsRef.current.b;
      const addr = { sheet: "plan", row: 4, col: 2 };
      const current = runtime?.grid.store.getCell(addr).resolved;
      const forecast =
        typeof current === "number" ? current + FORECAST_ADJUSTMENT : FORECAST_ADJUSTMENT;
      await server
        .commitServerOperations(DOCUMENT_ID.forecast, [
          { op: "set", addr, value: { kind: "literal", value: forecast } },
        ])
        .catch(() => {});
    })();
  };

  /** Documented host recovery: rebase, clear stale durable ids, remount, resubmit. */
  const recoverClient = async (key: ClientKey, response: ConflictResponse) => {
    if (recoveringRef.current[key]) return;
    recoveringRef.current[key] = true;
    let frozen: Grid | null = null;
    try {
      const runtime = clientsRef.current[key];
      const host = hostRefs[key].current;
      const server = runtime ? serversRef.current[runtime.document] : null;
      const bus = busRef.current;
      if (!runtime || !host || !server || !bus) return;
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
      if (clientsRef.current[key] !== runtime) return;
      // Remounting resets the scroll position; keep the reader's place.
      const shownRows = visibleRows(key);
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
      const { actor, link, storage, document: target } = runtime;
      for (const dispose of runtime.disposers) dispose();
      runtime.disposers.length = 0;
      runtime.presence.destroy();
      runtime.sync.destroy();
      runtime.grid.destroy();
      link.discardParkedBroadcasts();
      clientsRef.current[key] = null;

      // Loading and validating the whole document is the expensive step. Give
      // the browser a frame before each half so scrolling keeps painting.
      await delay(0);
      const latest = response.snapshot ?? (await link.load(DOCUMENT_ID[target]));
      // Broadcasts sequenced while the client remounts wait in the link for
      // the new coordinator; the ones this snapshot already holds are dropped.
      link.startFrom(latest.version ?? 0);
      await delay(0);
      host.replaceChildren();
      const grid = createGridFromSnapshot(host, latest, {
        presentation: "data-grid",
        transactionResourceLimits: { maxEncodedBytes: DEMO_TRANSACTION_BYTES },
      });
      const sync = new SyncCoordinator(grid, link, {
        documentId: DOCUMENT_ID[target],
        serverVersion: latest.version ?? 0,
        pendingStorage: storage,
        createMutationId: () => `${actor.id}-${Date.now().toString(36)}-${nextMutation++}`,
        limits: { maxVersionPayloadBytes: DEMO_VERSION_BYTES },
      });
      const presence = new PresenceCoordinator(grid, bus.endpoint(), { actor, heartbeatMs: 0 });
      const next: ClientRuntime = {
        actor,
        generation: bootGenerationRef.current,
        document: target,
        link,
        storage,
        grid,
        sync,
        presence,
        disposers: [],
      };
      wireClient(key, next);
      clientsRef.current[key] = next;
      next.disposers.push(sync.subscribe(link));
      await sync.ready();
      if (bootGenerationRef.current !== next.generation) return;
      for (const batch of rebasedBatches) {
        const outcome = grid.applyTransaction({ patches: batch });
        if (outcome.status !== "applied") {
          pushClientLog(key, "error", `Rebased transaction was not applied: ${outcome.status}`);
          return;
        }
      }
      await sync.flush();
      await presence.publishNow();
      if (shownRows) showRows(key, shownRows);
      shownRowsRef.current[key] = visibleRows(key);
      patchView(key, { ready: true, online: true, linkState: link.state() });
      readClient(key);
      pushClientLog(
        key,
        "commit",
        `Recovered at v${latest.version ?? 0}: rebased work resubmitted as new mutations`,
      );
    } catch (error) {
      pushClientLog(key, "error", error instanceof Error ? error.message : String(error));
    } finally {
      // A recovery that stopped before the remount leaves the old Grid live.
      if (frozen && clientsRef.current[key]?.grid === frozen) frozen.setReadOnly(false);
      recoveringRef.current[key] = false;
    }
  };

  const resetDemo = () => {
    const generation = bootGenerationRef.current + 1;
    bootGenerationRef.current = generation;
    void (async () => {
      for (const key of CLIENT_KEYS) disposeClient(key);
      stopServers();
      if (generation !== bootGenerationRef.current) return;
      setViews({ a: EMPTY_CLIENT_VIEW, b: EMPTY_CLIENT_VIEW });
      await bootAll(generation);
    })();
  };

  const bramPending = views.b.syncState?.pendingCount ?? 0;
  const challengePhase =
    !views.b.online && bramPending === 0
      ? "offline"
      : !views.b.online && bramPending > 0
        ? "queued"
        : views.b.online && bramPending > 0
          ? "reconnecting"
          : serverVersion > 0
            ? "resolved"
            : "initial";
  const challengeCopy = {
    initial: ["Start with a disconnect", "Take Bram offline. His Grid remains editable."],
    offline: [
      "Bram is offline",
      "Queue a real Grid edit while the server stays at its current head.",
    ],
    queued: [
      `${bramPending} edit${bramPending === 1 ? "" : "s"} waiting`,
      "Reconnect to sequence the durable queue and broadcast the result to Ana.",
    ],
    reconnecting: ["Queue is draining", "The server is sequencing Bram’s pending work in order."],
    resolved: ["Clients converged", "Both Grids now reflect the sequenced server history."],
  }[challengePhase];
  const atHead = (key: ClientKey) =>
    views[key].ready &&
    views[key].syncState?.serverVersion === serverVersion &&
    views[key].syncState?.pendingCount === 0;
  const clientsAtHead = CLIENT_KEYS.filter(atHead).length;

  return (
    <section aria-label="Collaboration protocol showcase" className="sw-clb" data-state={status}>
      <header className="sw-clb__bar">
        <div className="sw-clb__bar-title">
          <p>Two clients · one sequencing server</p>
          <h2>Two analysts. One shared forecast.</h2>
        </div>
        <div className="sw-clb__bar-actions">
          <div className="sw-clb__chaos" data-phase={chaos?.phase ?? "idle"}>
            <button
              className="sw-clb__button"
              data-testid="clb-chaos"
              data-variant="primary"
              disabled={
                status !== "ready" ||
                chaos?.phase === "storm" ||
                chaos?.phase === "settling" ||
                restoreRunning
              }
              onClick={() => void runChaos()}
              type="button"
            >
              {chaos?.phase === "storm"
                ? "Chaos running…"
                : chaos?.phase === "settling"
                  ? "Reconnecting…"
                  : "Run a chaos test"}
            </button>
          </div>
          <button
            className="sw-clb__button"
            data-testid="clb-restore"
            disabled={
              status !== "ready" ||
              restoreRunning ||
              chaos?.phase === "storm" ||
              chaos?.phase === "settling"
            }
            onClick={restoreUsage}
            type="button"
          >
            {restoreRunning ? "Restoring usage…" : "Clear 100,000 cells, then undo"}
          </button>
        </div>
        <p className="sw-clb__status" data-status={status} data-testid="clb-status">
          {status === "ready" ? "Live" : status === "error" ? "Error" : "Loading"}
          <span className="sw-clb__status-detail">{statusDetail}</span>
        </p>
        <output aria-live="polite" className="sw-clb__chaos-report" data-testid="clb-chaos-report">
          {chaos === null
            ? "Six seconds of concurrent edits, dropped connections, and reordered broadcasts."
            : chaos.phase === "converged"
              ? `Converged: ${chaos.edits} edits, ${chaos.disconnects} disconnects, ${chaos.reorders} reordered broadcasts. All ${chaos.cells} cells match on both clients.`
              : chaos.phase === "diverged"
                ? `Not converged: ${chaos.mismatches} of ${chaos.cells} cells differ.`
                : chaos.phase === "timed-out"
                  ? `Not settled: work was still queued or recovering after ${CHAOS_DRAIN_MS / 1000} seconds.`
                  : `${chaos.edits} edits · ${chaos.disconnects} disconnects · ${chaos.reorders} reordered · ${(chaos.ms / 1000).toFixed(1)} s`}
        </output>
      </header>

      <section aria-label="Live forecast convergence" className="sw-clb__forecast-hud">
        {CLIENT_KEYS.map((key) => {
          const actor = key === "a" ? COLLABORATION_ACTORS[0] : COLLABORATION_ACTORS[1];
          const pending = views[key].syncState?.pendingCount ?? 0;
          const state = pending > 0 ? "queued" : !atHead(key) ? "behind" : "current";
          return (
            <div className="sw-clb__forecast-card" data-head={state} key={key}>
              <header>
                <span>{actor.displayName}'s forecast</span>
                <output>
                  {pending > 0
                    ? `${pending} queued`
                    : state === "behind"
                      ? "Catching up"
                      : "Caught up"}
                </output>
              </header>
              <strong>{views[key].total}</strong>
              <p>
                Client version <b>v{views[key].syncState?.serverVersion ?? 0}</b>
              </p>
            </div>
          );
        })}
        <div
          aria-live="polite"
          className="sw-clb__convergence"
          data-state={clientsAtHead === 2 ? "current" : "waiting"}
        >
          <span>Server head</span>
          <strong>v{serverVersion}</strong>
          <output>{clientsAtHead === 2 ? "Both clients caught up" : "Waiting for clients"}</output>
        </div>
      </section>

      {batchReport && (
        <div
          className="sw-clb__batch"
          data-state={batchReport.passed ? "passed" : "failed"}
          data-testid="clb-batch-report"
          role="status"
        >
          <strong>
            {batchReport.passed
              ? "Atomic batch passed: every version or none."
              : "The batch restore did not meet every check."}
          </strong>
          <p>
            Ana cleared 100,000 usage cells and undid it once. The undo committed{" "}
            {batchReport.versions} server versions as one atomic batch ({batchReport.pieces}{" "}
            operations, {(batchReport.operationBytes / 1024 / 1024).toFixed(1)} MiB of document
            operations). Bram applied the batch in {batchReport.peerChanges} transaction.
          </p>
          <dl className="sw-clb__batch-totals">
            <div>
              <dt>Ana's billable units</dt>
              <dd>
                {batchReport.totalBefore.toLocaleString("en-US")} →{" "}
                {batchReport.totalAfter.toLocaleString("en-US")}
              </dd>
            </div>
            <div>
              <dt>Bram's billable units</dt>
              <dd>{batchReport.peerTotal.toLocaleString("en-US")}</dd>
            </div>
            <div>
              <dt>Took</dt>
              <dd>{formatDuration(batchReport.ms)}</dd>
            </div>
          </dl>
        </div>
      )}

      <div className="sw-clb__workbench">
        <ClientPanel
          account={sampleAccount("a")}
          actor={COLLABORATION_ACTORS[0]}
          onSampleEdit={() => sampleEdit("a")}
          onToggleOnline={(online) => toggleOnline("a", online)}
          slug="a"
          view={views.a}
        >
          <div
            aria-label={`${COLLABORATION_ACTORS[0].displayName}'s workbook`}
            className="sw-clb__grid"
            data-testid="clb-a-grid"
            ref={hostRefs.a}
            role="application"
          />
        </ClientPanel>

        <section
          aria-labelledby="clb-sequence-title"
          className="sw-clb__sequence"
          data-phase={challengePhase}
          data-testid="clb-sequence"
        >
          <header>
            <span>Sequencing lane</span>
            <output data-testid="clb-server-version">v{serverVersion}</output>
          </header>
          <div aria-live="polite" className="sw-clb__challenge">
            <span className="sw-clb__challenge-state">{challengePhase}</span>
            <h3 id="clb-sequence-title">{challengeCopy[0]}</h3>
            <p>{challengeCopy[1]}</p>
          </div>
          <ol aria-label="Offline reconnect sequence" className="sw-clb__steps">
            <li data-current={challengePhase === "initial" ? "true" : undefined}>
              <button
                className="sw-clb__button"
                disabled={status !== "ready" || !views.b.online}
                onClick={() => toggleOnline("b", false)}
                type="button"
              >
                <span aria-hidden="true">01</span> Take Bram offline
              </button>
            </li>
            <li data-current={challengePhase === "offline" ? "true" : undefined}>
              <button
                className="sw-clb__button"
                disabled={status !== "ready" || views.b.online}
                onClick={() => sampleEdit("b")}
                type="button"
              >
                <span aria-hidden="true">02</span> Queue one Grid edit
              </button>
            </li>
            <li data-current={challengePhase === "queued" ? "true" : undefined}>
              <button
                className="sw-clb__button"
                disabled={status !== "ready" || views.b.online}
                onClick={() => toggleOnline("b", true)}
                type="button"
              >
                <span aria-hidden="true">03</span> Reconnect
              </button>
            </li>
          </ol>
          <div aria-hidden="true" className="sw-clb__direction">
            <span>Ana</span>
            <i>commit → order → broadcast</i>
            <span>Bram</span>
          </div>
          <section aria-label="Recent server decisions" className="sw-clb__decisions">
            <h3>Server decisions</h3>
            <ol aria-live="polite" className="sw-clb__server-log" data-testid="clb-server-log">
              {serverLog.length === 0 ? (
                <li className="sw-clb__log-empty">Waiting for the first commit.</li>
              ) : (
                serverLog.map((entry) => (
                  <li data-ack={entry.status} key={entry.id}>
                    {entry.text}
                  </li>
                ))
              )}
            </ol>
          </section>
        </section>

        <ClientPanel
          account={sampleAccount("b")}
          actor={COLLABORATION_ACTORS[1]}
          onSampleEdit={() => sampleEdit("b")}
          onToggleOnline={(online) => toggleOnline("b", online)}
          slug="b"
          view={views.b}
        >
          <div
            aria-label={`${COLLABORATION_ACTORS[1].displayName}'s workbook`}
            className="sw-clb__grid"
            data-testid="clb-b-grid"
            ref={hostRefs.b}
            role="application"
          />
        </ClientPanel>
      </div>

      <details className="sw-clb__advanced">
        <summary>Advanced protocol faults</summary>
        <div className="sw-clb__advanced-body">
          {CLIENT_KEYS.map((key) => {
            const actor = key === "a" ? COLLABORATION_ACTORS[0] : COLLABORATION_ACTORS[1];
            const held = views[key].linkState?.heldBroadcasts ?? 0;
            return (
              <section
                aria-labelledby={`clb-${key}-faults-title`}
                className="sw-clb__fault-client"
                data-fault-client={key}
                key={key}
              >
                <h3 id={`clb-${key}-faults-title`}>{actor.displayName} · transport faults</h3>
                <div
                  aria-label={`${actor.displayName}'s advanced network controls`}
                  className="sw-clb__controls"
                  role="toolbar"
                >
                  <button
                    className="sw-clb__button"
                    data-variant="quiet"
                    onClick={() => loseNextAck(key)}
                    type="button"
                  >
                    Lose next ack
                  </button>
                  <button
                    className="sw-clb__button"
                    data-variant="quiet"
                    onClick={() => retryPending(key)}
                    type="button"
                  >
                    Retry pending
                  </button>
                  <button
                    className="sw-clb__button"
                    data-variant="quiet"
                    onClick={() => holdNextBroadcast(key)}
                    type="button"
                  >
                    Hold next broadcast
                  </button>
                  <button
                    className="sw-clb__button"
                    data-variant="quiet"
                    onClick={() => releaseHeld(key)}
                    type="button"
                  >
                    Release held
                    {held > 0 ? <span className="sw-clb__held-count">{held}</span> : null}
                  </button>
                </div>
                <ol
                  aria-label={`${actor.displayName}'s sync events`}
                  aria-live="polite"
                  className="sw-clb__log"
                  data-testid={`clb-${key}-log`}
                >
                  {views[key].log.length === 0 ? (
                    <li className="sw-clb__log-empty">Sync events appear here.</li>
                  ) : (
                    views[key].log.map((entry) => (
                      <li data-kind={entry.kind} key={entry.id}>
                        {entry.text}
                      </li>
                    ))
                  )}
                </ol>
              </section>
            );
          })}
          <section aria-labelledby="clb-server-tools-title" className="sw-clb__server-tools">
            <h3 id="clb-server-tools-title">Server and recovery</h3>
            <div className="sw-clb__controls">
              <button className="sw-clb__button" onClick={serverEdit} type="button">
                Server-authored commit
              </button>
              <button
                className="sw-clb__button"
                data-variant="danger"
                onClick={resetDemo}
                type="button"
              >
                Reset demo
              </button>
            </div>
            <p className="sw-clb__server-note">
              <span className="sw-clb__server-note-tag">Demo-only</span>
              <span>
                This in-page sequencer makes the real <code>PersistenceAdapter</code> +{" "}
                <code>RemoteOperationSource</code> boundary observable. Your backend supplies that
                transport and durable store.
              </span>
            </p>
          </section>
        </div>
      </details>
    </section>
  );
}

interface ClientPanelProps {
  account: string;
  actor: ShowcaseActor;
  children: ReactNode;
  onSampleEdit(): void;
  onToggleOnline(online: boolean): void;
  slug: ClientKey;
  view: ClientView;
}

function ClientPanel({
  account,
  actor,
  children,
  onSampleEdit,
  onToggleOnline,
  slug,
  view,
}: Readonly<ClientPanelProps>) {
  const connection = view.online ? "online" : "offline";
  const pending = view.syncState?.pendingCount ?? 0;
  const latestEvent = view.log[0]?.text ?? "No sync events yet.";
  return (
    <article
      aria-label={`Client ${actor.displayName}`}
      className="sw-clb__client"
      data-client={slug}
      data-connection={connection}
    >
      <header className="sw-clb__client-head">
        <span className="sw-clb__actor">{actor.displayName}</span>
        <span
          className="sw-clb__connection"
          data-connection={connection}
          data-testid={`clb-${slug}-connection`}
        >
          {connection}
        </span>
        <label className="sw-proofs-switch" data-state={view.online ? "on" : "paused"}>
          <input
            aria-label={`${actor.displayName} online`}
            checked={view.online}
            disabled={!view.ready}
            onChange={(event) => onToggleOnline(event.currentTarget.checked)}
            type="checkbox"
          />
          <span aria-hidden="true" className="sw-proofs-switch-track">
            <span className="sw-proofs-switch-thumb" />
          </span>
          <span aria-hidden="true" className="sw-proofs-switch-copy">
            <span className="sw-proofs-switch-state">{view.online ? "Online" : "Offline"}</span>
          </span>
        </label>
      </header>

      {children}

      <div className="sw-clb__client-action">
        <button
          className="sw-clb__button"
          disabled={!view.ready}
          onClick={onSampleEdit}
          type="button"
        >
          Add $500 to {account}
        </button>
        <p aria-live="polite">
          <span>Latest</span>
          {latestEvent}
        </p>
      </div>

      <dl className="sw-clb__stats">
        <div>
          <dt>Version</dt>
          <dd data-testid={`clb-${slug}-version`}>v{view.syncState?.serverVersion ?? 0}</dd>
        </div>
        <div>
          <dt>Queue</dt>
          <dd data-state={pending > 0 ? "queued" : undefined} data-testid={`clb-${slug}-pending`}>
            {pending}
          </dd>
        </div>
        <div>
          <dt>Grid total</dt>
          <dd data-testid={`clb-${slug}-total`}>{view.total}</dd>
        </div>
        <div className="sw-clb__presence">
          <dt>Presence</dt>
          <dd>
            <ul
              aria-label={`Collaborators visible to ${actor.displayName}`}
              data-testid={`clb-${slug}-roster`}
            >
              {view.roster.length === 0 ? (
                <li className="sw-clb__presence-empty">No one yet</li>
              ) : (
                view.roster.map((message) => (
                  <li key={message.actor.id}>{message.actor.displayName ?? message.actor.id}</li>
                ))
              )}
            </ul>
          </dd>
        </div>
      </dl>
    </article>
  );
}
