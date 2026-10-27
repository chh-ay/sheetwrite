import { pivotAxisPlan, rebasePivot } from "./pivot.js";
import type { TransactionPreparation } from "./transaction-preparation.js";
import type { CellAddress, Range, SheetId } from "./types/coordinates.js";
import type { DocumentOp } from "./types/document.js";
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
  private readonly undoStack: UndoEntry[] = [];
  private readonly redoStack: UndoEntry[] = [];
  /**
   * Recorded pivots whose deleted anchor fell back, keyed by the rebased
   * definition. Undoing the delete inserts the same span, which would push the
   * fallback anchor `count` cells past its old place. Any later rewrite replaces
   * the key, so a record only applies while nothing else moved the pivot.
   */
  private readonly fallbackAnchors = new WeakMap<PivotDefinition, FallbackAnchor>();

  constructor(private readonly limit = DEFAULT_HISTORY_LIMIT) {}

  /** Record an applied edit. A fresh edit disposes the discarded redo stack. */
  push(undo: HistoryAction, redo: DocumentOp[]): void {
    if (undo.length === 0) return;

    this.undoStack.push({ undo, redo });
    for (const entry of this.redoStack) disposeEntry(entry);
    this.redoStack.length = 0;
    this.evictOldest();
  }

  private evictOldest(): void {
    let bytes = 0;
    for (const entry of this.undoStack) bytes += entrySnapshotBytes(entry);
    while (
      this.undoStack.length > 1 &&
      (this.undoStack.length > this.limit || bytes > DEFAULT_HISTORY_SNAPSHOT_BYTES)
    ) {
      const oldest = this.undoStack.shift();
      if (!oldest) break;
      bytes -= entrySnapshotBytes(oldest);
      disposeEntry(oldest);
    }
  }

  /**
   * Rebase stored addresses after a row or column insert or delete in data
   * space. `extent` is the sheet's row or column count right after the edit.
   */
  rebaseAxis(edit: AxisResize, extent: number): void {
    const { sheet, axis, at, delta } = edit;
    const remap = shiftIndex(at, delta);
    // As in the store, a deleted anchor stays inside the sheet, so the entry still applies.
    const anchorFallback = Math.max(0, Math.min(at, extent - 1));
    const plan = pivotAxisPlan({ sheet, axis, remap, anchorFallback });

    const mapPivot: PivotMapper = (pivot, owner) => {
      const recorded = this.fallbackAnchors.get(pivot);
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
        this.fallbackAnchors.set(after, { deletion: edit, before: pivot });
      }
      return after;
    };

    const mapAddr = (addr: CellAddress): CellAddress | null => rebaseAddr(addr, sheet, axis, remap);
    rebaseEntries(this.undoStack, mapAddr, mapPivot);
    rebaseEntries(this.redoStack, mapAddr, mapPivot);
  }

  undo(): HistoryAction | null {
    const entry = this.undoStack.pop();
    if (!entry) return null;

    this.redoStack.push(entry);
    return entry.undo;
  }

  /** Restore the most recently moved undo entry after its transaction was rejected. */
  restoreUndo(): void {
    const entry = this.redoStack.pop();
    if (entry) this.undoStack.push(entry);
  }

  /**
   * Drop the most recently moved undo entry after a rejection that can never
   * pass, such as a restore payload above the transaction resource limits.
   */
  discardUndone(): void {
    const entry = this.redoStack.pop();
    if (entry) disposeEntry(entry);
  }

  redo(): HistoryAction | null {
    const entry = this.redoStack.pop();
    if (!entry) return null;

    this.undoStack.push(entry);
    return [{ kind: "patches", patches: entry.redo }];
  }

  /** Restore the most recently moved redo entry after its transaction was rejected. */
  restoreRedo(): void {
    const entry = this.undoStack.pop();
    if (entry) this.redoStack.push(entry);
  }

  clear(): void {
    for (const entry of this.undoStack) disposeEntry(entry);
    for (const entry of this.redoStack) disposeEntry(entry);
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** On-demand aggregate; retained history never emits per-cell allocation events. */
  getResourceStats(): HistoryResourceStats {
    let retainedSnapshots = 0;
    let retainedSnapshotBytes = 0;
    for (const stack of [this.undoStack, this.redoStack]) {
      for (const entry of stack) {
        for (const part of entry.undo) {
          if (part.kind !== "rangeSnapshot") continue;
          retainedSnapshots += 1;
        }
        retainedSnapshotBytes += entrySnapshotBytes(entry);
      }
    }
    return {
      undoEntries: this.undoStack.length,
      redoEntries: this.redoStack.length,
      retainedSnapshots,
      retainedSnapshotBytes,
    };
  }
}

function entrySnapshotBytes(entry: UndoEntry): number {
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

function disposeEntry(entry: UndoEntry): void {
  for (const part of entry.undo) {
    if (part.kind === "rangeSnapshot") part.dispose();
  }
}

function rebaseEntries(
  entries: UndoEntry[],
  mapAddr: (addr: CellAddress) => CellAddress | null,
  mapPivot: PivotMapper,
): void {
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (!entry) continue;
    const undo: HistoryAction = [];
    for (const part of entry.undo) {
      if (part.kind === "patches") {
        const patches = rebasePatches(part.patches, mapAddr, mapPivot);
        if (patches.length > 0) undo.push({ kind: "patches", patches });
        continue;
      }
      const start = mapAddr({ sheet: part.range.sheet, ...part.range.start });
      const end = mapAddr({ sheet: part.range.sheet, ...part.range.end });
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
    entry.redo = rebasePatches(entry.redo, mapAddr, mapPivot);
    if (entry.undo.length === 0 || entry.redo.length === 0) {
      disposeEntry(entry);
      entries.splice(i, 1);
    }
  }
}

function rebasePatches(
  patches: DocumentOp[],
  mapAddr: (addr: CellAddress) => CellAddress | null,
  mapPivot: PivotMapper,
): DocumentOp[] {
  const out: DocumentOp[] = [];
  for (const patch of patches) {
    if (patch.op === "set") {
      const addr = mapAddr(patch.addr);
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
      const start = mapAddr({ sheet: patch.range.sheet, ...patch.range.start });
      const end = mapAddr({ sheet: patch.range.sheet, ...patch.range.end });
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
    if (patch.op === "addTable") {
      const start = mapAddr({ sheet: patch.table.range.sheet, ...patch.table.range.start });
      const end = mapAddr({ sheet: patch.table.range.sheet, ...patch.table.range.end });
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
      const start = mapAddr({ sheet: patch.patch.range.sheet, ...patch.patch.range.start });
      const end = mapAddr({ sheet: patch.patch.range.sheet, ...patch.patch.range.end });
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
      out.push({ ...patch, pivot: mapPivot(patch.pivot, patch.sheet) });
      continue;
    }
    out.push(patch);
  }
  return out;
}

/** Index remap for an insert (`delta > 0`) or delete (`delta < 0`) at `at`. */
function shiftIndex(at: number, delta: number): (index: number) => number | null {
  if (delta >= 0) return (index) => (index >= at ? index + delta : index);
  const count = -delta;
  return (index) => (index < at ? index : index < at + count ? null : index - count);
}

function rebaseAddr(
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
