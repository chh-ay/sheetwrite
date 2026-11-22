import { remapFormulaA1Refs } from "./a1.js";
import { chartTouchesSheet } from "./chart-definition.js";
import { boxesOverlap } from "./dashboard.js";
import { cloneJsonValue } from "./plain-data.js";
import { decodeRestoreBlock, encodeRestoreBlock } from "./restore-block.js";
import { cellRange, movedCellBounds, rangesIntersect } from "./store/ranges.js";
import type { CellValue } from "./types/cell.js";
import type { ChartDefinition, ChartRange } from "./types/chart.js";
import type { CellAddress, Range, SheetId } from "./types/coordinates.js";
import type { DocumentOp, PackedCellBlock, SheetSnapshot, SnapshotCell } from "./types/document.js";
import type { PivotDefinition } from "./types/pivot.js";
import { mapValidationFormulas } from "./validation-rule.js";

/** Stable conservative-rebase conflict category. */
export type RebaseConflictCode =
  | "overlapping-edit"
  | "sheet-removed"
  | "sheet-lifecycle"
  | "formula-structural"
  | "structural-overlap"
  | "unsupported-structural";

/** Reason and affected operations for an unsafe document rebase. */
export interface RebaseConflict {
  /** Why the two operations cannot both apply. */
  code: RebaseConflictCode;
  /** Zero-based index of the local operation in conflict. */
  localOperationIndex: number;
  /** Zero-based index of the remote operation in conflict. */
  remoteOperationIndex: number;
  /** A readable explanation of the conflict, for logs. */
  message: string;
}

/** Successful rebased operations or a conservative rebase conflict. */
export type DocumentRebaseResult =
  | { status: "rebased"; operations: readonly DocumentOp[] }
  | { status: "conflict"; conflict: RebaseConflict };

type Axis = "row" | "column";

type RestoreOperation = Extract<DocumentOp, { op: "restoreBlock" }>;
type RestoreBlockReader = (operation: RestoreOperation) => PackedCellBlock;

type AxisChange =
  | { kind: "insert"; axis: Axis; sheet: string; at: number; count: number }
  | { kind: "delete"; axis: Axis; sheet: string; at: number; count: number }
  /** Rows, columns or a block of cells that move on, or between, `sheets`. */
  | { kind: "move"; sheets: readonly string[] };

interface TransformFailure {
  code: RebaseConflictCode;
  message: string;
}

/**
 * Conservative server-ordered rebase for pending offline work. Non-overlapping
 * literal edits are shifted across row/column insertion and deletion. Ambiguous
 * formula, overlapping, sheet-lifecycle, and move cases become explicit
 * conflicts instead of lossy guesses. This is the collaboration design gate;
 * no CRDT dependency is required for the supported cases.
 *
 * Each local operation is written after the local operations before it, and
 * each remote operation after the remote operations before it. A remote
 * operation is therefore carried forward through the local sequence: before it
 * is compared with local operation k, it is moved past local operations 0..k-1.
 *
 * The engine rewrites the formula of a conditional format that a row or
 * column edit moves, so such a rebase needs `initSheetwrite()` first.
 *
 * The caller's operations are never modified. A local operation is copied
 * only when a remote row or column change rewrites it, and the copy shares
 * every payload the transform does not write; every other operation in the
 * result is the caller's own object, so treat the result as read-only.
 *
 * @param localOperations - This client's operations the server has not yet accepted, in order.
 * @param remoteOperations - Operations the server accepted first, in order.
 */
export function rebaseDocumentOperations(
  localOperations: readonly DocumentOp[],
  remoteOperations: readonly DocumentOp[],
): DocumentRebaseResult {
  const operations: DocumentOp[] = [...localOperations];
  // Private copies of the local operations that a structural remote rewrites.
  // Only these are transformed in place or have their restore payload re-encoded.
  const owned = new Set<DocumentOp>();
  // Decoded restore payloads, for reads of any operation and transforms of owned
  // ones; no state is retained across rebases.
  const restore_blocks = new Map<RestoreOperation, PackedCellBlock>();
  const restore_block: RestoreBlockReader = (operation) => {
    let block = restore_blocks.get(operation);
    if (!block) {
      block = decodeRestoreBlock(operation);
      restore_blocks.set(operation, block);
    }

    return block;
  };

  let has_structural_transforms = false;

  for (let remote_index = 0; remote_index < remoteOperations.length; remote_index++) {
    const remote = remoteOperations[remote_index]!;
    // The remote operation in the coordinates of the local operation being
    // compared. It stays the caller's object until a local row or column change
    // moves it; only then is a private footprint copied.
    let carried: DocumentOp | null = remote;
    let carried_is_owned = false;
    let axis_change = structural_change(remote);
    for (let local_index = 0; local_index < operations.length && carried; local_index++) {
      let local = operations[local_index]!;
      // Read before the transform: the next local operation is written after this one.
      const local_change = changesStructure(local) ? structural_change(local) : null;
      if (axis_change) {
        if (axis_change.kind !== "move") {
          has_structural_transforms = true;
          // Copy before any payload read, so a decoded restore block belongs to the copy.
          if (!owned.has(local)) {
            local = owned_local_copy(local);
            owned.add(local);
            operations[local_index] = local;
          }
        }
        if (
          axis_change.kind === "move" &&
          axis_change.sheets.some((sheet) => operation_touches_sheet(local, sheet, restore_block))
        ) {
          return conflict(
            "unsupported-structural",
            local_index,
            remote_index,
            "Concurrent row/column moves require host review; index intent is ambiguous",
          );
        }

        if (operation_contains_formula(local, restore_block)) {
          return conflict(
            "formula-structural",
            local_index,
            remote_index,
            "Formula source cannot be rebased across a concurrent structural edit without parsing sheet-aware references",
          );
        }

        const transformed = transform_for_axis(local, axis_change, restore_block);
        if ("code" in transformed) {
          return conflict(transformed.code, local_index, remote_index, transformed.message);
        }

        operations[local_index] = transformed.operation;
      } else {
        const lifecycle = lifecycle_conflict(local, remote, restore_block);
        if (lifecycle) {
          return conflict(lifecycle.code, local_index, remote_index, lifecycle.message);
        }

        if (operations_overlap(local, carried)) {
          return conflict(
            "overlapping-edit",
            local_index,
            remote_index,
            "Concurrent operations mutate overlapping cells or range metadata",
          );
        }
      }

      // Only a later local operation needs the remote in its coordinates, and
      // only a local row or column change moves it.
      if (local_index + 1 === operations.length || !local_change) continue;
      const next = carry_past_local(
        carried_is_owned ? carried : remote_footprint(carried),
        local_change,
        restore_block,
      );
      if (next && "code" in next) {
        return conflict(next.code, local_index + 1, remote_index, next.message);
      }

      carried = next ? next.operation : null;
      carried_is_owned = true;
      if (carried) axis_change = structural_change(carried);
    }
  }

  if (has_structural_transforms) {
    for (const [operation, block] of restore_blocks) {
      if (!owned.has(operation)) continue;
      Object.assign(operation, encodeRestoreBlock(operation.range, block));
    }
  }

  return { status: "rebased", operations };
}

function conflict(
  code: RebaseConflictCode,
  local_operation_index: number,
  remote_operation_index: number,
  message: string,
): DocumentRebaseResult {
  return {
    status: "conflict",
    conflict: {
      code,
      localOperationIndex: local_operation_index,
      remoteOperationIndex: remote_operation_index,
      message,
    },
  };
}

/** Whether an operation inserts, deletes, or moves rows or columns, or moves a block of cells. */
export function changesStructure(operation: DocumentOp): boolean {
  switch (operation.op) {
    case "addRows":
    case "removeRows":
    case "moveRows":
    case "addColumns":
    case "removeColumns":
    case "moveColumns":
    case "moveCells":
      return true;
    default:
      return false;
  }
}

function structural_change(operation: DocumentOp): AxisChange | null {
  switch (operation.op) {
    case "addRows":
      return {
        kind: "insert",
        axis: "row",
        sheet: operation.sheet,
        at: operation.at,
        count: operation.count,
      };

    case "removeRows":
      return {
        kind: "delete",
        axis: "row",
        sheet: operation.sheet,
        at: operation.at,
        count: operation.count,
      };

    case "moveRows":
      return { kind: "move", sheets: [operation.sheet] };

    case "addColumns":
      return {
        kind: "insert",
        axis: "column",
        sheet: operation.sheet,
        at: operation.at,
        count: operation.columns.length,
      };

    case "removeColumns":
      return {
        kind: "delete",
        axis: "column",
        sheet: operation.sheet,
        at: operation.at,
        count: operation.count,
      };

    case "moveColumns":
      return { kind: "move", sheets: [operation.sheet] };

    case "moveCells":
      return { kind: "move", sheets: [operation.range.sheet, operation.to.sheet] };

    default:
      return null;
  }
}

/**
 * A private copy of what a remote operation writes and where, for carrying it
 * through the local sequence. Cell payloads are left behind: a block write
 * carries only its range, so large restores are neither copied nor decoded.
 * Transforms replace top-level coordinates with new objects, so a shallow copy
 * suffices except where a nested range is rewritten in place.
 */
function remote_footprint(operation: DocumentOp): DocumentOp {
  switch (operation.op) {
    case "setRange":
    case "setBlock":
    case "restoreBlock":
    case "permuteRows":
      return { op: "clearRange", range: operation.range };
    case "addSheet":
      // Carries no coordinates; lifecycle checks read the original operation.
      return operation;
    case "setHyperlink":
    case "setValidationRule":
    case "setProtectedRange":
    case "setNamedRange":
    case "addTable":
    case "updateTable":
    case "setSheetMeta":
    case "setChart":
    case "setPivot":
    case "setDashboardItem":
      return cloneJsonValue(operation);
    default:
      return { ...operation };
  }
}

/**
 * A private copy of a local operation that a structural transform may rewrite.
 * Transforms replace top-level coordinates with new objects and write only
 * into the containers copied here, so cell values, styles and other payload
 * arrays stay shared with the caller's operation and are never written.
 */
function owned_local_copy(operation: DocumentOp): DocumentOp {
  switch (operation.op) {
    case "setRange":
      return operation.cells.some((cell) => cell.value.kind === "ref")
        ? { ...operation, cells: operation.cells.map((cell) => ({ ...cell })) }
        : { ...operation };
    case "setBlock": {
      const refs = operation.block.refs;
      if (refs === undefined) return { ...operation };
      return {
        ...operation,
        block: {
          ...operation.block,
          refs: refs.map(([offset, target]): [number, CellAddress] => [offset, target]),
        },
      };
    }
    case "addSheet":
    case "setHyperlink":
    case "setValidationRule":
    case "setProtectedRange":
    case "setNamedRange":
    case "addTable":
    case "updateTable":
    case "setSheetMeta":
    case "setChart":
    case "setPivot":
      return cloneJsonValue(operation);
    default:
      // Includes restoreBlock: its payload is decoded into a private block.
      return { ...operation };
  }
}

/**
 * Moves a carried remote operation past one local operation, so it is in the
 * coordinates the next local operation was written in. Returns null when the
 * local operation deleted the remote target: in server order the remote write
 * lands first and the local deletion then removes it, so nothing later can
 * overlap it.
 */
function carry_past_local(
  remote: DocumentOp,
  local: AxisChange | null,
  restore_block: RestoreBlockReader,
): { operation: DocumentOp } | TransformFailure | null {
  if (!local) return { operation: remote };
  if (local.kind === "move") {
    if (!local.sheets.some((sheet) => operation_touches_sheet(remote, sheet, restore_block))) {
      return { operation: remote };
    }
    return {
      code: "unsupported-structural",
      message: "A pending move reorders cells a concurrent operation targets",
    };
  }

  const remote_change = structural_change(remote);
  if (
    remote_change &&
    remote_change.kind !== "move" &&
    remote_change.axis === local.axis &&
    remote_change.sheet === local.sheet
  ) {
    if (remote_change.kind === "insert") {
      // Server order puts remote rows first, so an insert at the same position
      // stays ahead of the local rows.
      const at =
        local.kind === "insert"
          ? remote_change.at > local.at
            ? remote_change.at + local.count
            : remote_change.at
          : transform_position(remote_change.at, local);
      return { operation: { ...remote, at } as DocumentOp };
    }

    const mapped = transform_span(remote_change.at, remote_change.count, local);
    if (!mapped) return overlapping_structure(remote.op);
    return { operation: { ...remote, at: mapped.at } as DocumentOp };
  }

  const failure = transform_direct_target(remote, local);
  if (!failure) return { operation: remote };
  switch (remote.op) {
    case "set":
    case "setNote":
    case "setColumn":
    case "setRowMeta":
      return null;

    default:
      return failure;
  }
}

/**
 * Transforms one privately owned operation in place. `rebaseDocumentOperations`
 * passes only its own copy of a caller's operation (see `owned_local_copy`), so
 * no copy is needed here; the caller's operations are never touched.
 */
function transform_for_axis(
  input: DocumentOp,
  change: AxisChange,
  restore_block: RestoreBlockReader,
): { operation: DocumentOp } | TransformFailure {
  if (change.kind === "move") return { operation: input };
  const direct = transform_direct_target(input, change);
  if (direct) return direct;
  const embedded = transform_embedded_references(input, change, restore_block);
  return embedded ? embedded : { operation: input };
}

function transform_direct_target(
  operation: DocumentOp,
  change: Exclude<AxisChange, { kind: "move" }>,
): TransformFailure | null {
  switch (operation.op) {
    case "set":
    case "setNote": {
      const address = transform_address(operation.addr, change);
      if (!address) return deleted_target(operation.op);
      operation.addr = address;
      return null;
    }

    case "setRange":
    case "setBlock":
    case "restoreBlock":
    case "setRangeStyle":
    case "clearRange":
    case "permuteRows": {
      const range = transform_range(operation.range, change);
      if (!range) return overlapping_structure(operation.op);
      operation.range = range;
      return null;
    }

    case "addRows":
      if (change.axis === "row" && operation.sheet === change.sheet) {
        operation.at = transform_position(operation.at, change);
      }

      return null;

    case "removeRows":
      if (change.axis === "row" && operation.sheet === change.sheet) {
        const mapped = transform_span(operation.at, operation.count, change);
        if (!mapped) return overlapping_structure(operation.op);
        operation.at = mapped.at;
      }

      return null;

    case "moveRows":
      if (change.axis === "row" && operation.sheet === change.sheet) {
        const mapped = transform_span(operation.from, operation.count, change);
        if (!mapped) return overlapping_structure(operation.op);
        operation.from = mapped.at;
        operation.to = transform_position(operation.to, change);
      }

      return null;

    case "moveCells":
      return operation.range.sheet === change.sheet || operation.to.sheet === change.sheet
        ? overlapping_structure(operation.op)
        : null;

    case "addColumns":
      if (change.axis === "column" && operation.sheet === change.sheet) {
        operation.at = transform_position(operation.at, change);
      }

      return null;

    case "removeColumns":
      if (change.axis === "column" && operation.sheet === change.sheet) {
        const mapped = transform_span(operation.at, operation.count, change);
        if (!mapped) return overlapping_structure(operation.op);
        operation.at = mapped.at;
      }

      return null;

    case "moveColumns":
      if (change.axis === "column" && operation.sheet === change.sheet) {
        const mapped = transform_span(operation.from, operation.count, change);
        if (!mapped) return overlapping_structure(operation.op);
        operation.from = mapped.at;
        operation.to = transform_position(operation.to, change);
      }

      return null;

    case "setColumn":
      if (change.axis === "column" && operation.sheet === change.sheet) {
        const mapped = transform_index(operation.col, change);
        if (mapped === null) return deleted_target(operation.op);
        operation.col = mapped;
      }

      return null;

    case "setRowMeta":
      if (change.axis === "row" && operation.sheet === change.sheet) {
        const mapped = transform_index(operation.row, change);
        if (mapped === null) return deleted_target(operation.op);
        operation.row = mapped;
      }

      return null;

    case "addMerge":
    case "removeMerge":
      if (operation.sheet === change.sheet) {
        const range: Range = {
          sheet: operation.sheet,
          start: { row: operation.merge.r0, col: operation.merge.c0 },
          end: { row: operation.merge.r1, col: operation.merge.c1 },
        };

        const mapped = transform_range(range, change);
        if (!mapped) return overlapping_structure(operation.op);
        operation.merge = {
          r0: mapped.start.row,
          c0: mapped.start.col,
          r1: mapped.end.row,
          c1: mapped.end.col,
        };
      }

      return null;

    case "setHyperlink": {
      const source = transform_range(operation.hyperlink.range, change);
      if (!source && operation.hyperlink.range.sheet === change.sheet) {
        return overlapping_structure(operation.op);
      }

      if (source) operation.hyperlink.range = source;
      if (operation.hyperlink.target.kind === "internal") {
        const target = transform_range(operation.hyperlink.target.range, change);
        if (!target && operation.hyperlink.target.range.sheet === change.sheet) {
          return overlapping_structure(operation.op);
        }

        if (target) operation.hyperlink.target.range = target;
      }

      return null;
    }

    case "setValidationRule": {
      const { rule } = operation;
      const original_sheet = rule.range.sheet;
      const mapped = transform_range(rule.range, change);
      if (!mapped && original_sheet === change.sheet) {
        return overlapping_structure(operation.op);
      }

      if (mapped) rule.range = mapped;
      if (original_sheet === change.sheet) {
        const formula_edit = {
          kind: "shift",
          at: change.at,
          delta: change.kind === "insert" ? change.count : -change.count,
        } as const;
        rule.condition = mapValidationFormulas(rule.condition, (formula) =>
          remapFormulaA1Refs(formula, change.axis, formula_edit),
        );
      }
      return null;
    }

    case "setProtectedRange": {
      const mapped = transform_range(operation.protectedRange.range, change);
      if (!mapped && operation.protectedRange.range.sheet === change.sheet) {
        return overlapping_structure(operation.op);
      }

      if (mapped) operation.protectedRange.range = mapped;
      return null;
    }

    case "setNamedRange": {
      const { namedRange: named_range } = operation;
      // A formula name never gets here: operation_contains_formula reports it as a conflict first.
      if (named_range.range === undefined) return null;

      const mapped = transform_range(named_range.range, change);
      if (!mapped && named_range.range.sheet === change.sheet) {
        return overlapping_structure(operation.op);
      }

      if (mapped) named_range.range = mapped;
      return null;
    }

    case "addTable": {
      const mapped = transform_range(operation.table.range, change);
      if (!mapped && operation.table.range.sheet === change.sheet) {
        return overlapping_structure(operation.op);
      }

      if (mapped) operation.table.range = mapped;
      return null;
    }

    case "updateTable": {
      if (operation.patch.range === undefined) return null;
      const mapped = transform_range(operation.patch.range, change);
      if (!mapped && operation.patch.range.sheet === change.sheet) {
        return overlapping_structure(operation.op);
      }

      if (mapped) operation.patch.range = mapped;
      return null;
    }

    case "setChart":
      return transform_chart(operation.chart, operation.sheet, change, operation.op);

    case "setSheetMeta": {
      if (operation.sheet !== change.sheet) return null;
      const keys = Object.keys(operation.patch).filter(
        (key) => operation.patch[key as keyof typeof operation.patch] !== undefined,
      );
      if (keys.length === 0 || !keys.every((key) => STRUCTURE_AWARE_META.has(key))) {
        return {
          code: "unsupported-structural",
          message:
            "Only conditional formats, column filters and the AutoFilter support metadata-aware structural rebase",
        };
      }

      const { autoFilter: auto_filter, filters } = operation.patch;
      if (auto_filter) {
        const mapped = transform_range(auto_filter.range, change);
        if (!mapped) return overlapping_structure(operation.op);
        auto_filter.range = mapped;
      }

      if (filters !== undefined && change.axis === "column") {
        for (const entry of filters) {
          const col = transform_index(entry[0], change);
          if (col === null) return overlapping_structure(operation.op);
          entry[0] = col;
        }
      }

      if (operation.patch.conditionalFormats !== undefined) {
        for (const rule of operation.patch.conditionalFormats) {
          const original_sheet = rule.range.sheet;
          const mapped = transform_range(rule.range, change);
          if (!mapped && original_sheet === change.sheet)
            return overlapping_structure(operation.op);
          if (mapped) rule.range = mapped;
          if (original_sheet === change.sheet && rule.when.kind === "formula") {
            rule.when.source = remapFormulaA1Refs(rule.when.source, change.axis, {
              kind: "shift",
              at: change.at,
              delta: change.kind === "insert" ? change.count : -change.count,
            });
          }
        }
      }

      return null;
    }

    case "setPivot":
      return transform_pivot(operation.pivot, operation.sheet, change, operation.op);

    case "addSheet":
    case "removeSheet":
    case "renameSheet":
    case "moveSheet":
    case "setSheetVisibility":
    case "removeValidationRule":
    case "removeHyperlink":
    case "removeProtectedRange":
    case "removeNamedRange":
    case "removeTable":
    case "setCalculation":
    case "setExternalLinks":
    case "setRelationship":
    case "removeRelationship":
    case "setMeasure":
    case "removeMeasure":
    case "setQuery":
    case "removeQuery":
    case "removeChart":
    case "removePivot":
    // A dashboard has no rows or columns, so axis edits never move its items.
    case "setDashboardItem":
    case "removeDashboardItem":
      return null;
  }
}

/**
 * Shift a privately owned chart's anchor and live sources in place. A source
 * that straddles the edit or an anchor whose cell was deleted is a conflict,
 * like every other range-bearing metadata operation.
 */
function transform_chart(
  chart: ChartDefinition,
  owner: SheetId,
  change: Exclude<AxisChange, { kind: "move" }>,
  operation: string,
): TransformFailure | null {
  // Only a source on the edited sheet can come back null.
  const map_source = (source: ChartRange): ChartRange | null =>
    source === "#REF!" ? source : transform_range(source, change);

  for (const series of chart.series) {
    const values = map_source(series.values);
    const name_range = series.nameRange === undefined ? undefined : map_source(series.nameRange);
    const categories = series.categories === undefined ? undefined : map_source(series.categories);
    if (!values || name_range === null || categories === null) {
      return overlapping_structure(operation);
    }

    series.values = values;
    if (name_range !== undefined) series.nameRange = name_range;
    if (categories !== undefined) series.categories = categories;
  }
  if (owner !== change.sheet) return null;

  const index = transform_index(
    change.axis === "row" ? chart.anchor.row : chart.anchor.col,
    change,
  );
  if (index === null) return deleted_target(operation);
  if (change.axis === "row") chart.anchor.row = index;
  else chart.anchor.col = index;
  return null;
}

/**
 * Shift a privately owned pivot's anchor and live range source in place. A
 * deleted anchor cell or a source that straddles the edit is a conflict.
 * `table_sheet` is the sheet holding a table source, when the caller knows it.
 */
function transform_pivot(
  pivot: PivotDefinition,
  owner: string,
  change: Exclude<AxisChange, { kind: "move" }>,
  operation: string,
  table_sheet?: string,
): TransformFailure | null {
  const anchor = transform_address({ sheet: owner, ...pivot.anchor }, change);
  if (!anchor) return deleted_target(operation);
  pivot.anchor = { row: anchor.row, col: anchor.col };

  const source = pivot.source;
  if (source.invalid || "model" in source) return null;
  if ("table" in source) {
    // Field indices are table-column offsets. When the table's sheet is not
    // known, any concurrent column edit may shift them.
    const may_shift = table_sheet === undefined || table_sheet === change.sheet;
    return change.axis === "column" && may_shift
      ? {
          code: "unsupported-structural",
          message: "A table-sourced pivot cannot be rebased across a column edit",
        }
      : null;
  }

  // A range that straddles the edit changes size; one that moves whole keeps its fields.
  const range = transform_range(source.range, change);
  if (!range) return overlapping_structure(operation);
  source.range = range;
  return null;
}

/** Whether `pivot` summarizes a live range on `sheet`. */
function pivot_reads_sheet(pivot: PivotDefinition, sheet: string): boolean {
  return !pivot.source.invalid && "range" in pivot.source && pivot.source.range.sheet === sheet;
}

function transform_embedded_references(
  operation: DocumentOp,
  change: Exclude<AxisChange, { kind: "move" }>,
  restore_block: RestoreBlockReader,
): TransformFailure | null {
  switch (operation.op) {
    case "set": {
      const value = transform_cell_value(operation.value, change);
      if (!value) return deleted_reference();
      operation.value = value;
      return null;
    }
    case "setRange":
      return transform_snapshot_cells(operation.cells, change);
    case "setBlock":
      return transform_packed_block(operation.block, change);
    case "restoreBlock":
      return transform_packed_block(restore_block(operation), change);
    case "addSheet":
      return transform_sheet_snapshot(operation.sheet, change);
    default:
      return null;
  }
}

function transform_snapshot_cells(
  cells: SnapshotCell[],
  change: Exclude<AxisChange, { kind: "move" }>,
): TransformFailure | null {
  for (const cell of cells) {
    const value = transform_cell_value(cell.value, change);
    if (!value) return deleted_reference();
    // Only a moved reference is written; other cells may be shared with the caller.
    if (value !== cell.value) cell.value = value;
  }
  return null;
}

function transform_packed_block(
  block: PackedCellBlock,
  change: Exclude<AxisChange, { kind: "move" }>,
): TransformFailure | null {
  if (!block.refs) return null;
  for (const tuple of block.refs) {
    const address = transform_address(tuple[1], change);
    if (!address) return deleted_reference();
    tuple[1] = address;
  }
  return null;
}

function transform_sheet_snapshot(
  sheet: SheetSnapshot,
  change: Exclude<AxisChange, { kind: "move" }>,
): TransformFailure | null {
  for (const block of sheet.cells) {
    const failure = transform_snapshot_cells(block.cells, change);
    if (failure) return failure;
  }
  for (const table of sheet.tables ?? []) {
    const mapped = transform_range(table.range, change);
    if (!mapped && table.range.sheet === change.sheet) return overlapping_structure("addTable");
    if (mapped) table.range = mapped;
  }
  for (const chart of sheet.charts ?? []) {
    const failure = transform_chart(chart, sheet.id, change, "addSheet");
    if (failure) return failure;
  }
  for (const pivot of sheet.pivots ?? []) {
    // A table in the snapshot lives on the new sheet, which no remote edit can touch.
    const source = pivot.source;
    const own_table =
      "table" in source && (sheet.tables?.some((table) => table.id === source.table) ?? false);
    const failure = transform_pivot(
      pivot,
      sheet.id,
      change,
      "addSheet",
      own_table ? sheet.id : undefined,
    );
    if (failure) return failure;
  }
  return null;
}

function transform_cell_value(
  value: CellValue,
  change: Exclude<AxisChange, { kind: "move" }>,
): CellValue | null {
  if (value.kind !== "ref") return value;
  const target = transform_address(value.target, change);
  return target ? { kind: "ref", target } : null;
}

function transform_address(
  address: CellAddress,
  change: Exclude<AxisChange, { kind: "move" }>,
): CellAddress | null {
  if (address.sheet !== change.sheet) return address;
  const current = change.axis === "row" ? address.row : address.col;
  const mapped = transform_index(current, change);
  if (mapped === null) return null;
  return change.axis === "row" ? { ...address, row: mapped } : { ...address, col: mapped };
}

function transform_range(
  range: Range,
  change: Exclude<AxisChange, { kind: "move" }>,
): Range | null {
  if (range.sheet !== change.sheet) return range;
  const start = change.axis === "row" ? range.start.row : range.start.col;
  const end = change.axis === "row" ? range.end.row : range.end.col;
  const low = Math.min(start, end);
  const high = Math.max(start, end);
  const mapped = transform_inclusive_span(low, high, change);
  if (!mapped) return null;
  const forward = start <= end;
  const mapped_start = forward ? mapped.start : mapped.end;
  const mapped_end = forward ? mapped.end : mapped.start;
  return change.axis === "row"
    ? {
        ...range,
        start: { ...range.start, row: mapped_start },
        end: { ...range.end, row: mapped_end },
      }
    : {
        ...range,
        start: { ...range.start, col: mapped_start },
        end: { ...range.end, col: mapped_end },
      };
}

function transform_inclusive_span(
  start: number,
  end: number,
  change: Exclude<AxisChange, { kind: "move" }>,
): { start: number; end: number } | null {
  if (change.kind === "insert") {
    if (end < change.at) return { start, end };
    if (start >= change.at) return { start: start + change.count, end: end + change.count };
    return null;
  }
  const removed_end = change.at + change.count - 1;
  if (end < change.at) return { start, end };
  if (start > removed_end) return { start: start - change.count, end: end - change.count };
  return null;
}

function transform_span(
  at: number,
  count: number,
  change: Exclude<AxisChange, { kind: "move" }>,
): { at: number } | null {
  const mapped = transform_inclusive_span(at, at + count - 1, change);
  return mapped ? { at: mapped.start } : null;
}

function transform_index(
  index: number,
  change: Exclude<AxisChange, { kind: "move" }>,
): number | null {
  if (change.kind === "insert") return index >= change.at ? index + change.count : index;
  if (index < change.at) return index;
  if (index >= change.at + change.count) return index - change.count;
  return null;
}

function transform_position(
  position: number,
  change: Exclude<AxisChange, { kind: "move" }>,
): number {
  if (change.kind === "insert") return position >= change.at ? position + change.count : position;
  if (position <= change.at) return position;
  if (position >= change.at + change.count) return position - change.count;
  return change.at;
}

function operation_contains_formula(
  operation: DocumentOp,
  restore_block: RestoreBlockReader,
): boolean {
  switch (operation.op) {
    case "set":
      return operation.value.kind === "formula";
    case "setRange":
      return operation.cells.some((cell) => cell.value.kind === "formula");
    case "setBlock":
      return (operation.block.formulas?.length ?? 0) > 0;
    // A sort adjusts the formulas of moved rows, so it carries formula text.
    case "permuteRows":
    // A block move rewrites every formula that refers to the moved cells.
    case "moveCells":
      return true;
    case "restoreBlock":
      return (restore_block(operation).formulas?.length ?? 0) > 0;
    case "addSheet":
      return operation.sheet.cells.some((block) =>
        block.cells.some((cell) => cell.value.kind === "formula"),
      );
    case "setNamedRange":
      return operation.namedRange.formula !== undefined;
    default:
      return false;
  }
}

/** Two items of one dashboard whose boxes overlap: each is valid alone, not together. */
function dashboard_item_conflict(local: DocumentOp, remote: DocumentOp): TransformFailure | null {
  const overlapping =
    local.op === "setDashboardItem" &&
    remote.op === "setDashboardItem" &&
    remote.sheet === local.sheet &&
    remote.item.id !== local.item.id &&
    boxesOverlap(local.item.box, remote.item.box);
  return overlapping
    ? { code: "overlapping-edit", message: "A pending dashboard item overlaps a concurrent one" }
    : null;
}

function lifecycle_conflict(
  local: DocumentOp,
  remote: DocumentOp,
  restore_block: RestoreBlockReader,
): TransformFailure | null {
  if (remote.op === "removeSheet") {
    if (
      operation_touches_sheet(local, remote.sheet, restore_block) ||
      operation_contains_formula(local, restore_block) ||
      // The removed sheet may hold a table that the relationship names.
      local.op === "setRelationship"
    ) {
      return {
        code: "sheet-removed",
        message: "Pending work targets or may reference a removed sheet",
      };
    }

    return null;
  }

  if (
    local.op === "setRelationship" &&
    (remote.op === "removeTable" || remote.op === "updateTable") &&
    (local.relationship.from.table === remote.tableId ||
      local.relationship.to.table === remote.tableId)
  ) {
    return {
      code: "overlapping-edit",
      message: "A pending relationship names a table that a concurrent edit removed or changed",
    };
  }

  // A measure formula names tables and columns, and a rename rewrites only
  // the measures present when it applies, so a concurrent measure write
  // would keep the old names on one side.
  if (
    (local.op === "setMeasure" && renames_table(remote)) ||
    (remote.op === "setMeasure" && renames_table(local))
  ) {
    return {
      code: "overlapping-edit",
      message: "A pending measure change and a concurrent table rename may name the same table",
    };
  }

  const dashboard_conflict = dashboard_item_conflict(local, remote);
  if (dashboard_conflict) return dashboard_conflict;

  if (remote.op === "addSheet" && local.op === "addSheet" && local.sheet.id === remote.sheet.id) {
    return {
      code: "sheet-lifecycle",
      message: "Concurrent sheet creation reused the same stable ID",
    };
  }

  if (remote.op === "renameSheet") {
    if (
      (local.op === "renameSheet" && local.sheet === remote.sheet) ||
      operation_contains_formula(local, restore_block)
    ) {
      return {
        code: "sheet-lifecycle",
        message: "Concurrent sheet rename conflicts with a pending rename or formula source",
      };
    }
  }

  if (remote.op === "moveSheet" && local.op === "moveSheet" && local.sheet === remote.sheet) {
    return {
      code: "sheet-lifecycle",
      message: "Concurrent sheet moves have ambiguous ordering intent",
    };
  }

  if (remote.op === "setSheetVisibility") {
    if (local.op === "removeSheet" && local.sheet === remote.sheet) {
      return {
        code: "sheet-lifecycle",
        message: "Concurrent sheet removal conflicts with a pending visibility change",
      };
    }

    if (
      local.op === "setSheetVisibility" &&
      local.sheet === remote.sheet &&
      local.visibility !== remote.visibility
    ) {
      return {
        code: "sheet-lifecycle",
        message: "Concurrent sheet visibility changes have conflicting intent",
      };
    }
  }

  return null;
}

function renames_table(operation: DocumentOp): boolean {
  return (
    operation.op === "updateTable" &&
    (operation.patch.name !== undefined || operation.patch.columns !== undefined)
  );
}

function operation_touches_sheet(
  operation: DocumentOp,
  sheet: string,
  restore_block: RestoreBlockReader,
): boolean {
  switch (operation.op) {
    case "set":
      return (
        operation.addr.sheet === sheet ||
        (operation.value.kind === "ref" && operation.value.target.sheet === sheet)
      );

    case "setNote":
      return operation.addr.sheet === sheet;

    case "setRange":
      return (
        operation.range.sheet === sheet ||
        operation.cells.some(
          (cell) => cell.value.kind === "ref" && cell.value.target.sheet === sheet,
        )
      );

    case "setBlock":
      return (
        operation.range.sheet === sheet ||
        (operation.block.refs?.some((tuple) => tuple[1].sheet === sheet) ?? false)
      );

    case "restoreBlock":
      return (
        operation.range.sheet === sheet ||
        (restore_block(operation).refs?.some((tuple) => tuple[1].sheet === sheet) ?? false)
      );

    case "setRangeStyle":
    case "clearRange":
    case "permuteRows":
      return operation.range.sheet === sheet;

    case "addTable":
      return operation.table.range.sheet === sheet;

    case "setChart":
      return chartTouchesSheet(operation.chart, operation.sheet, sheet);

    case "setNamedRange":
      return operation.namedRange.range?.sheet === sheet || operation.namedRange.scope === sheet;

    case "removeNamedRange":
      return operation.scope === sheet;

    case "addSheet": {
      const snapshot = operation.sheet;
      return (
        snapshot.id === sheet ||
        snapshot.cells.some((block) =>
          block.cells.some(
            (cell) => cell.value.kind === "ref" && cell.value.target.sheet === sheet,
          ),
        ) ||
        // A chart or pivot in the new sheet can read any other sheet.
        (snapshot.charts?.some((chart) => chartTouchesSheet(chart, snapshot.id, sheet)) ?? false) ||
        (snapshot.pivots?.some((pivot) => pivot_reads_sheet(pivot, sheet)) ?? false)
      );
    }

    case "setPivot":
      return operation.sheet === sheet || pivot_reads_sheet(operation.pivot, sheet);

    case "moveCells":
      return operation.range.sheet === sheet || operation.to.sheet === sheet;

    default:
      return "sheet" in operation && operation.sheet === sheet;
  }
}

function operations_overlap(local: DocumentOp, remote: DocumentOp): boolean {
  const local_ranges = mutation_ranges(local);
  const remote_ranges = mutation_ranges(remote);
  for (const a of local_ranges) {
    for (const b of remote_ranges) {
      if (rangesIntersect(a, b)) return true;
    }
  }
  return (
    operation_identity(local) !== "" && operation_identity(local) === operation_identity(remote)
  );
}

function mutation_ranges(operation: DocumentOp): Range[] {
  switch (operation.op) {
    case "set":
    case "setNote":
      return [cellRange(operation.addr)];

    case "setRange":
    case "setBlock":
    case "restoreBlock":
    case "setRangeStyle":
    case "clearRange":
    case "permuteRows":
      return [operation.range];

    case "moveCells":
      return movedCellBounds(operation);

    case "addMerge":
    case "removeMerge":
      return [
        {
          sheet: operation.sheet,
          start: { row: operation.merge.r0, col: operation.merge.c0 },
          end: { row: operation.merge.r1, col: operation.merge.c1 },
        },
      ];

    case "setHyperlink":
      return [operation.hyperlink.range];

    case "setValidationRule":
      return [operation.rule.range];

    case "setProtectedRange":
      return [operation.protectedRange.range];

    case "setNamedRange":
      return operation.namedRange.range ? [operation.namedRange.range] : [];

    case "addTable":
      return [operation.table.range];

    case "updateTable":
      return operation.patch.range ? [operation.patch.range] : [];

    case "setPivot":
      return [
        {
          sheet: operation.sheet,
          start: { ...operation.pivot.anchor },
          end: { ...operation.pivot.anchor },
        },
      ];

    default:
      return [];
  }
}

function operation_identity(operation: DocumentOp): string {
  switch (operation.op) {
    case "setColumn":
      return `column:${operation.sheet}:${operation.col}`;

    case "setRowMeta":
      return `row:${operation.sheet}:${operation.row}`;

    case "setHyperlink":
    case "removeHyperlink":
      return `hyperlink:${operation.sheet}:${operation.op === "setHyperlink" ? operation.hyperlink.id : operation.id}`;

    case "setValidationRule":
    case "removeValidationRule":
      return `validation:${operation.sheet}:${operation.op === "setValidationRule" ? operation.rule.id : operation.id}`;

    case "setProtectedRange":
    case "removeProtectedRange":
      return `protection:${operation.sheet}:${operation.op === "setProtectedRange" ? operation.protectedRange.id : operation.id}`;

    case "setNamedRange":
      return `name:${operation.namedRange.scope ?? ""}:${operation.namedRange.name.toLowerCase()}`;

    case "removeNamedRange":
      return `name:${operation.scope ?? ""}:${operation.name.toLowerCase()}`;

    case "addTable":
      return `table:${operation.table.id}`;

    case "updateTable":
    case "removeTable":
      return `table:${operation.tableId}`;

    case "setSheetMeta":
      return `sheet-meta:${operation.sheet}`;

    case "setChart":
    case "removeChart":
      return `chart:${operation.sheet}:${operation.op === "setChart" ? operation.chart.id : operation.id}`;

    // Workbook-wide: concurrent calculation changes always conflict, nothing else does.
    case "setCalculation":
      return "calculation";

    // The whole list is replaced, so the last writer wins.
    case "setExternalLinks":
      return "external-links";

    // The model is checked as a whole (no cycle, one relationship per pair of
    // tables), so any two concurrent relationship changes conflict.
    case "setRelationship":
    case "removeRelationship":
    case "setMeasure":
    case "removeMeasure":
      return "data-model";

    // Joins and output tables are checked across all queries, so any two
    // concurrent definition changes conflict.
    case "setQuery":
    case "removeQuery":
      return "queries";

    case "setPivot":
      return `pivot:${operation.pivot.id}`;

    case "removePivot":
      return `pivot:${operation.id}`;

    case "setDashboardItem":
    case "removeDashboardItem":
      return `dashboard:${operation.sheet}:${operation.op === "setDashboardItem" ? operation.item.id : operation.id}`;

    default:
      return "";
  }
}

function deleted_target(operation: string): TransformFailure {
  return {
    code: "structural-overlap",
    message: `${operation} targets a row or column deleted by the server-ordered operation`,
  };
}

function deleted_reference(): TransformFailure {
  return {
    code: "structural-overlap",
    message: "Pending reference targets a row or column deleted by the server-ordered operation",
  };
}

/** `setSheetMeta` fields whose coordinates follow a concurrent row or column edit. */
const STRUCTURE_AWARE_META: ReadonlySet<string> = new Set([
  "conditionalFormats",
  "filters",
  "autoFilter",
]);

function overlapping_structure(operation: string): TransformFailure {
  return {
    code: "structural-overlap",
    message: `${operation} spans a concurrent row or column insertion/deletion boundary`,
  };
}
