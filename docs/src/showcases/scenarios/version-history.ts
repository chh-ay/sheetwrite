import {
 cellA1,
 colToA1,
 createGridFromSnapshot,
 MemoryPersistenceAdapter,
 SyncCoordinator,
 type CellScalar,
 type CommitJournal,
 type CommittedTransaction,
 type DocumentOp,
 type Grid,
 type RemoteOperationSource,
 type VersionedOperation,
 type Workbook,
 type WorkbookSnapshot,
} from "@sheetwrite/core";
import {
 historyAddon,
 HistoryArchive,
 MemoryHistoryStorage,
 type HistoryDiffPage,
 type HistoryVersion,
} from "@sheetwrite/core/history";

import type { LiveScenario } from "../use-live-scenario.js";
import { createListeners, mountShowcaseShell, requireApplied } from "./showcase-shell.js";

// The version history showcase: one budget document behind an in-memory
// authority. You edit it in the grid; a teammate, Sam, edits the same document
// through a second client. The authority journals every commit into a history
// archive, so versions can be saved, compared with the current document, and
// restored through the sync coordinator.

const DOCUMENT = "budget-2027";
export const BUDGET_SHEET = "budget";
export const YOU = "you";
export const SAM = "sam";
const AUTHOR_NAMES: Readonly<Record<string, string>> = { [YOU]: "You", [SAM]: "Sam Lee" };
export const authorName = (id: string): string => AUTHOR_NAMES[id] ?? id;
/** The named version the page starts from. */
export const BASELINE_NAME = "Budget approved";

const QUARTERS = ["Q1", "Q2", "Q3", "Q4"] as const;
const LINES = [
 ["Salaries", "Maya", 182_000],
 ["Contractors", "Leo", 46_000],
 ["Marketing", "Aisha", 38_000],
 ["Travel", "Sam Lee", 12_500],
 ["Software", "Noah", 9_800],
 ["Hardware", "Leo", 14_200],
 ["Training", "Aisha", 6_400],
 ["Office", "Maya", 21_000],
] as const;
const FIRST_QUARTER_COL = 2;
const TOTAL_COL = FIRST_QUARTER_COL + QUARTERS.length;
const TOTAL_ROW = LINES.length + 1;
/** Rows the Budget sheet fills: the header, every line and the total. */
export const BUDGET_ROWS_USED = TOTAL_ROW + 1;
/** Each quarter grows a line by this share of the one before. */
const QUARTER_GROWTH = 0.03;

/** The second half of the year: the range the "restore a range" control brings back. */
export const SECOND_HALF = {
 sheet: BUDGET_SHEET,
 start: { row: 1, col: FIRST_QUARTER_COL + 2 },
 end: { row: LINES.length, col: FIRST_QUARTER_COL + 3 },
};

const set = (row: number, col: number, value: CellScalar): DocumentOp => ({
 op: "set",
 addr: { sheet: BUDGET_SHEET, row, col },
 value: { kind: "literal", value },
});
const formula = (row: number, col: number, src: string): DocumentOp => ({
 op: "set",
 addr: { sheet: BUDGET_SHEET, row, col },
 value: { kind: "formula", src },
});

function budgetWorkbook(): Workbook {
 const widths = [120, 96, 96, 96, 96, 96, 112];
 return {
  activeSheet: BUDGET_SHEET,
  sheets: [
   {
    id: BUDGET_SHEET,
    name: "Budget",
    rowCount: TOTAL_ROW + 1,
    frozenRows: 1,
    columns: widths.map((width, index) => ({
     key: `c${index}`,
     header: colToA1(index),
     width,
     type: index < FIRST_QUARTER_COL ? ("text" as const) : ("number" as const),
     ...(index < FIRST_QUARTER_COL ? {} : { numberFormat: "$#,##0" }),
    })),
   },
  ],
 };
}

function budgetOperations(): DocumentOp[] {
 const operations: DocumentOp[] = [
  ...["Line", "Owner", ...QUARTERS, "Year"].map((header, col) => set(0, col, header)),
  set(TOTAL_ROW, 0, "Total"),
 ];
 LINES.forEach(([line, owner, firstQuarter], index) => {
  const row = index + 1;
  operations.push(set(row, 0, line), set(row, 1, owner));
  QUARTERS.forEach((_, quarter) => {
   const amount = Math.round((firstQuarter * (1 + QUARTER_GROWTH) ** quarter) / 100) * 100;
   operations.push(set(row, FIRST_QUARTER_COL + quarter, amount));
  });
  operations.push(formula(row, TOTAL_COL, `=SUM(C${row + 1}:F${row + 1})`));
 });
 for (let col = FIRST_QUARTER_COL; col <= TOTAL_COL; col++) {
  const letter = colToA1(col);
  operations.push(formula(TOTAL_ROW, col, `=SUM(${letter}2:${letter}${TOTAL_ROW})`));
 }
 return operations;
}

/**
 * The authority's journal: it records each commit in the archive, then sends
 * it to every client as a remote operation, as a server's broadcast would.
 */
class BroadcastJournal implements CommitJournal, RemoteOperationSource {
 private readonly listeners = new Set<(operation: VersionedOperation) => void>();

 constructor(private readonly archive: HistoryArchive) { }

 async record(commit: CommittedTransaction, capture: () => WorkbookSnapshot): Promise<void> {
  await this.archive.record(commit, capture);
  const operation: VersionedOperation = {
   version: commit.revision,
   operations: commit.operations,
   clientMutationId: commit.mutationId,
   authorId: commit.authorId,
   committedAt: commit.time,
  };
  // After the commit returns, so the sender sees its acknowledgement first.
  setTimeout(() => {
   for (const listener of this.listeners) listener(operation);
  });
 }

 subscribe(listener: (operation: VersionedOperation) => void): () => void {
  this.listeners.add(listener);
  return () => this.listeners.delete(listener);
 }
}

export interface VersionReading {
 readonly id: string;
 readonly label: string;
 readonly author: string;
 readonly kind: HistoryVersion["kind"];
}

export interface ChangeReading {
 readonly cell: string;
 readonly before: string;
 readonly after: string;
 readonly author: string;
}

export interface HistorySnapshot {
 readonly versions: readonly VersionReading[];
 /** The changes from the baseline to the current document, after Compare. */
 readonly changes: readonly ChangeReading[] | null;
 readonly serverVersion: number;
}

export interface HistoryScenario extends LiveScenario<HistorySnapshot> {
 editAsYou(): Promise<void>;
 editAsSam(): Promise<void>;
 saveVersion(): Promise<void>;
 compareWithBaseline(): Promise<void>;
 restoreSecondHalf(): Promise<void>;
 restoreSheet(): Promise<void>;
 openVersionHistory(): void;
}

const text = (value: CellScalar | undefined): string =>
 value === null || value === undefined
  ? "empty"
  : typeof value === "number"
   ? value.toLocaleString("en")
   : String(value);

function changeReadings(page: HistoryDiffPage): ChangeReading[] {
 return page.details.map((detail, index) => {
  const authorIndex = page.cells.author[index] ?? -1;
  const author = page.authors[authorIndex];
  return {
   cell: cellA1(page.cells.row[index] ?? 0, page.cells.col[index] ?? 0),
   before: text(detail.before?.formula ?? detail.before?.value),
   after: text(detail.after.formula ?? detail.after.value),
   author: author === undefined ? "Unknown" : authorName(author),
  };
 });
}

/** Mount the budget, a second client for Sam, the authority and the archive. */
export function createVersionHistoryScenario(host: HTMLElement): HistoryScenario {
 const controller = new AbortController();
 const listeners = createListeners();
 let grid: Grid | null = null;
 let sync: SyncCoordinator | null = null;
 let sam: { grid: Grid; sync: SyncCoordinator } | null = null;
 let archive: HistoryArchive | null = null;
 let baseline: HistoryVersion | null = null;
 let versions: VersionReading[] = [];
 let changes: ChangeReading[] | null = null;
 let savedVersions = 0;
 let dispose = () => { };

 const requireReady = () => {
  if (!grid || !sync || !sam || !archive || !baseline) {
   throw new Error("The budget is still loading");
  }
  return { grid, sync, sam, archive, baseline };
 };

 const refreshVersions = async () => {
  const page = await requireReady().archive.listVersions({ signal: controller.signal });
  versions = page.versions.map((version) => ({
   id: version.id,
   label: version.name ?? "Automatic version",
   author: authorName(version.authorId),
   kind: version.kind,
  }));
  listeners.notify();
 };

 const ready = (async () => {
  // Opened before the grid, so the Review tab's history commands use it.
  const opened = await HistoryArchive.open(
   { documentId: DOCUMENT, storage: new MemoryHistoryStorage() },
   controller.signal,
  );
  const shell = await mountShowcaseShell(
   host,
   {
    workbook: budgetWorkbook(),
    // Letter headers without filler columns: the grid ends with the budget's columns.
    presentation: "data-grid",
    addons: {
     history: {
      archive: opened,
      authorId: YOU,
      authorName,
      sync: () => requireReady().sync,
     },
    },
   },
   controller.signal,
   [historyAddon()],
  );
  if (!shell) return;
  requireApplied(shell.grid.applyRemoteOperations(budgetOperations()), "The budget");
  const snapshot: WorkbookSnapshot = {
   ...shell.grid.exportSnapshot(),
   documentId: DOCUMENT,
   version: 0,
  };

  // The authority: a document store whose journal is the history archive.
  const adapter = new MemoryPersistenceAdapter(snapshot);
  await opened.initialize(snapshot, Date.now(), controller.signal);
  const journal = new BroadcastJournal(opened);
  adapter.recordHistory(DOCUMENT, journal);
  baseline = await opened.saveVersion(BASELINE_NAME, SAM, Date.now(), controller.signal);
  archive = opened;

  const coordinator = (target: Grid, authorId: string) => {
   const created = new SyncCoordinator(target, adapter, {
    documentId: DOCUMENT,
    serverVersion: 0,
    authorId,
   });
   created.subscribe(journal);
   return created;
  };
  grid = shell.grid;
  sync = coordinator(grid, YOU);
  const samGrid = createGridFromSnapshot(document.createElement("div"), snapshot);
  sam = { grid: samGrid, sync: coordinator(samGrid, SAM) };
  // Each local edit in the grid is sent at once, as a connected app would.
  const yours = sync;
  const stopChanges = grid.on("change", (event) => {
   if (event.source === "local") void yours.flush();
   listeners.notify();
  });
  // Acknowledgements move the document version the side panel shows.
  const stopSync = yours.on(() => listeners.notify());
  const samClient = sam;
  dispose = () => {
   stopSync();
   stopChanges();
   yours.destroy();
   samClient.sync.destroy();
   samClient.grid.destroy();
   shell.dispose();
  };
  await refreshVersions();
 })();

 /** Edit one quarter of one line on a client and send it to the authority. */
 const editLine = async (
  client: { grid: Grid; sync: SyncCoordinator },
  line: number,
  quarter: number,
  factor: number,
 ) => {
  const addr = { sheet: BUDGET_SHEET, row: line + 1, col: FIRST_QUARTER_COL + quarter };
  const current = client.grid.store.getCell(addr).resolved;
  const amount = Math.round(((typeof current === "number" ? current : 0) * factor) / 100) * 100;
  requireApplied(
   client.grid.applyTransaction({ patches: [set(addr.row, addr.col, amount)] }),
   "The edit",
  );
  await client.sync.flush();
 };

 return {
  ready,
  subscribe: listeners.subscribe,
  snapshot: () => ({ versions, changes, serverVersion: sync?.serverVersion ?? 0 }),
  async editAsYou() {
   // Marketing in Q2: the first half, which the range restore keeps.
   await editLine(requireReady(), 2, 1, 1.15);
  },
  async editAsSam() {
   // Travel in Q3 and Q4: Sam cuts the second half of the year.
   const { sam: client } = requireReady();
   await editLine(client, 3, 2, 0.8);
   await editLine(client, 3, 3, 0.8);
  },
  async saveVersion() {
   const ready = requireReady();
   await ready.sync.flush();
   savedVersions += 1;
   await ready.archive.saveVersion(
    `Revision ${savedVersions}`,
    YOU,
    Date.now(),
    controller.signal,
   );
   await refreshVersions();
  },
  async compareWithBaseline() {
   const ready = requireReady();
   await ready.sync.flush();
   const page = await ready.archive.diffVersions({
    from: ready.baseline.id,
    to: "head",
    signal: controller.signal,
   });
   changes = changeReadings(page);
   listeners.notify();
  },
  async restoreSecondHalf() {
   const ready = requireReady();
   await ready.sync.flush();
   requireApplied(
    await ready.archive.restoreVersion(
     ready.grid,
     ready.baseline.id,
     { kind: "range", range: SECOND_HALF },
     { sync: ready.sync, signal: controller.signal },
    ),
    "The restore",
   );
   await ready.sync.flush();
   changes = null;
   await refreshVersions();
  },
  async restoreSheet() {
   const ready = requireReady();
   await ready.sync.flush();
   requireApplied(
    await ready.archive.restoreVersion(
     ready.grid,
     ready.baseline.id,
     { kind: "sheet", sheet: BUDGET_SHEET },
     { sync: ready.sync, signal: controller.signal },
    ),
    "The restore",
   );
   await ready.sync.flush();
   changes = null;
   await refreshVersions();
  },
  openVersionHistory() {
   requireReady().grid.actions.versionHistory();
  },
  dispose() {
   controller.abort();
   dispose();
   grid = null;
   sync = null;
   sam = null;
   archive = null;
  },
 };
}
