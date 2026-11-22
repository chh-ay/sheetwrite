// The database demo's engine: the IndexedDB-backed session, its sync
// coordinator and every action the panel and the failure lab run. Loaded once
// the ledger comes near the viewport (DatabaseStage.tsx); it writes the
// page's shared state (state.ts).
import "@sheetwrite/core/styles.css";
import { errorText } from "@docs/lib/errors.js";
import { formatBytes } from "@docs/lib/format.js";
import { observeSiteTheme } from "@docs/lib/site-theme.js";
import { ShowcaseLinkError, ShowcaseNetworkLink } from "@docs/showcases/collaboration-protocol.js";
import {
  DATABASE_DOCUMENT_ID,
  DATABASE_REVENUE_ROWS,
  DATABASE_TOTAL_CELL,
  makeDatabaseSeedSnapshot,
} from "@docs/showcases/database-seed.js";
import {
  makeUsageSheet,
  USAGE_RANGE,
  USAGE_TOTAL_CELL,
} from "@docs/showcases/scenarios/durable-usage.js";
import {
  deleteShowcaseDatabase,
  type ShowcaseDatabaseStats,
  ShowcaseIndexedDbAdapter,
} from "@docs/showcases/showcase-database.js";
import { siteColorScheme, siteGridTheme } from "@docs/showcases/site-grid-theme.js";
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

import {
  autosave,
  COMPACTION,
  type LogEntry,
  pushLog,
  setAutosave,
  setCrashReport,
  setLimitReport,
  setRecoveryState,
  setStats,
  setStatus,
  setStatusDetail,
  setSyncState,
  setTotal,
  setUndoReport,
  setUndoRunning,
} from "./state.js";

const DOCUMENT_DATABASE = "sheetwrite-showcase-subscription-revenue";
const QUEUE_DATABASE = "sheetwrite-showcase-subscription-revenue-queue";
const SAMPLE_ROWS = DATABASE_REVENUE_ROWS;
/** The tight-limit proof: a 128-byte transaction ceiling rejects the big undo. */
const TIGHT_LIMIT_BYTES = 128;
const TIGHT_LIMIT_RECEIPT_CHARS = 8_192;
const TIGHT_LIMIT_SHEET = "limit";
const TIGHT_LIMIT_NOTE_CELL = { sheet: TIGHT_LIMIT_SHEET, row: 0, col: 1 } as const;
const TIGHT_LIMIT_RECEIPT_CELL = { sheet: TIGHT_LIMIT_SHEET, row: 0, col: 0 } as const;
const TIGHT_LIMIT_NOTE = "Manual review note";
/** Delay before autosave resumes a durable queue whose send failed in transit. */
const AUTO_RESUME_MS = 400;
/** Survives the page reload of the reload test; read once on the next load. */
const CRASH_TEST_KEY = "sheetwrite:dbx-reload-test";
const CRASH_TEST_EDITS = 3;

type ConflictResponse = Extract<PersistenceCommitResponse, { status: "conflict" }>;

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

let next_mutation = 1;

function create_mutation_id(): string {
  return `dbx-${Date.now().toString(36)}-${next_mutation++}`;
}

function resolve_database_grid_theme(host: HTMLElement): Partial<Theme> {
  host.dataset.gridTheme = siteColorScheme();
  return siteGridTheme(host);
}

function mount_database_grid(host: HTMLElement, snapshot: unknown): Grid {
  return createGridFromSnapshot(host, snapshot, {
    presentation: "data-grid",
    config: {
      contextMenu: [
        { action: "copy", label: "Copy stored value" },
        { action: "paste" },
        { action: "clearContents" },
        { action: "separator" },
        { action: "exportXlsx", label: "Export database workbook" },
      ],
    },
    theme: resolve_database_grid_theme(host),
  });
}

/** Attaches the storage-gauge and sync-event listeners one session needs. */
function wire_session(
  session: DatabaseSession,
  callbacks: SessionCallbacks,
  is_current: () => boolean = () => true,
): void {
  const { adapter, sync } = session;
  // A failed send puts the commit back in the durable queue without a new
  // "pending" event, so autosave must resume the queue by itself. Without this
  // the record waits for another edit (or an explicit retry) before it moves.
  let resume_timer: number | undefined;
  const resume_send = () => {
    if (resume_timer !== undefined) return;
    resume_timer = window.setTimeout(() => {
      resume_timer = undefined;
      if (!is_current() || !callbacks.autosave()) return;
      if (sync.pendingCount === 0 || sync.state.activity === "sending") return;
      void sync.flush().catch(() => {
        // The next "error" event schedules another resume.
      });
    }, AUTO_RESUME_MS);
  };
  session.disposers.push(() => clearTimeout(resume_timer));
  session.disposers.push(
    adapter.subscribeStats((next) => {
      if (is_current()) callbacks.onStats(next);
    }),
  );
  session.disposers.push(
    sync.on((event) => {
      if (!is_current()) return;
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
            callbacks.onLog("error", errorText(event.error));
          }
          resume_send();
          break;
        default:
          break;
      }
    }),
  );
}

/**
 * Opens one session. A cancelled boot stops before `sync.ready()`, because
 * `ready()` restores the durable queue and flushes it: a stale boot must never
 * touch the queue that the live session is about to drain. When a step fails
 * or the boot is cancelled, every resource that is already open closes,
 * newest first, so a failed boot leaves no database connection or Grid behind.
 */
async function open_session(
  host: HTMLElement,
  callbacks: SessionCallbacks,
  signal: AbortSignal,
): Promise<DatabaseSession | null> {
  await initSheetwrite();
  if (signal.aborted) return null;

  const seed = makeDatabaseSeedSnapshot();
  const adapter = await ShowcaseIndexedDbAdapter.open(
    { ...seed, sheets: [...seed.sheets, makeUsageSheet()] },
    { databaseName: DOCUMENT_DATABASE, compaction: COMPACTION, maxConflictTailVersions: 16 },
  );
  const opened: Array<() => void> = [() => adapter.close()];
  const close_opened = () => {
    for (const close of opened.reverse()) close();
    opened.length = 0;
  };

  try {
    const session = await start_session(host, callbacks, signal, adapter, opened);
    if (!session) close_opened();
    return session;
  } catch (error) {
    close_opened();
    throw error;
  }
}

/**
 * The steps of {@link open_session} after the document database opens. Each
 * resource adds its close step to `opened` as soon as it exists; the caller
 * runs them when this returns `null` (cancelled) or throws.
 */
async function start_session(
  host: HTMLElement,
  callbacks: SessionCallbacks,
  signal: AbortSignal,
  adapter: ShowcaseIndexedDbAdapter,
  opened: Array<() => void>,
): Promise<DatabaseSession | null> {
  const snapshot = await adapter.load(DATABASE_DOCUMENT_ID, signal);
  if (signal.aborted) return null;

  host.replaceChildren();
  const grid = mount_database_grid(host, snapshot);
  opened.push(() => grid.destroy());
  const storage = new IndexedDbPendingCommitStorage({ databaseName: QUEUE_DATABASE });
  opened.push(() => storage.close());
  const link = new ShowcaseNetworkLink(adapter);
  const sync = new SyncCoordinator(grid, link, {
    documentId: DATABASE_DOCUMENT_ID,
    serverVersion: snapshot.version ?? 0,
    pendingStorage: storage,
    createMutationId: create_mutation_id,
  });
  opened.push(() => sync.destroy());
  const session: DatabaseSession = { adapter, link, storage, grid, sync, disposers: [] };
  opened.push(() => {
    for (const dispose of session.disposers) dispose();
    session.disposers.length = 0;
  });
  wire_session(session, callbacks, () => !signal.aborted);
  if (signal.aborted) return null;

  await sync.ready();
  if (signal.aborted) return null;

  if (sync.pendingCount > 0 && callbacks.autosave()) {
    await sync.flush();
    if (signal.aborted) return null;
  }
  callbacks.onSyncState(sync.state);
  callbacks.onStats(adapter.stats());
  return session;
}

function dispose_session(session: DatabaseSession, keep_stores = false): void {
  for (const dispose of session.disposers) dispose();
  session.disposers.length = 0;
  session.sync.destroy();
  session.grid.destroy();
  if (!keep_stores) {
    session.storage.close();
    session.adapter.close();
  }
}

/** Sheet for the tight-limit proof: one oversized receipt beside a small note. */
function make_tight_limit_snapshot() {
  return {
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
              { rowOffset: 0, colOffset: 1, value: { kind: "literal", value: TIGHT_LIMIT_NOTE } },
            ],
          },
        ],
      },
    ],
  };
}

export interface DatabaseEngine {
  /** Opens a session; resolves once it is live or has failed. */
  boot(announce: string | null, recovered: string): Promise<void>;
  commitSampleEdit(): Promise<void>;
  saveNow(): Promise<void>;
  setAutosave(on: boolean): void;
  loseNextAck(): Promise<void>;
  retryPending(): Promise<void>;
  reopenSession(): Promise<void>;
  reloadWithUnsavedEdits(): Promise<void>;
  externalCommit(): Promise<void>;
  clearAndUndoUsage(): Promise<void>;
  tryTightUndo(host: HTMLElement): void;
  resetDemo(): Promise<void>;
  dispose(): void;
}

/** Creates the page's database engine around the ledger's host element. */
export function createDatabaseEngine(host: HTMLElement): DatabaseEngine {
  let session: DatabaseSession | null = null;
  let autosave_on = autosave();
  let snapshot_version: number | null = null;
  let restored = 0;
  let boot_queue: Promise<void> = Promise.resolve();
  let limit_grid: Grid | null = null;
  const mount = new AbortController();

  const read_total = () => {
    if (!session) return;
    const resolved = session.grid.store.getCell(DATABASE_TOTAL_CELL).resolved;
    setTotal(
      typeof resolved === "number" ? resolved.toLocaleString("en-US") : String(resolved ?? "–"),
    );
  };

  const callbacks: SessionCallbacks = {
    onStats: (next) => {
      if (snapshot_version !== null && next.snapshotVersion > snapshot_version) {
        pushLog(
          "info",
          `Compacted: operation tail folded into snapshot v${next.snapshotVersion}, tail length ${next.tailLength}`,
        );
      }
      snapshot_version = next.snapshotVersion;
      setStats(next);
      read_total();
    },
    onSyncState: (state) => {
      setSyncState(state);
      read_total();
    },
    onLog: pushLog,
    onConflict: (response) => {
      void recover_from_conflict(response);
    },
    onRestored: (count) => {
      restored = count;
    },
    autosave: () => autosave_on,
  };

  /**
   * Boots one session at a time. A cancelled boot never reaches `sync.ready()`,
   * so a second boot cannot restore and flush the same durable queue twice.
   */
  const boot = (announce: string | null, recovered: string): Promise<void> => {
    const signal = mount.signal;
    const next_boot = boot_queue.then(async () => {
      if (signal.aborted) return;
      setStatus("loading");
      setStatusDetail("Opening IndexedDB…");
      try {
        restored = 0;
        const opened = await open_session(host, callbacks, signal);
        if (!opened || signal.aborted) return;
        session = opened;
        snapshot_version = opened.adapter.stats().snapshotVersion;
        setStatus("ready");
        setStatusDetail("Live against real IndexedDB");
        setRecoveryState(recovered);
        read_total();
        if (announce) pushLog("info", announce);
        const crash = sessionStorage.getItem(CRASH_TEST_KEY);
        if (crash) {
          sessionStorage.removeItem(CRASH_TEST_KEY);
          const { expected, totalBefore: total_before } = JSON.parse(crash) as {
            expected: number;
            totalBefore: string;
          };
          setCrashReport({
            expected,
            restored,
            totalBefore: total_before,
            totalAfter: String(opened.grid.store.getCell(DATABASE_TOTAL_CELL).resolved ?? "–"),
          });
        }
      } catch (error) {
        if (signal.aborted) return;
        setStatus("error");
        setStatusDetail(errorText(error));
      }
    });
    boot_queue = next_boot;
    return next_boot;
  };

  /**
   * The documented host recovery loop: rebase every pending commit over the
   * server's operation tail, clear the stale durable ids, advance the live
   * Grid to the server head, and resubmit the safe results as new mutations.
   * The Grid is never rebuilt for a small gap — rebuilding it would re-create
   * every sheet, including the 100,000-cell usage sheet. A conflict that
   * returns a snapshot instead of a tail (a very long gap) still remounts.
   * Rebase conflicts keep the queue intact for manual review.
   */
  const recover_from_conflict = async (response: ConflictResponse) => {
    const current = session;
    if (!current) return;
    const pending = current.sync.pendingCommits();
    const remote_operations =
      response.operationsSinceBase?.flatMap((entry) => [...entry.operations]) ?? [];
    if (remote_operations.length === 0 && !response.snapshot) {
      pushLog("error", "Manual review required: the conflict returned no operation tail");
      return;
    }
    const rebased_batches: DocumentOp[][] = [];
    for (const record of pending) {
      const result = rebaseDocumentOperations(record.operations, remote_operations);
      if (result.status === "conflict") {
        pushLog("error", `Manual review required: ${result.conflict.message}`);
        return;
      }
      rebased_batches.push([...result.operations]);
    }
    for (const record of pending) {
      await current.storage.remove(DATABASE_DOCUMENT_ID, record.clientMutationId);
    }

    let grid = current.grid;
    if (remote_operations.length > 0) {
      const applied = grid.applyRemoteOperations(remote_operations);
      if (applied.status !== "applied") {
        pushLog("error", `The missed server versions were not applied: ${applied.status}`);
        return;
      }
    } else if (response.snapshot) {
      dispose_session(current, true);
      session = null;
      host.replaceChildren();
      grid = mount_database_grid(host, response.snapshot);
    }

    // A fresh coordinator owns the advanced head; the Grid keeps its cells.
    for (const dispose of current.disposers) dispose();
    current.disposers.length = 0;
    current.sync.destroy();
    const sync = new SyncCoordinator(grid, current.link, {
      documentId: DATABASE_DOCUMENT_ID,
      serverVersion: response.currentVersion,
      pendingStorage: current.storage,
      createMutationId: create_mutation_id,
    });
    const next: DatabaseSession = {
      adapter: current.adapter,
      link: current.link,
      storage: current.storage,
      grid,
      sync,
      disposers: [],
    };
    wire_session(next, callbacks);
    session = next;
    await sync.ready();
    for (const batch of rebased_batches) {
      const outcome = grid.applyTransaction({ patches: batch });
      if (outcome.status !== "applied") {
        pushLog("error", `Rebased local transaction was not applied: ${outcome.status}`);
        return;
      }
    }
    await sync.flush();
    callbacks.onSyncState(sync.state);
    read_total();
    pushLog(
      "commit",
      `Recovered at v${response.currentVersion}: applied ${remote_operations.length} missed operation${remote_operations.length === 1 ? "" : "s"} and resubmitted ${rebased_batches.length} rebased commit${rebased_batches.length === 1 ? "" : "s"} as new mutations`,
    );
  };

  const bump_seat = (current: DatabaseSession) => {
    const row = (current.sync.serverVersion + current.sync.pendingCount) % SAMPLE_ROWS;
    const value = current.grid.store.getCell({ sheet: "ledger", row, col: 1 }).resolved;
    return current.grid.applyTransaction({
      patches: [
        {
          op: "set",
          addr: { sheet: "ledger", row, col: 1 },
          value: { kind: "literal", value: typeof value === "number" ? value + 1 : 1 },
        },
      ],
    });
  };

  const stop_theme = observeSiteTheme(() => {
    session?.grid.replaceTheme(resolve_database_grid_theme(host));
  });

  return {
    boot,
    async commitSampleEdit() {
      if (!session) return;
      const outcome = bump_seat(session);
      if (outcome.status !== "applied") {
        pushLog("error", `Sample edit was not applied: ${outcome.status}`);
      }
    },
    async saveNow() {
      await session?.sync.flush();
    },
    setAutosave(on) {
      autosave_on = on;
      setAutosave(on);
    },
    async loseNextAck() {
      session?.link.dropNextAcknowledgement();
      pushLog(
        "info",
        "The next acknowledgement will be dropped after the server stores the commit",
      );
    },
    async retryPending() {
      if (!session) return;
      const head = session.sync.pendingCommits()[0];
      if (!head) {
        pushLog("info", "Nothing pending to retry");
        return;
      }
      pushLog("info", `Retrying ${head.clientMutationId} with its original mutation id`);
      // flush() waits for an in-flight send first, then resends the durable
      // queue with each record's original mutation id. A retry issued while
      // the record is still "sending" would otherwise be dropped.
      await session.sync.flush();
    },
    async reopenSession() {
      if (!session) return;
      dispose_session(session);
      session = null;
      await boot(
        "Session closed and reopened: committed state and the durable queue came back from IndexedDB",
        "Reopened from IndexedDB",
      );
    },
    /**
     * Holds three edits in the durable queue, then reloads the whole page
     * without saving. The next page load reports what IndexedDB restored.
     */
    async reloadWithUnsavedEdits() {
      const current = session;
      if (!current) return;
      autosave_on = false;
      setAutosave(false);
      const expected = current.sync.pendingCount + CRASH_TEST_EDITS;
      for (let edit = 0; edit < CRASH_TEST_EDITS; edit++) bump_seat(current);
      // Durable puts are asynchronous. Reload only when every edit is stored
      // ("pending" with the full queue); otherwise report the problem and stay.
      const deadline = performance.now() + 5_000;
      const stored = () =>
        current.sync.state.activity === "pending" && current.sync.pendingCount === expected;
      while (!stored() && performance.now() < deadline) {
        const { promise, resolve } = Promise.withResolvers<void>();
        setTimeout(resolve, 50);
        await promise;
      }
      if (!stored()) {
        pushLog(
          "error",
          `Reload test stopped: ${current.sync.pendingCount} of ${expected} edits were stored (${current.sync.state.activity})`,
        );
        return;
      }
      sessionStorage.setItem(
        CRASH_TEST_KEY,
        JSON.stringify({
          expected,
          totalBefore: String(current.grid.store.getCell(DATABASE_TOTAL_CELL).resolved ?? "–"),
        }),
      );
      location.reload();
    },
    async externalCommit() {
      if (!session) return;
      const version = session.adapter.stats().currentVersion;
      const response = await session.adapter.commit({
        documentId: DATABASE_DOCUMENT_ID,
        baseVersion: version,
        clientMutationId: `external-${Date.now().toString(36)}-${next_mutation++}`,
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
    },
    /**
     * Large undo: clear 100,000 usage cells, then undo once. The undo restores
     * the range through one compressed `restoreBlock` commit, so the whole
     * restore is one history step and one server version.
     */
    async clearAndUndoUsage() {
      const current = session;
      if (!current) return;
      setUndoRunning(true);
      try {
        await current.sync.flush();
        const before = Number(current.grid.store.getCell(USAGE_TOTAL_CELL).resolved);
        const restores: Extract<DocumentOp, { op: "restoreBlock" }>[] = [];
        let undo_steps = 0;
        const stop = current.grid.on("change", (event) => {
          if (event.commitReason !== "undo") return;
          undo_steps += 1;
          for (const operation of event.transaction.patches) {
            if (operation.op === "restoreBlock") restores.push(operation);
          }
        });
        try {
          const cleared = current.grid.applyTransaction({
            patches: [{ op: "clearRange", range: USAGE_RANGE, contents: true }],
          });
          if (cleared.status !== "applied") throw new Error(`Usage clear was ${cleared.status}.`);
          const cleared_total = Number(current.grid.store.getCell(USAGE_TOTAL_CELL).resolved);
          await current.sync.flush();
          const version_before_undo = current.sync.serverVersion;
          current.grid.undo();
          await current.sync.flush();
          const after = Number(current.grid.store.getCell(USAGE_TOTAL_CELL).resolved);
          const decoded_bytes = restores.reduce(
            (bytes, operation) => bytes + operation.decodedBytes,
            0,
          );
          const wire_bytes = new TextEncoder().encode(JSON.stringify(restores)).length;
          const versions = current.sync.serverVersion - version_before_undo;
          const passed =
            cleared_total === 0 &&
            after === before &&
            restores.length > 0 &&
            undo_steps === 1 &&
            versions === 1 &&
            current.sync.pendingCount === 0;
          setUndoReport({
            before,
            cleared: cleared_total,
            after,
            decodedBytes: decoded_bytes,
            wireBytes: wire_bytes,
            versions,
            undoSteps: undo_steps,
            passed,
          });
          if (passed) {
            pushLog(
              "commit",
              `Undo restored 100,000 usage cells in one history step: restoreBlock committed as v${current.sync.serverVersion} (${formatBytes(decoded_bytes, { kib: 0, mib: 1, groupKib: true })} decoded → ${formatBytes(wire_bytes, { kib: 0, mib: 1, groupKib: true })} wire)`,
            );
          }
        } finally {
          stop();
        }
      } finally {
        setUndoRunning(false);
      }
    },
    /**
     * Oversized undo: under a 128-byte transaction ceiling, undoing the clear
     * of the oversized receipt is rejected with `resource-limit` and that
     * entry is dropped; the older note edit is still undoable.
     */
    tryTightUndo(limit_host) {
      limit_grid?.destroy();
      limit_host.replaceChildren();
      const grid = createGridFromSnapshot(limit_host, make_tight_limit_snapshot(), {
        presentation: "data-grid",
        config: { contextMenu: [{ action: "copy", label: "Copy receipt value" }] },
        transactionResourceLimits: { maxEncodedBytes: TIGHT_LIMIT_BYTES },
      });
      limit_grid = grid;
      let rejected = false;
      const stop = grid.on("mutation-rejected", (event) => {
        rejected = event.issues.some((issue) => issue.kind === "resource-limit");
      });
      const note_edit = grid.applyTransaction({
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
            range: { sheet: TIGHT_LIMIT_SHEET, start: { row: 0, col: 0 }, end: { row: 0, col: 0 } },
            contents: true,
          },
        ],
      });
      const cleared_receipt = grid.store.getCell(TIGHT_LIMIT_RECEIPT_CELL).resolved;
      // First undo: the oversized receipt restore is rejected and dropped.
      grid.undo();
      const receipt_stayed_cleared =
        grid.store.getCell(TIGHT_LIMIT_RECEIPT_CELL).resolved === cleared_receipt;
      // Second undo: the older note edit is untouched and still undoable.
      grid.undo();
      const note_restored = grid.store.getCell(TIGHT_LIMIT_NOTE_CELL).resolved === TIGHT_LIMIT_NOTE;
      stop();
      setLimitReport({
        rejected,
        clearedStayedCleared: receipt_stayed_cleared,
        olderEditRestored: note_restored,
        passed:
          note_edit.status === "applied" &&
          cleared.status === "applied" &&
          rejected &&
          receipt_stayed_cleared &&
          note_restored,
      });
    },
    async resetDemo() {
      if (session) {
        dispose_session(session);
        session = null;
      }
      await deleteShowcaseDatabase(DOCUMENT_DATABASE);
      await deleteShowcaseDatabase(QUEUE_DATABASE);
      await boot(
        "Demo databases deleted; reseeded from the canonical ledger at v0",
        "Reseeded in IndexedDB",
      );
    },
    dispose() {
      mount.abort();
      stop_theme();
      limit_grid?.destroy();
      if (session) {
        dispose_session(session);
        session = null;
      }
    },
  };
}

/** A failure message for the journal: link errors are already logged by the sync events. */
export function failureMessage(error: unknown): string {
  const message = errorText(error);
  if (!(error instanceof ShowcaseLinkError)) pushLog("error", message);
  return message;
}
