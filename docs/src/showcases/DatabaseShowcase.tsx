import {
  createGridFromSnapshot,
  type DocumentOp,
  type Grid,
  initSheetwrite,
  type PersistenceCommitResponse,
  rebaseDocumentOperations,
  SyncCoordinator,
  type SyncStateSnapshot,
  type Theme,
} from "@sheetwrite/core";
import { IndexedDbPendingCommitStorage } from "@sheetwrite/core/browser";
import "@sheetwrite/core/styles.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { ShowcaseLinkError, ShowcaseNetworkLink } from "./collaboration-protocol.js";
import { makeUsageSheet, USAGE_RANGE, USAGE_TOTAL_CELL } from "./scenarios/durable-usage.js";
import {
  DATABASE_DOCUMENT_ID,
  DATABASE_REVENUE_ROWS,
  DATABASE_TOTAL_CELL,
  deleteShowcaseDatabase,
  makeDatabaseSeedSnapshot,
  type ShowcaseDatabaseStats,
  ShowcaseIndexedDbAdapter,
} from "./showcase-database.js";

const DOCUMENT_DATABASE = "sheetwrite-showcase-subscription-revenue";
const QUEUE_DATABASE = "sheetwrite-showcase-subscription-revenue-queue";
const COMPACTION = { maxTailRecords: 8, maxTailBytes: 64 * 1024 } as const;
const LOG_LIMIT = 14;
const SAMPLE_ROWS = DATABASE_REVENUE_ROWS;
/** The tight-limit proof: a 128-byte transaction ceiling rejects the big undo. */
const TIGHT_LIMIT_BYTES = 128;
const TIGHT_LIMIT_RECEIPT_CHARS = 8_192;
const TIGHT_LIMIT_SHEET = "limit";
const TIGHT_LIMIT_NOTE_CELL = { sheet: TIGHT_LIMIT_SHEET, row: 0, col: 1 } as const;
const TIGHT_LIMIT_RECEIPT_CELL = { sheet: TIGHT_LIMIT_SHEET, row: 0, col: 0 } as const;
const TIGHT_LIMIT_NOTE = "Manual review note";

type ConflictResponse = Extract<PersistenceCommitResponse, { status: "conflict" }>;

interface LogEntry {
  id: number;
  kind: "info" | "pending" | "commit" | "warn" | "error";
  text: string;
}

/** One page reload's own record of the durable queue it restored. */
interface CrashReport {
  expected: number;
  restored: number;
  totalBefore: string;
  totalAfter: string;
}

interface UndoReport {
  before: number;
  cleared: number;
  after: number;
  decodedBytes: number;
  wireBytes: number;
  versions: number;
  undoSteps: number;
  passed: boolean;
}

interface LimitReport {
  rejected: boolean;
  clearedStayedCleared: boolean;
  olderEditRestored: boolean;
  passed: boolean;
}

interface DatabaseSession {
  adapter: ShowcaseIndexedDbAdapter;
  link: ShowcaseNetworkLink;
  storage: IndexedDbPendingCommitStorage;
  grid: Grid;
  sync: SyncCoordinator;
  disposers: Array<() => void>;
}

interface SessionCallbacks {
  onStats(stats: ShowcaseDatabaseStats): void;
  onSyncState(state: SyncStateSnapshot): void;
  onLog(kind: LogEntry["kind"], text: string): void;
  onConflict(response: ConflictResponse): void;
  onRestored(count: number): void;
  autosave(): boolean;
}

let nextMutation = 1;

/** Survives the page reload of the reload test; read once on the next load. */
const CRASH_TEST_KEY = "sheetwrite:dbx-reload-test";
const CRASH_TEST_EDITS = 3;

/** Every held edit came back, and the ledger shows the same total as before the reload. */
function reloadTestPassed(report: CrashReport): boolean {
  return report.restored === report.expected && report.totalAfter === report.totalBefore;
}

function createMutationId(): string {
  return `dbx-${Date.now().toString(36)}-${nextMutation++}`;
}

/** Stored bytes in the unit a reader can size up at a glance. */
function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024).toLocaleString("en-US")} KiB`;
  return `${bytes} B`;
}

function resolveDatabaseGridTheme(host: HTMLElement): Partial<Theme> {
  const mode = document.documentElement.dataset.theme === "light" ? "light" : "dark";
  host.dataset.gridTheme = mode;

  const probe = document.createElement("span");
  probe.ariaHidden = "true";
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  host.append(probe);
  const resolveColor = (value: string): string => {
    probe.style.color = value;
    return getComputedStyle(probe).color;
  };
  const token = (name: string): string => resolveColor(`var(${name})`);
  const mix = (name: string, amount: number): string =>
    resolveColor(`color-mix(in srgb, var(${name}) ${amount}%, transparent)`);
  probe.style.font = "500 13px var(--sw-font-body)";
  const font = getComputedStyle(probe).font;
  const theme: Partial<Theme> = {
    bg: token("--sw-surface-1"),
    fg: token("--sw-fg"),
    gridLine: token("--sw-border"),
    headerBg: token("--sw-surface-2"),
    headerFg: token("--sw-accent-strong"),
    selection: mix("--sw-accent", 14),
    selectionBorder: token("--sw-accent"),
    searchMatch: mix("--sw-demo-warn", 25),
    searchActiveMatch: token("--sw-demo-warn"),
    highlight: mix("--sw-accent", 20),
    font,
  };
  probe.remove();
  return theme;
}

function mountDatabaseGrid(host: HTMLElement, snapshot: unknown): Grid {
  return createGridFromSnapshot(host, snapshot, {
    presentation: "data-grid",
    theme: resolveDatabaseGridTheme(host),
  });
}

/** Delay before autosave resumes a durable queue whose send failed in transit. */
const AUTO_RESUME_MS = 400;

/** Attaches the storage-gauge and sync-event listeners one session needs. */
function wireSession(
  session: DatabaseSession,
  callbacks: SessionCallbacks,
  isCurrent: () => boolean = () => true,
): void {
  const { adapter, sync } = session;
  // A failed send puts the commit back in the durable queue without a new
  // "pending" event, so autosave must resume the queue by itself. Without this
  // the record waits for another edit (or an explicit retry) before it moves.
  let resumeTimer: number | undefined;
  const resumeSend = () => {
    if (resumeTimer !== undefined) return;
    resumeTimer = window.setTimeout(() => {
      resumeTimer = undefined;
      if (!isCurrent() || !callbacks.autosave()) return;
      if (sync.pendingCount === 0 || sync.state.activity === "sending") return;
      void sync.flush().catch(() => {
        // The next "error" event schedules another resume.
      });
    }, AUTO_RESUME_MS);
  };
  session.disposers.push(() => {
    clearTimeout(resumeTimer);
  });
  session.disposers.push(
    adapter.subscribeStats((stats) => {
      if (isCurrent()) callbacks.onStats(stats);
    }),
  );
  session.disposers.push(
    sync.on((event) => {
      if (!isCurrent()) return;
      switch (event.type) {
        case "state":
          callbacks.onSyncState(event.state);
          break;
        case "pending":
          callbacks.onLog(
            "pending",
            `Pending write ${event.mutation.clientMutationId} persisted to IndexedDB`,
          );
          if (callbacks.autosave()) {
            void sync.flush().catch(() => {
              // Failures are surfaced through the "error" event below.
            });
          }
          break;
        case "acknowledged":
          callbacks.onLog(
            "commit",
            event.duplicate
              ? `Duplicate acknowledgement for ${event.clientMutationId}: already stored as v${event.version}, applied once`
              : `Committed v${event.version} (${event.clientMutationId})`,
          );
          break;
        case "restored":
          callbacks.onRestored(event.pending.length);
          if (event.pending.length > 0) {
            callbacks.onLog(
              "info",
              `Restored ${event.pending.length} durable pending commit${event.pending.length === 1 ? "" : "s"} from IndexedDB`,
            );
          }
          break;
        case "conflict":
          callbacks.onLog(
            "warn",
            `Base-version conflict at v${event.mutation.baseVersion}: another writer reached v${event.response.currentVersion} first`,
          );
          callbacks.onConflict(event.response);
          break;
        case "error":
          if (event.error instanceof ShowcaseLinkError) {
            callbacks.onLog("warn", event.error.message);
          } else if (event.error.cause instanceof ShowcaseLinkError) {
            // The coordinator wraps transport failures; keep the link message readable.
            callbacks.onLog("warn", event.error.cause.message);
          } else {
            callbacks.onLog(
              "error",
              event.error instanceof Error ? event.error.message : String(event.error),
            );
          }
          resumeSend();
          break;
        default:
          break;
      }
    }),
  );
}

/**
 * Opens one session. A cancelled boot stops before `sync.ready()`, because
 * `ready()` restores the durable queue and flushes it: a stale StrictMode boot
 * must never touch the queue that the live session is about to drain.
 */
async function openSession(
  host: HTMLElement,
  callbacks: SessionCallbacks,
  signal: AbortSignal,
): Promise<DatabaseSession | null> {
  await initSheetwrite();
  if (signal.aborted) return null;
  const seed = makeDatabaseSeedSnapshot();
  const adapter = await ShowcaseIndexedDbAdapter.open(
    { ...seed, sheets: [...seed.sheets, makeUsageSheet()] },
    {
      databaseName: DOCUMENT_DATABASE,
      compaction: COMPACTION,
      maxConflictTailVersions: 16,
    },
  );
  const snapshot = await adapter.load(DATABASE_DOCUMENT_ID, signal);
  if (signal.aborted) {
    adapter.close();
    return null;
  }
  host.replaceChildren();
  const grid = mountDatabaseGrid(host, snapshot);
  const storage = new IndexedDbPendingCommitStorage({ databaseName: QUEUE_DATABASE });
  const link = new ShowcaseNetworkLink(adapter);
  const sync = new SyncCoordinator(grid, link, {
    documentId: DATABASE_DOCUMENT_ID,
    serverVersion: snapshot.version ?? 0,
    pendingStorage: storage,
    createMutationId,
  });
  const session: DatabaseSession = { adapter, link, storage, grid, sync, disposers: [] };
  const isCurrent = () => !signal.aborted;
  wireSession(session, callbacks, isCurrent);
  if (signal.aborted) {
    disposeSession(session);
    return null;
  }
  await sync.ready();
  if (signal.aborted) {
    disposeSession(session);
    return null;
  }
  if (sync.pendingCount > 0 && callbacks.autosave()) {
    await sync.flush();
    if (signal.aborted) {
      disposeSession(session);
      return null;
    }
  }
  callbacks.onSyncState(sync.state);
  callbacks.onStats(adapter.stats());
  return session;
}

function disposeSession(session: DatabaseSession, keepStores = false): void {
  for (const dispose of session.disposers) dispose();
  session.disposers.length = 0;
  session.sync.destroy();
  session.grid.destroy();
  if (!keepStores) {
    session.storage.close();
    session.adapter.close();
  }
}

export default function DatabaseShowcase() {
  const hostRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<DatabaseSession | null>(null);
  const autosaveRef = useRef(true);
  const logIdRef = useRef(0);
  const busyRef = useRef(false);
  const [isBusy, setIsBusy] = useState(false);
  const snapshotVersionRef = useRef<number | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [statusDetail, setStatusDetail] = useState("Opening IndexedDB…");
  const [stats, setStats] = useState<ShowcaseDatabaseStats | null>(null);
  const [syncState, setSyncState] = useState<SyncStateSnapshot | null>(null);
  const [autosave, setAutosave] = useState(true);
  const [total, setTotal] = useState<string>("–");
  const [log, setLog] = useState<LogEntry[]>([]);
  const [recoveryState, setRecoveryState] = useState("Opening IndexedDB…");
  const [crashReport, setCrashReport] = useState<CrashReport | null>(null);
  const restoredRef = useRef(0);
  const bootQueueRef = useRef<Promise<void>>(Promise.resolve());
  const [undoReport, setUndoReport] = useState<UndoReport | null>(null);
  const [undoRunning, setUndoRunning] = useState(false);
  const [limitReport, setLimitReport] = useState<LimitReport | null>(null);
  const limitHostRef = useRef<HTMLDivElement>(null);
  const limitGridRef = useRef<Grid | null>(null);

  useEffect(() => () => limitGridRef.current?.destroy(), []);

  const pushLog = useCallback((kind: LogEntry["kind"], text: string) => {
    logIdRef.current += 1;
    const entry: LogEntry = { id: logIdRef.current, kind, text };
    setLog((entries) => [entry, ...entries].slice(0, LOG_LIMIT));
  }, []);

  const readTotal = useCallback(() => {
    const session = sessionRef.current;
    if (!session) return;
    const resolved = session.grid.store.getCell(DATABASE_TOTAL_CELL).resolved;
    setTotal(
      typeof resolved === "number" ? resolved.toLocaleString("en-US") : String(resolved ?? "–"),
    );
  }, []);

  // One stable callback object; handlers always read the latest closure state
  // through refs, so remounted sessions never hold stale listeners.
  const callbacksRef = useRef<SessionCallbacks>(null as unknown as SessionCallbacks);
  callbacksRef.current = {
    onStats: (next) => {
      const previous = snapshotVersionRef.current;
      if (previous !== null && next.snapshotVersion > previous) {
        pushLog(
          "info",
          `Compacted: operation tail folded into snapshot v${next.snapshotVersion}, tail length ${next.tailLength}`,
        );
      }
      snapshotVersionRef.current = next.snapshotVersion;
      setStats(next);
      readTotal();
    },
    onSyncState: (state) => {
      setSyncState(state);
      readTotal();
    },
    onLog: pushLog,
    onConflict: (response) => {
      void recoverFromConflict(response);
    },
    onRestored: (count) => {
      restoredRef.current = count;
    },
    autosave: () => autosaveRef.current,
  };
  const stableCallbacks = useRef<SessionCallbacks>({
    onStats: (next) => callbacksRef.current.onStats(next),
    onSyncState: (state) => callbacksRef.current.onSyncState(state),
    onLog: (kind, text) => callbacksRef.current.onLog(kind, text),
    onConflict: (response) => callbacksRef.current.onConflict(response),
    onRestored: (count) => callbacksRef.current.onRestored(count),
    autosave: () => callbacksRef.current.autosave(),
  }).current;

  /**
   * Boots one session at a time. A cancelled boot never reaches `sync.ready()`,
   * so a StrictMode re-mount cannot restore and flush the same durable queue
   * twice.
   */
  const boot = useCallback(
    (announce: string | null, recovered: string, signal?: AbortSignal) => {
      const nextBoot = bootQueueRef.current.then(async () => {
        if (signal?.aborted) return;
        const host = hostRef.current;
        if (!host) return;
        setStatus("loading");
        setStatusDetail("Opening IndexedDB…");
        const bootSignal = signal ?? new AbortController().signal;
        try {
          restoredRef.current = 0;
          const session = await openSession(host, stableCallbacks, bootSignal);
          if (!session || bootSignal.aborted) return;
          sessionRef.current = session;
          snapshotVersionRef.current = session.adapter.stats().snapshotVersion;
          setStatus("ready");
          setStatusDetail("Live against real IndexedDB");
          setRecoveryState(recovered);
          readTotal();
          if (announce) pushLog("info", announce);
          const crash = sessionStorage.getItem(CRASH_TEST_KEY);
          if (crash) {
            sessionStorage.removeItem(CRASH_TEST_KEY);
            const { expected, totalBefore } = JSON.parse(crash) as {
              expected: number;
              totalBefore: string;
            };
            setCrashReport({
              expected,
              restored: restoredRef.current,
              totalBefore,
              totalAfter: String(session.grid.store.getCell(DATABASE_TOTAL_CELL).resolved ?? "–"),
            });
          }
        } catch (error) {
          if (bootSignal.aborted) return;
          setStatus("error");
          setStatusDetail(error instanceof Error ? error.message : String(error));
        }
      });
      bootQueueRef.current = nextBoot;
      return nextBoot;
    },
    [pushLog, readTotal, stableCallbacks],
  );

  useEffect(() => {
    const controller = new AbortController();
    void boot(null, "Loaded from IndexedDB", controller.signal);
    return () => {
      controller.abort();
      if (sessionRef.current) {
        disposeSession(sessionRef.current);
        sessionRef.current = null;
      }
    };
  }, [boot]);

  useEffect(() => {
    const observer = new MutationObserver(() => {
      const session = sessionRef.current;
      const host = hostRef.current;
      if (session && host) session.grid.replaceTheme(resolveDatabaseGridTheme(host));
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  /** Runs one control action at a time so overlapping clicks cannot interleave. */
  const run = (action: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setIsBusy(true);
    void action()
      .catch((error: unknown) => {
        if (!(error instanceof ShowcaseLinkError)) {
          pushLog("error", error instanceof Error ? error.message : String(error));
        }
      })
      .finally(() => {
        busyRef.current = false;
        setIsBusy(false);
      });
  };
  /**
   * 0.5.0 large undo: clear 100,000 usage cells, then undo once. The undo
   * restores the range through one compressed `restoreBlock` commit, so the
   * whole restore is one history step and one server version.
   */
  const clearAndUndoUsage = () =>
    run(async () => {
      const session = sessionRef.current;
      if (!session) return;
      setUndoRunning(true);
      try {
        await session.sync.flush();
        const before = Number(session.grid.store.getCell(USAGE_TOTAL_CELL).resolved);
        const restores: Extract<DocumentOp, { op: "restoreBlock" }>[] = [];
        let undoSteps = 0;
        const stop = session.grid.on("change", (event) => {
          if (event.commitReason !== "undo") return;
          undoSteps += 1;
          for (const operation of event.transaction.patches) {
            if (operation.op === "restoreBlock") restores.push(operation);
          }
        });
        try {
          const cleared = session.grid.applyTransaction({
            patches: [{ op: "clearRange", range: USAGE_RANGE, contents: true }],
          });
          if (cleared.status !== "applied") throw new Error(`Usage clear was ${cleared.status}.`);
          const clearedTotal = Number(session.grid.store.getCell(USAGE_TOTAL_CELL).resolved);
          await session.sync.flush();
          const versionBeforeUndo = session.sync.serverVersion;
          session.grid.undo();
          await session.sync.flush();
          const after = Number(session.grid.store.getCell(USAGE_TOTAL_CELL).resolved);
          const decodedBytes = restores.reduce(
            (bytes, operation) => bytes + operation.decodedBytes,
            0,
          );
          const wireBytes = new TextEncoder().encode(JSON.stringify(restores)).length;
          const versions = session.sync.serverVersion - versionBeforeUndo;
          const passed =
            clearedTotal === 0 &&
            after === before &&
            restores.length > 0 &&
            undoSteps === 1 &&
            versions === 1 &&
            session.sync.pendingCount === 0;
          setUndoReport({
            before,
            cleared: clearedTotal,
            after,
            decodedBytes,
            wireBytes,
            versions,
            undoSteps,
            passed,
          });
          if (passed) {
            pushLog(
              "commit",
              `Undo restored 100,000 usage cells in one history step: restoreBlock committed as v${session.sync.serverVersion} (${formatBytes(decodedBytes)} decoded → ${formatBytes(wireBytes)} wire)`,
            );
          }
        } finally {
          stop();
        }
      } finally {
        setUndoRunning(false);
      }
    });

  /** Sheet for the tight-limit proof: one oversized receipt beside a small note. */
  const makeTightLimitSnapshot = () => ({
    schemaVersion: 1,
    workbook: { activeSheet: TIGHT_LIMIT_SHEET },
    sheets: [
      {
        id: TIGHT_LIMIT_SHEET,
        name: "Undo admission",
        order: 0,
        rowCount: 1,
        columns: [
          { key: "receipt", header: "Invoice audit receipt", width: 320, type: "text" },
          { key: "note", header: "Review note", width: 200, type: "text" },
        ],
        cells: [
          {
            startRow: 0,
            startCol: 0,
            rowCount: 1,
            colCount: 2,
            cells: [
              {
                rowOffset: 0,
                colOffset: 0,
                value: {
                  kind: "literal",
                  value: Array.from({ length: TIGHT_LIMIT_RECEIPT_CHARS }, (_, index) =>
                    String.fromCharCode(33 + ((index * 37 + Math.floor(index / 17)) % 90)),
                  ).join(""),
                },
              },
              {
                rowOffset: 0,
                colOffset: 1,
                value: { kind: "literal", value: TIGHT_LIMIT_NOTE },
              },
            ],
          },
        ],
      },
    ],
  });

  /**
   * 0.5.0 oversized undo: under a 128-byte transaction ceiling, undoing the
   * clear of the oversized receipt is rejected with `resource-limit` and that
   * entry is dropped; the older note edit is still undoable.
   */
  const tryTightUndo = () => {
    const host = limitHostRef.current;
    if (!host) return;
    limitGridRef.current?.destroy();
    host.replaceChildren();
    const grid = createGridFromSnapshot(host, makeTightLimitSnapshot(), {
      presentation: "data-grid",
      transactionResourceLimits: { maxEncodedBytes: TIGHT_LIMIT_BYTES },
    });
    limitGridRef.current = grid;
    let rejected = false;
    const stop = grid.on("mutation-rejected", (event) => {
      rejected = event.issues.some((issue) => issue.kind === "resource-limit");
    });
    const noteEdit = grid.applyTransaction({
      patches: [
        {
          op: "set",
          addr: TIGHT_LIMIT_NOTE_CELL,
          value: { kind: "literal", value: "Review requested" },
        },
      ],
    });
    const cleared = grid.applyTransaction({
      patches: [
        {
          op: "clearRange",
          range: {
            sheet: TIGHT_LIMIT_SHEET,
            start: { row: 0, col: 0 },
            end: { row: 0, col: 0 },
          },
          contents: true,
        },
      ],
    });
    const clearedReceipt = grid.store.getCell(TIGHT_LIMIT_RECEIPT_CELL).resolved;
    // First undo: the oversized receipt restore is rejected and dropped.
    grid.undo();
    const receiptStayedCleared =
      grid.store.getCell(TIGHT_LIMIT_RECEIPT_CELL).resolved === clearedReceipt;
    // Second undo: the older note edit is untouched and still undoable.
    grid.undo();
    const noteRestored = grid.store.getCell(TIGHT_LIMIT_NOTE_CELL).resolved === TIGHT_LIMIT_NOTE;
    stop();
    setLimitReport({
      rejected,
      clearedStayedCleared: receiptStayedCleared,
      olderEditRestored: noteRestored,
      passed:
        noteEdit.status === "applied" &&
        cleared.status === "applied" &&
        rejected &&
        receiptStayedCleared &&
        noteRestored,
    });
  };

  const commitSampleEdit = () =>
    run(async () => {
      const session = sessionRef.current;
      if (!session) return;
      const row = (session.sync.serverVersion + session.sync.pendingCount) % SAMPLE_ROWS;
      const current = session.grid.store.getCell({ sheet: "ledger", row, col: 1 }).resolved;
      const quantity = typeof current === "number" ? current + 1 : 1;
      const outcome = session.grid.applyTransaction({
        patches: [
          {
            op: "set",
            addr: { sheet: "ledger", row, col: 1 },
            value: { kind: "literal", value: quantity },
          },
        ],
      });
      if (outcome.status !== "applied") {
        pushLog("error", `Sample edit was not applied: ${outcome.status}`);
      }
    });

  const saveNow = () =>
    run(async () => {
      await sessionRef.current?.sync.flush();
    });

  const loseNextAck = () =>
    run(async () => {
      sessionRef.current?.link.dropNextAcknowledgement();
      pushLog(
        "info",
        "The next acknowledgement will be dropped after the server stores the commit",
      );
    });

  const retryPending = () =>
    run(async () => {
      const session = sessionRef.current;
      if (!session) return;
      const pending = session.sync.pendingCommits();
      const head = pending[0];
      if (!head) {
        pushLog("info", "Nothing pending to retry");
        return;
      }
      pushLog("info", `Retrying ${head.clientMutationId} with its original mutation id`);
      // flush() waits for an in-flight send first, then resends the durable
      // queue with each record's original mutation id. A retry issued while the
      // record is still "sending" would otherwise be dropped.
      await session.sync.flush();
    });

  const simulateReload = () =>
    run(async () => {
      const session = sessionRef.current;
      if (!session) return;
      disposeSession(session);
      sessionRef.current = null;
      await boot(
        "Session closed and reopened: committed state and the durable queue came back from IndexedDB",
        "Reopened from IndexedDB",
      );
    });

  /**
   * Hold three edits in the durable queue, then reload the whole page without
   * saving. The next page load reports what IndexedDB restored.
   */
  const reloadWithUnsavedEdits = () =>
    run(async () => {
      const session = sessionRef.current;
      if (!session) return;
      autosaveRef.current = false;
      setAutosave(false);
      const expected = session.sync.pendingCount + CRASH_TEST_EDITS;
      for (let edit = 0; edit < CRASH_TEST_EDITS; edit++) {
        const row = (session.sync.serverVersion + session.sync.pendingCount) % SAMPLE_ROWS;
        const current = session.grid.store.getCell({ sheet: "ledger", row, col: 1 }).resolved;
        session.grid.applyTransaction({
          patches: [
            {
              op: "set",
              addr: { sheet: "ledger", row, col: 1 },
              value: { kind: "literal", value: typeof current === "number" ? current + 1 : 1 },
            },
          ],
        });
      }
      // Durable puts are asynchronous. Reload only when every edit is stored
      // ("pending" with the full queue); otherwise report the problem and stay.
      const deadline = performance.now() + 5_000;
      const stored = () =>
        session.sync.state.activity === "pending" && session.sync.pendingCount === expected;
      while (!stored() && performance.now() < deadline) {
        const { promise, resolve } = Promise.withResolvers<void>();
        setTimeout(resolve, 50);
        await promise;
      }
      if (!stored()) {
        pushLog(
          "error",
          `Reload test stopped: ${session.sync.pendingCount} of ${expected} edits were stored (${session.sync.state.activity})`,
        );
        return;
      }
      sessionStorage.setItem(
        CRASH_TEST_KEY,
        JSON.stringify({
          expected,
          totalBefore: String(session.grid.store.getCell(DATABASE_TOTAL_CELL).resolved ?? "–"),
        }),
      );
      location.reload();
    });

  const externalCommit = () =>
    run(async () => {
      const session = sessionRef.current;
      if (!session) return;
      const version = session.adapter.stats().currentVersion;
      const response = await session.adapter.commit({
        documentId: DATABASE_DOCUMENT_ID,
        baseVersion: version,
        clientMutationId: `external-${Date.now().toString(36)}-${nextMutation++}`,
        operations: [
          {
            op: "set",
            addr: { sheet: "ledger", row: 4, col: 2 },
            value: { kind: "literal", value: Number((1.5 + (version + 1) * 0.1).toFixed(2)) },
          },
        ],
      });
      if (response.status === "applied") {
        pushLog(
          "warn",
          `External writer committed v${response.version} directly to the database — this tab is now stale`,
        );
      }
    });

  /**
   * The documented host recovery loop: rebase every pending commit over the
   * server's operation tail, clear the stale durable ids, advance the live Grid
   * to the server head, and resubmit the safe results as new mutations. The
   * Grid is never rebuilt for a small gap — rebuilding it would re-create every
   * sheet, including the 100,000-cell usage sheet. A conflict that returns a
   * snapshot instead of a tail (a very long gap) still remounts.
   * Rebase conflicts keep the queue intact for manual review.
   */
  const recoverFromConflict = async (response: ConflictResponse) => {
    const session = sessionRef.current;
    const host = hostRef.current;
    if (!session || !host) return;
    const pending = session.sync.pendingCommits();
    const remoteOperations =
      response.operationsSinceBase?.flatMap((entry) => [...entry.operations]) ?? [];
    if (remoteOperations.length === 0 && !response.snapshot) {
      pushLog("error", "Manual review required: the conflict returned no operation tail");
      return;
    }
    const rebasedBatches: DocumentOp[][] = [];
    for (const record of pending) {
      const result = rebaseDocumentOperations(record.operations, remoteOperations);
      if (result.status === "conflict") {
        pushLog("error", `Manual review required: ${result.conflict.message}`);
        return;
      }
      rebasedBatches.push([...result.operations]);
    }
    for (const record of pending) {
      await session.storage.remove(DATABASE_DOCUMENT_ID, record.clientMutationId);
    }

    let grid = session.grid;
    if (remoteOperations.length > 0) {
      const applied = grid.applyRemoteOperations(remoteOperations);
      if (applied.status !== "applied") {
        pushLog("error", `The missed server versions were not applied: ${applied.status}`);
        return;
      }
    } else if (response.snapshot) {
      disposeSession(session, true);
      sessionRef.current = null;
      host.replaceChildren();
      grid = mountDatabaseGrid(host, response.snapshot);
    }

    // A fresh coordinator owns the advanced head; the Grid keeps its cells.
    for (const dispose of session.disposers) dispose();
    session.disposers.length = 0;
    session.sync.destroy();
    const sync = new SyncCoordinator(grid, session.link, {
      documentId: DATABASE_DOCUMENT_ID,
      serverVersion: response.currentVersion,
      pendingStorage: session.storage,
      createMutationId,
    });
    const next: DatabaseSession = {
      adapter: session.adapter,
      link: session.link,
      storage: session.storage,
      grid,
      sync,
      disposers: [],
    };
    wireSession(next, stableCallbacks);
    sessionRef.current = next;
    await sync.ready();
    for (const batch of rebasedBatches) {
      const outcome = grid.applyTransaction({ patches: batch });
      if (outcome.status !== "applied") {
        pushLog("error", `Rebased local transaction was not applied: ${outcome.status}`);
        return;
      }
    }
    await sync.flush();
    stableCallbacks.onSyncState(sync.state);
    readTotal();
    pushLog(
      "commit",
      `Recovered at v${response.currentVersion}: applied ${remoteOperations.length} missed operation${remoteOperations.length === 1 ? "" : "s"} and resubmitted ${rebasedBatches.length} rebased commit${rebasedBatches.length === 1 ? "" : "s"} as new mutations`,
    );
  };

  const resetDemo = () =>
    run(async () => {
      const session = sessionRef.current;
      if (session) {
        disposeSession(session);
        sessionRef.current = null;
      }
      await deleteShowcaseDatabase(DOCUMENT_DATABASE);
      await deleteShowcaseDatabase(QUEUE_DATABASE);
      await boot(
        "Demo databases deleted; reseeded from the canonical ledger at v0",
        "Reseeded in IndexedDB",
      );
    });

  const activity = syncState?.activity ?? "hydrating";
  const pendingCount = syncState?.pendingCount ?? 0;
  const ready = status === "ready" && !isBusy;
  const diagnosticCounters: ReadonlyArray<{ id: string; label: string; value: string }> = [
    {
      id: "dbx-snapshot-version",
      label: "Snapshot revision",
      value: String(stats?.snapshotVersion ?? 0),
    },
    { id: "dbx-tail", label: "Tail records", value: String(stats?.tailLength ?? 0) },
    { id: "dbx-reads", label: "IDB reads", value: String(stats?.reads ?? 0) },
    { id: "dbx-writes", label: "IDB writes", value: String(stats?.writes ?? 0) },
  ];

  return (
    <section
      aria-busy={status === "loading"}
      aria-label="IndexedDB persistence showcase"
      className="sw-dbx"
      data-state={status}
      data-testid="dbx-instrument"
    >
      <header className="sw-dbx__bar">
        <div className="sw-dbx__bar-title">
          <p>IndexedDB · versioned document</p>
          <h2>Reload. Keep every unsaved edit.</h2>
        </div>
        <div className="sw-dbx__bar-actions">
          <button
            className="sw-dbx__button"
            data-testid="dbx-crash"
            data-variant="primary"
            disabled={!ready}
            onClick={reloadWithUnsavedEdits}
            type="button"
          >
            Reload with unsaved edits
          </button>
          <button
            className="sw-dbx__button"
            data-testid="dbx-large-undo"
            disabled={!ready || undoRunning}
            onClick={clearAndUndoUsage}
            type="button"
          >
            {undoRunning ? "Restoring usage…" : "Clear 100,000 cells, then undo"}
          </button>
        </div>
        <p
          className="sw-dbx__status"
          data-activity={activity}
          data-status={status}
          data-testid="dbx-status"
        >
          {status === "ready" ? "Ready" : status === "error" ? "Error" : "Loading"}
          <span className="sw-dbx__status-detail">{statusDetail}</span>
        </p>
        <dl aria-label="Authoritative durability state" className="sw-dbx__hud">
          <div>
            <dt>Revision</dt>
            <dd data-testid="dbx-version">{stats?.currentVersion ?? 0}</dd>
          </div>
          <div>
            <dt>Pending writes</dt>
            <dd data-state={pendingCount > 0 ? "queued" : undefined} data-testid="dbx-pending">
              {pendingCount}
            </dd>
          </div>
          <div>
            <dt>Q1 revenue</dt>
            <dd data-testid="dbx-total">${total}</dd>
          </div>
          <div>
            <dt>Allocated</dt>
            <dd data-testid="dbx-bytes">{stats ? formatBytes(stats.storedBytes) : "0 B"}</dd>
          </div>
          <div>
            <dt>Session</dt>
            <dd data-testid="dbx-reload">{recoveryState}</dd>
          </div>
        </dl>
      </header>

      {crashReport && (
        <div
          className="sw-dbx__crash"
          data-state={reloadTestPassed(crashReport) ? "passed" : "failed"}
          data-testid="dbx-crash-report"
          role="status"
        >
          <strong>
            {reloadTestPassed(crashReport)
              ? "Reload test passed."
              : "Reload test failed: the restored state differs."}
          </strong>{" "}
          <p>
            The page reloaded with {crashReport.expected} unsaved edits. IndexedDB restored{" "}
            {crashReport.restored}, and autosave saved them.
          </p>
          <dl className="sw-dbx__recovery-totals">
            <div>
              <dt>Before reload</dt>
              <dd>${Number(crashReport.totalBefore).toLocaleString("en-US")}</dd>
            </div>
            <div>
              <dt>After recovery</dt>
              <dd>${Number(crashReport.totalAfter).toLocaleString("en-US")}</dd>
            </div>
          </dl>
        </div>
      )}

      {undoReport && (
        <div
          className="sw-dbx__undo-report"
          data-state={undoReport.passed ? "passed" : "failed"}
          data-testid="dbx-undo-report"
          role="status"
        >
          <strong>
            {undoReport.passed
              ? "Large undo passed: one history step, one commit."
              : "The large undo did not pass every check."}
          </strong>
          <p>
            Cleared 100,000 usage cells; the undo restored them as{" "}
            {undoReport.versions === 1
              ? "one server version"
              : `${undoReport.versions} server versions`}{" "}
            in {undoReport.undoSteps} history step{undoReport.undoSteps === 1 ? "" : "s"}.
          </p>
          <dl className="sw-dbx__recovery-totals">
            <div>
              <dt>Billable units</dt>
              <dd>
                {undoReport.before.toLocaleString()} → {undoReport.cleared.toLocaleString()} →{" "}
                {undoReport.after.toLocaleString()}
              </dd>
            </div>
            <div>
              <dt>Restore block</dt>
              <dd>
                {formatBytes(undoReport.decodedBytes)} decoded → {formatBytes(undoReport.wireBytes)}{" "}
                wire
              </dd>
            </div>
          </dl>
        </div>
      )}

      <div className="sw-dbx__stage">
        <div
          aria-label="Quarterly subscription revenue workbook"
          className="sw-dbx__grid"
          data-testid="dbx-grid"
          ref={hostRef}
          role="application"
        />
        <aside className="sw-dbx__rail">
          <section aria-labelledby="dbx-log-title" className="sw-dbx__journal">
            <header>
              <div>
                <span>Adjacent evidence</span>
                <h3 id="dbx-log-title">Commit journal</h3>
              </div>
              <span className="sw-dbx__chip" data-activity={activity}>
                {activity}
              </span>
            </header>
            <ol aria-live="polite" className="sw-dbx__log" data-testid="dbx-log">
              {log.length === 0 ? (
                <li className="sw-dbx__log-empty">
                  Change an amount in the Grid. The durable write and acknowledgement will appear
                  here.
                </li>
              ) : (
                log.map((entry) => (
                  <li data-kind={entry.kind} key={entry.id}>
                    {entry.text}
                  </li>
                ))
              )}
            </ol>
          </section>

          <section className="sw-dbx__drill">
            <p id="dbx-challenge-copy">
              <strong>Manual save drill</strong>
              <span>
                Add one subscriber seat. Pause autosave, save the queue, or reopen this session.
              </span>
            </p>
            <fieldset aria-label="Durability actions" className="sw-dbx__controls">
              <div className="sw-dbx__primary-actions">
                <button
                  aria-label="Add one subscriber seat — Commit sample edit"
                  aria-describedby="dbx-challenge-copy"
                  className="sw-dbx__button"
                  disabled={!ready}
                  onClick={commitSampleEdit}
                  type="button"
                >
                  Add one seat
                </button>
                <label className="sw-proofs-switch" data-state={autosave ? "on" : "paused"}>
                  <input
                    aria-label="Autosave"
                    checked={autosave}
                    disabled={!ready}
                    onChange={(event) => {
                      autosaveRef.current = event.currentTarget.checked;
                      setAutosave(event.currentTarget.checked);
                      if (event.currentTarget.checked) saveNow();
                    }}
                    type="checkbox"
                  />
                  <span aria-hidden="true" className="sw-proofs-switch-track">
                    <span className="sw-proofs-switch-thumb" />
                  </span>
                  <span aria-hidden="true" className="sw-proofs-switch-copy">
                    <span>Autosave</span>
                    <span className="sw-proofs-switch-state">{autosave ? "On" : "Paused"}</span>
                  </span>
                </label>
              </div>
              <div className="sw-dbx__session-actions">
                <button
                  aria-label="Save pending now"
                  className="sw-dbx__button"
                  disabled={!ready}
                  onClick={saveNow}
                  type="button"
                >
                  Save pending
                </button>
                <button
                  aria-label="Close and reopen session"
                  className="sw-dbx__button"
                  disabled={!ready}
                  onClick={simulateReload}
                  type="button"
                >
                  Reopen session
                </button>
              </div>
            </fieldset>
          </section>
        </aside>
      </div>

      <details className="sw-dbx__diagnostics" data-testid="dbx-diagnostics">
        <summary>Failure lab &amp; storage diagnostics</summary>
        <div className="sw-dbx__diagnostics-body">
          <section className="sw-dbx__limit-proof">
            <h3>New in 0.5.0 · oversized undo</h3>
            <button
              className="sw-dbx__button"
              data-testid="dbx-tight-limit"
              disabled={!ready}
              onClick={tryTightUndo}
              type="button"
            >
              Try a 128-byte undo limit
            </button>
            <div className="sw-dbx__limit-grid" ref={limitHostRef} />
            {limitReport && (
              <p
                data-state={limitReport.passed ? "passed" : "failed"}
                data-testid="dbx-limit-report"
                role="status"
              >
                {limitReport.passed
                  ? "resource-limit: the oversized undo changed nothing and was dropped. The older edit still undid normally."
                  : "The tight-limit proof did not meet every check."}
              </p>
            )}
          </section>
          <div className="sw-dbx__diagnostic-controls">
            <fieldset className="sw-dbx__control-group">
              <legend>Lost acknowledgement</legend>
              <button
                className="sw-dbx__button"
                data-variant="quiet"
                disabled={!ready}
                onClick={loseNextAck}
                type="button"
              >
                Lose next acknowledgement
              </button>
              <button
                className="sw-dbx__button"
                data-variant="quiet"
                disabled={!ready}
                onClick={retryPending}
                type="button"
              >
                Retry pending commit
              </button>
            </fieldset>
            <fieldset className="sw-dbx__control-group">
              <legend>Conflict &amp; reset</legend>
              <button
                className="sw-dbx__button"
                data-variant="quiet"
                disabled={!ready}
                onClick={externalCommit}
                type="button"
              >
                External writer commit
              </button>
              <button
                className="sw-dbx__button"
                data-variant="danger"
                disabled={!ready}
                onClick={resetDemo}
                type="button"
              >
                Reset demo data
              </button>
            </fieldset>
          </div>
          <section aria-labelledby="dbx-counters-title" className="sw-dbx__storage">
            <h3 id="dbx-counters-title">Storage internals</h3>
            <dl className="sw-dbx__counters">
              {diagnosticCounters.map((counter) => (
                <div key={counter.id}>
                  <dt>{counter.label}</dt>
                  <dd data-testid={counter.id}>{counter.value}</dd>
                </div>
              ))}
            </dl>
            <p className="sw-dbx__note">
              Compaction folds the operation tail into snapshot revision after{" "}
              {COMPACTION.maxTailRecords} tail records or {formatBytes(COMPACTION.maxTailBytes)}.
            </p>
          </section>
          <section aria-labelledby="dbx-architecture-title" className="sw-dbx__architecture">
            <h3 id="dbx-architecture-title">Architecture boundary</h3>
            <p>
              The Grid feeds a durable pending queue. The demo adapter sequences commits into
              IndexedDB; your product supplies the same PersistenceAdapter contract over its own
              database and transport.
            </p>
          </section>
        </div>
      </details>
    </section>
  );
}
