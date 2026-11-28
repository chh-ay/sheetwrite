import type { Column } from "../types/cell.js";
import type { CellAddress, MergeRange, Range, SheetId } from "../types/coordinates.js";
import type {
  AutoFilter,
  ColumnFilter,
  DataValidationRule,
  DocumentOp,
  ProtectedRange,
  RowGroup,
  Sheet,
  SheetVisibility,
  SortKey,
} from "../types/document.js";
import { DYNAMIC_DATE_FILTERS, validCustomFilter } from "./autofilter.js";

export function integerAt(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

export function positiveCount(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

export function uniqueColumnKeys(columns: readonly Column[]): boolean {
  const keys = new Set<string>();
  for (const column of columns) {
    if (!column.key || keys.has(column.key)) return false;
    keys.add(column.key);
  }
  return true;
}

export function visibleColumns(sheet: Sheet): number[] {
  const indices: number[] = [];
  for (const [index, column] of sheet.columns.entries()) {
    if (column.visible !== false) indices.push(index);
  }
  return indices;
}

export function addRowGroup(
  groups: readonly RowGroup[] = [],
  start: number,
  end: number,
): RowGroup[] {
  const group = { start: Math.min(start, end), end: Math.max(start, end), collapsed: false };
  return [...removeRowGroup(groups, group.start, group.end), group];
}

export function removeRowGroup(
  groups: readonly RowGroup[] = [],
  start: number,
  end: number,
): RowGroup[] {
  const first = Math.min(start, end);
  const last = Math.max(start, end);
  return groups.filter((group) => group.start !== first || group.end !== last);
}

export function collapseRowGroup(
  groups: readonly RowGroup[] = [],
  start: number,
  collapsed: boolean,
): RowGroup[] {
  return groups.map((group) => (group.start === start ? { ...group, collapsed } : group));
}

/**
 * The first visible sheet to the right of `source`, else the first to its
 * left, else null. When `source` is no longer in `sheets`, `removedIndex` is
 * the position it had, and the search starts there.
 */
export function visibleSheetNeighbor(
  sheets: readonly { id: SheetId; visibility?: SheetVisibility }[],
  source: SheetId,
  removedIndex?: number,
): SheetId | null {
  const source_index = sheets.findIndex((sheet) => sheet.id === source);
  const right_start =
    source_index >= 0
      ? source_index + 1
      : Math.max(0, Math.min(removedIndex ?? sheets.length, sheets.length));
  for (let index = right_start; index < sheets.length; index++) {
    const sheet = sheets[index]!;
    if ((sheet.visibility ?? "visible") === "visible") return sheet.id;
  }
  const left_start =
    source_index >= 0 ? source_index - 1 : Math.min(right_start - 1, sheets.length - 1);
  for (let index = left_start; index >= 0; index--) {
    const sheet = sheets[index]!;
    if ((sheet.visibility ?? "visible") === "visible") return sheet.id;
  }
  return null;
}

function is_visible_sheet(sheet: { visibility?: SheetVisibility }): boolean {
  return (sheet.visibility ?? "visible") === "visible";
}

/**
 * The sheet to show for `active`: itself when it is in `sheets` and visible,
 * else its nearest visible neighbour. With no visible sheet it stays `active`.
 */
export function resolveActiveSheet(
  sheets: readonly { id: SheetId; visibility?: SheetVisibility }[],
  active: SheetId,
): SheetId {
  const sheet = sheets.find((candidate) => candidate.id === active);
  if (sheet && is_visible_sheet(sheet)) return active;
  return visibleSheetNeighbor(sheets, active) ?? active;
}

export function normalizedRange(range: Range): Range {
  return {
    sheet: range.sheet,
    start: {
      row: Math.min(range.start.row, range.end.row),
      col: Math.min(range.start.col, range.end.col),
    },
    end: {
      row: Math.max(range.start.row, range.end.row),
      col: Math.max(range.start.col, range.end.col),
    },
  };
}

export function normalizeMerge(merge: MergeRange): MergeRange {
  return {
    r0: Math.min(merge.r0, merge.r1),
    c0: Math.min(merge.c0, merge.c1),
    r1: Math.max(merge.r0, merge.r1),
    c1: Math.max(merge.c0, merge.c1),
  };
}

export function validMerge(sheet: Sheet, merge: MergeRange): boolean {
  return (
    [merge.r0, merge.c0, merge.r1, merge.c1].every(integerAt) &&
    merge.r0 <= merge.r1 &&
    merge.c0 <= merge.c1 &&
    merge.r1 < sheet.rowCount &&
    merge.c1 < sheet.columns.length &&
    (merge.r0 !== merge.r1 || merge.c0 !== merge.c1)
  );
}

export function mergesOverlap(left: MergeRange, right: MergeRange): boolean {
  return left.r0 <= right.r1 && right.r0 <= left.r1 && left.c0 <= right.c1 && right.c0 <= left.c1;
}

export function sameMerge(left: MergeRange, right: MergeRange): boolean {
  const normalized = normalizeMerge(left);
  return (
    normalized.r0 === right.r0 &&
    normalized.c0 === right.c0 &&
    normalized.r1 === right.r1 &&
    normalized.c1 === right.c1
  );
}

export function mergeCrossesFreeze(sheet: Sheet, merge: MergeRange): boolean {
  const frozen_rows = sheet.frozenRows ?? 0;
  const frozen_cols = sheet.frozenCols ?? 0;
  return (
    (merge.r0 < frozen_rows && merge.r1 >= frozen_rows) ||
    (merge.c0 < frozen_cols && merge.c1 >= frozen_cols)
  );
}

/** Whether `value` is a validation formula: text with its leading `=` and something after it. */
function is_validation_formula(value: unknown): value is string {
  return typeof value === "string" && value.length > 1 && value.startsWith("=");
}

function valid_validation_comparison(value: unknown, text_length: boolean): boolean {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const comparison = value as Record<string, unknown>;
  const operator = comparison.operator;
  // A formula bound is checked when a value is, in its cell.
  const valid_operand = (operand: unknown): boolean =>
    is_validation_formula(operand) ||
    (text_length
      ? typeof operand === "number" && Number.isSafeInteger(operand) && operand >= 0
      : typeof operand === "number" && Number.isFinite(operand));

  if (operator === "between" || operator === "notBetween") {
    const { min, max } = comparison;
    return (
      valid_operand(min) &&
      valid_operand(max) &&
      (typeof min !== "number" || typeof max !== "number" || min <= max) &&
      comparison.value === undefined
    );
  }
  if (
    ![
      "equal",
      "notEqual",
      "greaterThan",
      "lessThan",
      "greaterThanOrEqual",
      "lessThanOrEqual",
    ].includes(String(operator))
  ) {
    return false;
  }
  return (
    valid_operand(comparison.value) && comparison.min === undefined && comparison.max === undefined
  );
}

/**
 * The most data validation rules a sheet holds. A check of a value runs
 * every rule over its cell, so the XLSX reader drops the rules past it, and
 * snapshots and operations that pass it are refused.
 */
export const MAX_VALIDATION_RULES = 1_000;

export function validValidationRules(sheet: Sheet, rules: readonly DataValidationRule[]): boolean {
  const ids = new Set<string>();
  for (const rule of rules) {
    if (!rule.id || ids.has(rule.id) || rule.range.sheet !== sheet.id) return false;
    ids.add(rule.id);
    const range = normalizedRange(rule.range);
    if (
      !integerAt(range.start.row) ||
      !integerAt(range.start.col) ||
      range.end.row >= sheet.rowCount ||
      range.end.col >= sheet.columns.length ||
      !["reject", "warn", "allow"].includes(rule.policy)
    ) {
      return false;
    }
    const condition = rule.condition;
    if (condition.kind === "list") {
      const valid =
        "source" in condition
          ? is_validation_formula(condition.source)
          : Array.isArray(condition.values) && condition.values.length > 0;
      if (!valid) {
        return false;
      }
    } else if (
      condition.kind === "number" ||
      condition.kind === "date" ||
      condition.kind === "time"
    ) {
      if (
        (condition.min !== undefined && !Number.isFinite(condition.min)) ||
        (condition.max !== undefined && !Number.isFinite(condition.max)) ||
        (condition.min !== undefined &&
          condition.max !== undefined &&
          condition.min > condition.max) ||
        (condition.comparison !== undefined &&
          (condition.min !== undefined ||
            condition.max !== undefined ||
            !valid_validation_comparison(condition.comparison, false)))
      ) {
        return false;
      }
    } else if (condition.kind === "textLength") {
      if (
        (condition.min !== undefined &&
          (!Number.isSafeInteger(condition.min) || condition.min < 0)) ||
        (condition.max !== undefined &&
          (!Number.isSafeInteger(condition.max) || condition.max < 0)) ||
        (condition.min !== undefined &&
          condition.max !== undefined &&
          condition.min > condition.max) ||
        (condition.comparison !== undefined &&
          (condition.min !== undefined ||
            condition.max !== undefined ||
            !valid_validation_comparison(condition.comparison, true)))
      ) {
        return false;
      }
    } else if (condition.kind === "custom") {
      if (!is_validation_formula(condition.formula)) return false;
    } else if (condition.kind !== "checkbox" && condition.kind !== "any") {
      return false;
    }
  }
  return true;
}

export function validProtectedRanges(sheet: Sheet, ranges: readonly ProtectedRange[]): boolean {
  const ids = new Set<string>();
  for (const protected_range of ranges) {
    const range = normalizedRange(protected_range.range);
    if (
      !protected_range.id ||
      ids.has(protected_range.id) ||
      range.sheet !== sheet.id ||
      !integerAt(range.start.row) ||
      !integerAt(range.start.col) ||
      range.end.row >= sheet.rowCount ||
      range.end.col >= sheet.columns.length
    ) {
      return false;
    }
    ids.add(protected_range.id);
  }
  return true;
}

export function validNotes(sheet: Sheet): boolean {
  const addresses = new Set<string>();
  for (const note of sheet.notes ?? []) {
    const key = `${note.addr.row}:${note.addr.col}`;
    if (
      note.addr.sheet !== sheet.id ||
      !integerAt(note.addr.row) ||
      !integerAt(note.addr.col) ||
      note.addr.row >= sheet.rowCount ||
      note.addr.col >= sheet.columns.length ||
      typeof note.text !== "string" ||
      note.text.length === 0 ||
      addresses.has(key)
    ) {
      return false;
    }
    addresses.add(key);
  }
  return true;
}

export function validSortAndFilters(
  sheet: Sheet,
  sortKeys: readonly SortKey[],
  filters: readonly [number, ColumnFilter][],
): boolean {
  const sorted = new Set<number>();
  for (const key of sortKeys) {
    if (!integerAt(key.col) || key.col >= sheet.columns.length || sorted.has(key.col)) return false;
    sorted.add(key.col);
  }
  const filtered = new Set<number>();
  for (const [col, filter] of filters) {
    if (!integerAt(col) || col >= sheet.columns.length || filtered.has(col)) return false;
    filtered.add(col);
    if (!valid_column_filter(filter)) return false;
  }
  return true;
}

function valid_column_filter(filter: ColumnFilter): boolean {
  switch (filter.kind) {
    case "values":
      return Array.isArray(filter.values);
    case "contains":
      return typeof filter.text === "string";
    case "compare":
      return (
        ["gt", "gte", "lt", "lte", "eq", "neq"].includes(filter.op) && Number.isFinite(filter.value)
      );
    case "custom":
      return validCustomFilter(filter);
    case "empty":
    case "nonEmpty":
      return true;
    case "dynamic":
      return DYNAMIC_DATE_FILTERS.has(filter.type);
    default:
      return false;
  }
}

/** Whether `autoFilter` is a range of at least its header row on `sheet`. */
export function validAutoFilter(sheet: Sheet, autoFilter: AutoFilter): boolean {
  const { range } = autoFilter;
  return (
    range.sheet === sheet.id &&
    integerAt(range.start.row) &&
    integerAt(range.start.col) &&
    integerAt(range.end.row) &&
    integerAt(range.end.col) &&
    range.start.row <= range.end.row &&
    range.start.col <= range.end.col &&
    range.end.row < sheet.rowCount &&
    range.end.col < sheet.columns.length
  );
}

export function patchSheetId(patch: DocumentOp): SheetId | null {
  switch (patch.op) {
    case "set":
    case "setNote":
      return patch.addr.sheet;
    case "setRange":
    case "setBlock":
    case "restoreBlock":
    case "setRangeStyle":
    case "clearRange":
    case "permuteRows":
    case "moveCells":
      return patch.range.sheet;
    case "addTable":
      return patch.table.range.sheet;
    case "setNamedRange":
    case "removeNamedRange":
    case "setCalculation":
    case "setExternalLinks":
    case "setRelationship":
    case "removeRelationship":
    case "setMeasure":
    case "removeMeasure":
    case "setQuery":
    case "removeQuery":
      return null;
    case "addSheet":
      return patch.sheet.id;
    default:
      return patch.sheet;
  }
}

export function cellRange(addr: CellAddress): Range {
  return {
    sheet: addr.sheet,
    start: { row: addr.row, col: addr.col },
    end: { row: addr.row, col: addr.col },
  };
}

/** The block of cells a `moveCells` operation lands on. */
export function movedBlock(patch: Extract<DocumentOp, { op: "moveCells" }>): Range {
  const from = normalizedRange(patch.range);
  return {
    sheet: patch.to.sheet,
    start: { row: patch.to.row, col: patch.to.col },
    end: {
      row: patch.to.row + from.end.row - from.start.row,
      col: patch.to.col + from.end.col - from.start.col,
    },
  };
}

/**
 * The cells a `moveCells` operation reads or writes: the block and where it
 * lands, or for a shift one range from the first of them to the last, which
 * also holds the cells a deletion closes between them.
 */
export function movedCellBounds(patch: Extract<DocumentOp, { op: "moveCells" }>): Range[] {
  const from = normalizedRange(patch.range);
  const to = movedBlock(patch);
  if (patch.shift !== true) return [from, to];
  return [
    {
      sheet: from.sheet,
      start: {
        row: Math.min(from.start.row, to.start.row),
        col: Math.min(from.start.col, to.start.col),
      },
      end: { row: Math.max(from.end.row, to.end.row), col: Math.max(from.end.col, to.end.col) },
    },
  ];
}

/**
 * The cells whose contents `patch` writes, which pivot output may own; null
 * for operations that write no cell contents, such as a style-only clear.
 */
export function pivotWrittenRange(patch: DocumentOp): Range | null {
  switch (patch.op) {
    case "set":
      return cellRange(patch.addr);
    case "setRange":
    case "setBlock":
    case "restoreBlock":
    case "permuteRows":
      return patch.range;
    case "clearRange":
      return patch.contents === false ? null : patch.range;
    default:
      return null;
  }
}

export function fullSheetRange(sheet: Sheet): Range {
  return {
    sheet: sheet.id,
    start: { row: 0, col: 0 },
    end: { row: sheet.rowCount - 1, col: sheet.columns.length - 1 },
  };
}

export function rangesIntersect(left: Range, right: Range): boolean {
  if (left.sheet !== right.sheet) return false;
  const a = normalizedRange(left);
  const b = normalizedRange(right);
  return (
    a.start.row <= b.end.row &&
    b.start.row <= a.end.row &&
    a.start.col <= b.end.col &&
    b.start.col <= a.end.col
  );
}

export function rangeContains(range: Range, addr: CellAddress): boolean {
  if (range.sheet !== addr.sheet) return false;
  const normalized = normalizedRange(range);
  return (
    addr.row >= normalized.start.row &&
    addr.row <= normalized.end.row &&
    addr.col >= normalized.start.col &&
    addr.col <= normalized.end.col
  );
}

export type SheetAxis = "row" | "column";

/** `range` with its `axis` span remapped; null when the remap removes the whole span. */
export function rebaseRangeSpan(
  range: Range,
  axis: SheetAxis,
  remap: (index: number) => number | null,
): Range | null {
  const key = axis === "row" ? "row" : "col";
  const span = remapSpan(range.start[key], range.end[key], remap);
  if (!span) return null;

  return {
    ...range,
    start: { ...range.start, [key]: span[0] },
    end: { ...range.end, [key]: span[1] },
  };
}

/**
 * The sheet's AutoFilter after an axis edit: its range follows the rows and
 * columns. It goes when the edit removes its header row or all its columns.
 */
export function rebaseSheetAutoFilter(
  sheet: Sheet,
  axis: SheetAxis,
  remap: (index: number) => number | null,
): void {
  const auto_filter = sheet.autoFilter;
  if (!auto_filter) return;

  const range =
    axis === "row" && remap(auto_filter.range.start.row) === null
      ? null
      : rebaseRangeSpan(auto_filter.range, axis, remap);
  if (range) sheet.autoFilter = { range };
  else delete sheet.autoFilter;
}

/** `item` with its range rebased along `axis` when it lies on `sheet`; null when the remap removes it. */
export function rebaseRangeAxis<T extends { range: Range }>(
  item: T,
  sheet: SheetId,
  axis: SheetAxis,
  remap: (index: number) => number | null,
): T | null {
  if (item.range.sheet !== sheet) return item;

  const range = rebaseRangeSpan(item.range, axis, remap);
  return range ? { ...item, range } : null;
}

/** Every item rebased with `rebaseRangeAxis`, dropping the removed ones. */
export function rebaseRangeItems<T extends { range: Range }>(
  items: readonly T[],
  sheet: SheetId,
  axis: SheetAxis,
  remap: (index: number) => number | null,
): T[] {
  const rebased: T[] = [];
  for (const item of items) {
    const next = rebaseRangeAxis(item, sheet, axis, remap);
    if (next) rebased.push(next);
  }
  return rebased;
}

export function remapSpan(
  start: number,
  end: number,
  remap: (index: number) => number | null,
): [number, number] | null {
  const low = Math.min(start, end);
  const high = Math.max(start, end);
  let mapped_start: number | null = null;
  for (let index = low; index <= high; index++) {
    const mapped = remap(index);
    if (mapped !== null) {
      mapped_start = mapped;
      break;
    }
  }
  if (mapped_start === null) return null;
  let mapped_end = mapped_start;
  for (let index = high; index >= low; index--) {
    const mapped = remap(index);
    if (mapped !== null) {
      mapped_end = mapped;
      break;
    }
  }
  return [Math.min(mapped_start, mapped_end), Math.max(mapped_start, mapped_end)];
}

/** Old-to-new index map of an insert of `count` indexes at `at`. */
export function insertRemap(at: number, count: number): (index: number) => number {
  return (index) => (index >= at ? index + count : index);
}

/** Old-to-new index map of a delete of `count` indexes at `at`; a deleted index maps to null. */
export function deleteRemap(at: number, count: number): (index: number) => number | null {
  return (index) => (index < at ? index : index < at + count ? null : index - count);
}

/** Old-to-new index map of a move of `count` indexes from `from` to `to`. */
export function moveRemap(from: number, count: number, to: number): (index: number) => number {
  return (index) => moveIndex(index, from, count, to);
}

export function moveIndex(index: number, from: number, count: number, to: number): number {
  if (index >= from && index < from + count) return to + index - from;
  const removed = index < from ? index : index - count;
  return removed >= to ? removed + count : removed;
}

/**
 * The span `start..end` after `count` indexes move from `from` to `to`, as
 * Excel's Cut and Insert Cut Cells changes a range: a span inside the moved
 * block moves with it; any other span changes as if the block were deleted
 * where it was and inserted where it lands. It loses the moved indexes it
 * held, a moved edge included, and grows by the block only when the block
 * lands after its first index and at or before its last. The engine applies
 * the same rule to formula references (`moved_span`).
 */
function moved_span(
  start: number,
  end: number,
  from: number,
  count: number,
  to: number,
): [number, number] | null {
  if (start >= from && end < from + count) return [to + start - from, to + end - from];

  const removed = remapSpan(start, end, deleteRemap(from, count));
  return removed && remapSpan(removed[0], removed[1], insertRemap(to, count));
}

/**
 * `range` after the move of `move.count` rows or columns along `axis` from
 * `move.from` to `move.to` (see `moved_span`). A range on another sheet, or
 * one the move does not change, is returned as it is; a range that keeps no
 * index keeps its place.
 */
export function rebaseMovedRange(
  range: Range,
  axis: SheetAxis,
  move: {
    readonly sheet: SheetId;
    readonly from: number;
    readonly count: number;
    readonly to: number;
  },
): Range {
  if (range.sheet !== move.sheet) return range;

  const key = axis === "row" ? "row" : "col";
  const span = moved_span(range.start[key], range.end[key], move.from, move.count, move.to);
  if (!span || (span[0] === range.start[key] && span[1] === range.end[key])) return range;

  return {
    ...range,
    start: { ...range.start, [key]: span[0] },
    end: { ...range.end, [key]: span[1] },
  };
}

/**
 * Whether the rows or columns of `range` stay next to each other after the
 * move, so no other row or column lands between them. Excel refuses a move
 * that would split a table this way.
 */
export function staysWholeAfterMove(
  range: Range,
  axis: SheetAxis,
  move: {
    readonly sheet: SheetId;
    readonly from: number;
    readonly count: number;
    readonly to: number;
  },
): boolean {
  if (range.sheet !== move.sheet) return true;

  const key = axis === "row" ? "row" : "col";
  const start = Math.min(range.start[key], range.end[key]);
  const end = Math.max(range.start[key], range.end[key]);
  let low = Number.POSITIVE_INFINITY;
  let high = Number.NEGATIVE_INFINITY;
  for (let index = start; index <= end; index++) {
    const moved = moveIndex(index, move.from, move.count, move.to);
    low = Math.min(low, moved);
    high = Math.max(high, moved);
  }
  return high - low === end - start;
}
