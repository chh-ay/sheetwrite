import { pivotAxisPlan, rebasePivot } from "./pivot.js";
import type { TransactionPreparation } from "./transaction-preparation.js";
import type { CellAddress, Range, SheetId } from "./types/coordinates.js";
import type { CommitReason, DocumentOp } from "./types/document.js";
import type { PivotDefinition } from "./types/pivot.js";

export type HistoryPart =
  | { kind: "patches"; patches: DocumentOp[] }
  | {
      kind: "rangeSnapshot";
      range: Range;
      byteLength: number;
      toPatch: (
        range: Range,
        preparation?: TransactionPreparation,
      ) => Extract<DocumentOp, { op: "setBlock" }>;
      dispose: () => void;
    };

export type HistoryAction = HistoryPart[];

interface UndoEntry {
  undo: HistoryAction;
  redo: DocumentOp[];
  /** The step's name, such as "Paste", for the status bar after undo or redo. */
  name: string;
}

/** An entry undo or redo applies: the parts to apply and the step's name. */
export interface HistoryStep {
  readonly action: HistoryAction;
  readonly name: string;
}

/** Excel's undo-list names for the commits that say what they did. */
const REASON_STEPS: Partial<Record<CommitReason, string>> = {
  "edit-blur": "Typing",
  "edit-enter": "Typing",
  "edit-tab": "Typing",
  "edit-programmatic": "Typing",
  paste: "Paste",
  clear: "Clear",
  fill: "Auto Fill",
  replace: "Replace",
  sort: "Sort",
  restore: "Restore Version",
};

/** Excel's undo-list names for the other commits, by their first such operation. */
const OPERATION_STEPS: Partial<Record<DocumentOp["op"], string>> = {
  addRows: "Insert Rows",
  removeRows: "Delete Rows",
  moveRows: "Move Rows",
  removeColumns: "Delete Columns",
  moveColumns: "Move Columns",
  moveCells: "Move",
  setColumn: "Column Format",
  setRowMeta: "Row Format",
  addMerge: "Merge Cells",
  removeMerge: "Unmerge Cells",
  setRangeStyle: "Format Cells",
  addSheet: "Insert Sheet",
  removeSheet: "Delete Sheet",
  renameSheet: "Rename Sheet",
  moveSheet: "Move Sheet",
  setSheetVisibility: "Hide Sheet",
  setNote: "Edit Note",
};

/**
 * The name undo and redo show for a commit: "Typing", "Paste", "Insert Rows"
 * and so on, as Excel's undo list names its steps; "Change" when nothing
 * names it.
 */
export function historyStepName(reason: CommitReason, operations: readonly DocumentOp[]): string {
  const named = REASON_STEPS[reason];
  if (named !== undefined) return named;

  // Typing or formatting past the sheet's columns first adds them, so a later
  // operation names the step when one does.
  let adds_columns = false;
  for (const operation of operations) {
    if (operation.op === "addColumns") {
      adds_columns = true;
      continue;
    }
    const step = OPERATION_STEPS[operation.op];
    if (step !== undefined) return step;
  }
  return adds_columns ? "Insert Columns" : "Change";
}

/** A row or column insert (`delta > 0`) or delete (`delta < 0`) at `at`, in data space. */
export interface AxisResize {
  readonly sheet: SheetId;
  readonly axis: "row" | "col";
  readonly at: number;
  readonly delta: number;
}

type PivotMapper = (pivot: PivotDefinition, owner: SheetId) => PivotDefinition;

/** A recorded pivot whose anchor `deletion` moved to the fallback. */
interface FallbackAnchor {
  readonly deletion: AxisResize;
  /** The pivot before the delete, which the matching insert restores exactly. */
  readonly before: PivotDefinition;
}

export interface HistoryResourceStats {
  readonly undoEntries: number;
  readonly redoEntries: number;
  readonly retainedSnapshots: number;
  /** Engine-reported payload bytes; excludes cloned formula ASTs and JS patch history. */
  readonly retainedSnapshotBytes: number;
}

/** Retains recent transaction-level undo resources without allowing unbounded history growth. */
const DEFAULT_HISTORY_LIMIT = 200;
/**
 * A numeric range snapshot reports about 13 bytes per captured cell, so the
 * entry count alone allows 200 million-cell clears (2.6 GB). This payload-byte
 * budget keeps about twenty of them, except the newest entry is always kept.
 * It is not a total history-memory ceiling: engine accounting excludes cloned
 * formula ASTs, and JS patch inverses/redo payloads are only entry-count bounded.
 */
const DEFAULT_HISTORY_SNAPSHOT_BYTES = 256 * 1024 * 1024;

/**
 * Bounded undo/redo over document transactions. Destructive bulk edits may
 * retain opaque store-local range resources, which are materialized into a
 * serializable `setBlock` only when undo executes. History drops its oldest
 * entries when it exceeds either the entry count or reported snapshot payload bytes.
 */
export class UndoManager {
  private readonly undo_stack: UndoEntry[] = [];
  private readonly redo_stack: UndoEntry[] = [];
  /**
   * Snapshot payload bytes of the undo stack, kept as entries come and go so
   * an edit does not sum the whole stack again. Every change to `undo_stack`
   * goes through `push_undo`, `pop_undo`, `evict_oldest`, `rebaseAxis` or `clear`.
   */
  private undo_snapshot_bytes = 0;
  /**
   * Recorded pivots whose deleted anchor fell back, keyed by the rebased
   * definition. Undoing the delete inserts the same span, which would push the
   * fallback anchor `count` cells past its old place. Any later rewrite replaces
   * the key, so a record only applies while nothing else moved the pivot.
   */
  private readonly fallback_anchors = new WeakMap<PivotDefinition, FallbackAnchor>();

  constructor(private readonly limit = DEFAULT_HISTORY_LIMIT) {}

  /** Record an applied edit named `name`. A fresh edit disposes the discarded redo stack. */
  push(undo: HistoryAction, redo: DocumentOp[], name: string): void {
    if (undo.length === 0) return;

    this.push_undo({ undo, redo, name });
    for (const entry of this.redo_stack) dispose_entry(entry);
    this.redo_stack.length = 0;
    this.evict_oldest();
  }

  private evict_oldest(): void {
    while (
      this.undo_stack.length > 1 &&
      (this.undo_stack.length > this.limit ||
        this.undo_snapshot_bytes > DEFAULT_HISTORY_SNAPSHOT_BYTES)
    ) {
      const oldest = this.undo_stack.shift();
      if (!oldest) break;
      this.undo_snapshot_bytes -= entry_snapshot_bytes(oldest);
      dispose_entry(oldest);
    }
  }

  private push_undo(entry: UndoEntry): void {
    this.undo_stack.push(entry);
    this.undo_snapshot_bytes += entry_snapshot_bytes(entry);
  }

  private pop_undo(): UndoEntry | undefined {
    const entry = this.undo_stack.pop();
    if (entry) this.undo_snapshot_bytes -= entry_snapshot_bytes(entry);
    return entry;
  }

  /**
   * Rebase stored addresses after a row or column insert or delete in data
   * space. `extent` is the sheet's row or column count right after the edit.
   */
  rebaseAxis(edit: AxisResize, extent: number): void {
    const { sheet, axis, at, delta } = edit;
    const remap = shift_index(at, delta);
    // As in the store, a deleted anchor stays inside the sheet, so the entry still applies.
    const anchor_fallback = Math.max(0, Math.min(at, extent - 1));
    const plan = pivotAxisPlan({ sheet, axis, remap, anchorFallback: anchor_fallback });

    const map_pivot: PivotMapper = (pivot, owner) => {
      const recorded = this.fallback_anchors.get(pivot);
      if (
        recorded &&
        recorded.deletion.sheet === sheet &&
        recorded.deletion.axis === axis &&
        recorded.deletion.at === at &&
        recorded.deletion.delta === -delta
      ) {
        return recorded.before;
      }

      const after = rebasePivot(pivot, owner, plan);
      const anchor = axis === "row" ? pivot.anchor.row : pivot.anchor.col;
      if (owner === sheet && remap(anchor) === null) {
        this.fallback_anchors.set(after, { deletion: edit, before: pivot });
      }
      return after;
    };

    const map_addr = (addr: CellAddress): CellAddress | null =>
      rebase_addr(addr, sheet, axis, remap);
    rebase_entries(this.undo_stack, map_addr, map_pivot);
    rebase_entries(this.redo_stack, map_addr, map_pivot);
    // Rebasing can drop snapshots that left the sheet and entries left empty,
    // so the bytes are counted again.
    this.undo_snapshot_bytes = 0;
    for (const entry of this.undo_stack) this.undo_snapshot_bytes += entry_snapshot_bytes(entry);
  }

  undo(): HistoryStep | null {
    const entry = this.pop_undo();
    if (!entry) return null;

    this.redo_stack.push(entry);
    return { action: entry.undo, name: entry.name };
  }

  /** Restore the most recently moved undo entry after its transaction was rejected. */
  restoreUndo(): void {
    const entry = this.redo_stack.pop();
    if (entry) this.push_undo(entry);
  }

  /**
   * Drop the most recently moved undo entry after a rejection that can never
   * pass, such as a restore payload above the transaction resource limits.
   */
  discardUndone(): void {
    const entry = this.redo_stack.pop();
    if (entry) dispose_entry(entry);
  }

  redo(): HistoryStep | null {
    const entry = this.redo_stack.pop();
    if (!entry) return null;

    this.push_undo(entry);
    return { action: [{ kind: "patches", patches: entry.redo }], name: entry.name };
  }

  /** Restore the most recently moved redo entry after its transaction was rejected. */
  restoreRedo(): void {
    const entry = this.pop_undo();
    if (entry) this.redo_stack.push(entry);
  }

  clear(): void {
    for (const entry of this.undo_stack) dispose_entry(entry);
    for (const entry of this.redo_stack) dispose_entry(entry);
    this.undo_stack.length = 0;
    this.undo_snapshot_bytes = 0;
    this.redo_stack.length = 0;
  }

  get canUndo(): boolean {
    return this.undo_stack.length > 0;
  }

  /** The newest undo entry, by identity: the edit the next {@link undo} reverts. */
  get lastUndo(): object | null {
    return this.undo_stack.at(-1) ?? null;
  }

  get canRedo(): boolean {
    return this.redo_stack.length > 0;
  }

  /** On-demand aggregate; retained history never emits per-cell allocation events. */
  getResourceStats(): HistoryResourceStats {
    let retained_snapshots = 0;
    let retained_snapshot_bytes = 0;
    for (const stack of [this.undo_stack, this.redo_stack]) {
      for (const entry of stack) {
        for (const part of entry.undo) {
          if (part.kind !== "rangeSnapshot") continue;
          retained_snapshots += 1;
        }
        retained_snapshot_bytes += entry_snapshot_bytes(entry);
      }
    }
    return {
      undoEntries: this.undo_stack.length,
      redoEntries: this.redo_stack.length,
      retainedSnapshots: retained_snapshots,
      retainedSnapshotBytes: retained_snapshot_bytes,
    };
  }
}

function entry_snapshot_bytes(entry: UndoEntry): number {
  let bytes = 0;
  for (const part of entry.undo) if (part.kind === "rangeSnapshot") bytes += part.byteLength;
  return bytes;
}
export function materializeHistoryAction(
  action: HistoryAction,
  preparation?: TransactionPreparation,
): DocumentOp[] {
  const patches: DocumentOp[] = [];
  for (const part of action) {
    if (part.kind === "patches") patches.push(...part.patches);
    else patches.push(part.toPatch(part.range, preparation));
  }
  return patches;
}

function dispose_entry(entry: UndoEntry): void {
  for (const part of entry.undo) {
    if (part.kind === "rangeSnapshot") part.dispose();
  }
}

function rebase_entries(
  entries: UndoEntry[],
  map_addr: (addr: CellAddress) => CellAddress | null,
  map_pivot: PivotMapper,
): void {
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (!entry) continue;
    const undo: HistoryAction = [];
    for (const part of entry.undo) {
      if (part.kind === "patches") {
        const patches = rebase_patches(part.patches, map_addr, map_pivot);
        if (patches.length > 0) undo.push({ kind: "patches", patches });
        continue;
      }

      const start = map_addr({ sheet: part.range.sheet, ...part.range.start });
      const end = map_addr({ sheet: part.range.sheet, ...part.range.end });
      if (start && end && start.sheet === end.sheet) {
        part.range = {
          sheet: start.sheet,
          start: { row: start.row, col: start.col },
          end: { row: end.row, col: end.col },
        };

        undo.push(part);
      } else {
        part.dispose();
      }
    }

    entry.undo = undo;
    entry.redo = rebase_patches(entry.redo, map_addr, map_pivot);
    if (entry.undo.length === 0 || entry.redo.length === 0) {
      dispose_entry(entry);
      entries.splice(i, 1);
    }
  }
}

function rebase_patches(
  patches: DocumentOp[],
  map_addr: (addr: CellAddress) => CellAddress | null,
  map_pivot: PivotMapper,
): DocumentOp[] {
  const out: DocumentOp[] = [];
  for (const patch of patches) {
    if (patch.op === "set") {
      const addr = map_addr(patch.addr);
      if (addr) out.push({ ...patch, addr });
      continue;
    }

    if (
      patch.op === "setRange" ||
      patch.op === "setBlock" ||
      patch.op === "restoreBlock" ||
      patch.op === "setRangeStyle" ||
      patch.op === "clearRange"
    ) {
      const start = map_addr({ sheet: patch.range.sheet, ...patch.range.start });
      const end = map_addr({ sheet: patch.range.sheet, ...patch.range.end });
      if (start && end && start.sheet === end.sheet) {
        out.push({
          ...patch,
          range: {
            sheet: start.sheet,
            start: { row: start.row, col: start.col },
            end: { row: end.row, col: end.col },
          },
        });
      }

      continue;
    }

    if (patch.op === "permuteRows") {
      const start = map_addr({ sheet: patch.range.sheet, ...patch.range.start });
      const end = map_addr({ sheet: patch.range.sheet, ...patch.range.end });
      // The order names each row of the range, so it fits only a range that
      // kept its row count.
      if (
        start &&
        end &&
        start.sheet === end.sheet &&
        end.row - start.row === patch.range.end.row - patch.range.start.row
      ) {
        out.push({
          ...patch,
          range: {
            sheet: start.sheet,
            start: { row: start.row, col: start.col },
            end: { row: end.row, col: end.col },
          },
        });
      }

      continue;
    }

    if (patch.op === "addTable") {
      const start = map_addr({ sheet: patch.table.range.sheet, ...patch.table.range.start });
      const end = map_addr({ sheet: patch.table.range.sheet, ...patch.table.range.end });
      if (
        start &&
        end &&
        start.sheet === end.sheet &&
        end.col - start.col + 1 === patch.table.columns.length
      ) {
        out.push({
          ...patch,
          table: {
            ...patch.table,
            range: {
              sheet: start.sheet,
              start: { row: start.row, col: start.col },
              end: { row: end.row, col: end.col },
            },
          },
        });
      }

      continue;
    }

    if (patch.op === "updateTable" && patch.patch.range) {
      const start = map_addr({ sheet: patch.patch.range.sheet, ...patch.patch.range.start });
      const end = map_addr({ sheet: patch.patch.range.sheet, ...patch.patch.range.end });
      if (
        start &&
        end &&
        start.sheet === end.sheet &&
        (patch.patch.columns === undefined ||
          end.col - start.col + 1 === patch.patch.columns.length)
      ) {
        out.push({
          ...patch,
          patch: {
            ...patch.patch,
            range: {
              sheet: start.sheet,
              start: { row: start.row, col: start.col },
              end: { row: end.row, col: end.col },
            },
          },
        });
      }

      continue;
    }

    if (patch.op === "setPivot") {
      out.push({ ...patch, pivot: map_pivot(patch.pivot, patch.sheet) });
      continue;
    }

    out.push(patch);
  }

  return out;
}

/** Index remap for an insert (`delta > 0`) or delete (`delta < 0`) at `at`. */
function shift_index(at: number, delta: number): (index: number) => number | null {
  if (delta >= 0) return (index) => (index >= at ? index + delta : index);
  const count = -delta;
  return (index) => (index < at ? index : index < at + count ? null : index - count);
}

function rebase_addr(
  addr: CellAddress,
  sheet: SheetId,
  axis: "row" | "col",
  remap: (index: number) => number | null,
): CellAddress | null {
  if (addr.sheet !== sheet) return addr;

  const index = remap(axis === "row" ? addr.row : addr.col);
  if (index === null) return null;
  return axis === "row" ? { ...addr, row: index } : { ...addr, col: index };
}
