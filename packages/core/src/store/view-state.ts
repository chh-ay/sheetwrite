import { SheetwriteError } from "../errors.js";
import { cloneJsonValue } from "../plain-data.js";
import type { CellScalar } from "../types/cell.js";
import type { SheetId } from "../types/coordinates.js";
import type { ColumnFilter, RowGroup, SortKey } from "../types/document.js";
import type { ResourceOwnerBytes } from "../types/store.js";
import { conditionCriterion, dynamicDateSpan, keepOutsideAutoFilter } from "./autofilter.js";
import { EngineHiddenRows } from "./engine-hidden-rows.js";
import type { SheetRegistry } from "./sheet-registry.js";
import type { RecomputingCellStore } from "./wasm-contract.js";
import { KIND_NUMBER, KIND_STRING, KIND_BOOL } from "./wire-tags.js";

const EMPTY_U32 = new Uint32Array(0);
const EMPTY_FILTERS: ReadonlyMap<number, ColumnFilter> = new Map();
const EMPTY_GROUPS: readonly RowGroup[] = [];
const ABSENT_VIEW_ROW = 0xffff_ffff;

type PackedRowIndexKind = "empty" | "sparse" | "dense";

interface PackedRowIndex {
  readonly kind: PackedRowIndexKind;
  readonly storage: Uint32Array;
  logicalRows: number;
  valid: boolean;
}

interface PackedRowIndexShape {
  readonly kind: PackedRowIndexKind;
  readonly storageLength: number;
}

function packed_index_shape(logical_rows: number, survivors: number): PackedRowIndexShape {
  if (survivors === 0) return { kind: "empty", storageLength: 0 };

  const required_slots = survivors * 2;

  if (required_slots < 0x8000_0000) {
    let capacity = 1;
    while (capacity < required_slots) capacity *= 2;
    const storage_length = capacity * 2;
    if (storage_length < logical_rows) return { kind: "sparse", storageLength: storage_length };
  }

  return { kind: "dense", storageLength: logical_rows };
}

function hash_data_row(row: number): number {
  return Math.imul(row ^ (row >>> 16), 0x045d_9f3b) >>> 0;
}

const COMPARE_OP: Record<"gt" | "gte" | "lt" | "lte" | "eq" | "neq", number> = {
  gt: 0,
  gte: 1,
  lt: 2,
  lte: 3,
  eq: 4,
  neq: 5,
};

interface ViewState {
  sortKeys: SortKey[];
  filters: Map<number, ColumnFilter>;
  hiddenRows: Set<number>;
  groups: RowGroup[];
}

/** Owns the mutable view permutation and its query configuration. */
export class StoreViewState {
  private readonly order_by_sheet = new Map<SheetId, Uint32Array>();
  private readonly row_index_by_sheet = new Map<SheetId, PackedRowIndex>();
  private readonly state_by_sheet = new Map<SheetId, ViewState>();
  private readonly engine_hidden_rows: EngineHiddenRows;

  constructor(
    private wasm: RecomputingCellStore,
    private readonly sheets: SheetRegistry,
  ) {
    this.engine_hidden_rows = new EngineHiddenRows(wasm, sheets.workbook, sheets.handles);
  }

  replaceEngine(wasm: RecomputingCellStore): void {
    this.wasm = wasm;
    this.engine_hidden_rows.replaceEngine(wasm);
  }

  /** Queue a sheet that was loaded or added with hidden rows of its own. */
  queueHiddenRows(sheet: SheetId): void {
    this.engine_hidden_rows.queue(sheet);
  }

  /** Whether a sheet waits for {@link flushHiddenRows}. */
  hasQueuedHiddenRows(): boolean {
    return this.engine_hidden_rows.hasQueued();
  }

  /** Send the hidden rows of the sheets changed since the last flush to the engine. */
  flushHiddenRows(): void {
    this.engine_hidden_rows.flush();
  }

  order(sheet: SheetId): Uint32Array | undefined {
    return this.order_by_sheet.get(sheet);
  }

  dataRowAt(sheet: SheetId, viewRow: number): number {
    const order = this.order_by_sheet.get(sheet);
    return order ? (order[viewRow] ?? viewRow) : viewRow;
  }

  viewRowOf(sheet: SheetId, dataRow: number): number | null {
    if (!Number.isInteger(dataRow) || dataRow < 0) return null;

    const order = this.order_by_sheet.get(sheet);
    if (!order) {
      const meta = this.sheets.workbook.sheets.find((candidate) => candidate.id === sheet);
      return meta !== undefined && dataRow < meta.rowCount ? dataRow : null;
    }

    let index = this.row_index_by_sheet.get(sheet);
    if (!index?.valid) {
      const meta = this.sheets.sheetMeta(sheet);
      if (dataRow >= meta.rowCount) return null;
      index = this.rebuild_row_index(sheet, order, meta.rowCount, index);
    }

    if (dataRow >= index.logicalRows || index.kind === "empty") return null;

    if (index.kind === "dense") {
      const view_row = index.storage[dataRow]!;
      return view_row === ABSENT_VIEW_ROW ? null : view_row;
    }

    const capacity = index.storage.length / 2;
    const mask = capacity - 1;
    let slot = hash_data_row(dataRow) & mask;

    for (;;) {
      const at = slot * 2;
      const stored_data_row = index.storage[at]!;
      if (stored_data_row === ABSENT_VIEW_ROW) return null;
      if (stored_data_row === dataRow) return index.storage[at + 1]!;
      slot = (slot + 1) & mask;
    }
  }

  /** Retained packed backing bytes for focused resource attribution. */
  inverseIndexByteLength(sheet: SheetId): number {
    return this.row_index_by_sheet.get(sheet)?.storage.byteLength ?? 0;
  }

  columnFilters(sheet: SheetId): ReadonlyMap<number, ColumnFilter> {
    return this.state_by_sheet.get(sheet)?.filters ?? EMPTY_FILTERS;
  }

  rowGroups(sheet: SheetId): readonly RowGroup[] {
    return this.sheets.sheetMeta(sheet).rowGroups ?? EMPTY_GROUPS;
  }

  dataEdge(sheet: SheetId, row: number, col: number, dRow: number, dCol: number): number {
    const handle = this.sheets.handleOf(sheet);
    const order = this.order_by_sheet.get(sheet);
    if (order) return this.wasm.dataEdgeOrdered(handle, order, row, col, dRow, dCol);
    return this.wasm.dataEdge(handle, row, col, dRow, dCol);
  }

  viewRowCount(sheet: SheetId): number {
    return this.order_by_sheet.get(sheet)?.length ?? this.sheets.sheetMeta(sheet).rowCount;
  }

  hasView(sheet: SheetId): boolean {
    return this.order_by_sheet.has(sheet);
  }

  /** Refresh state after row/group/query metadata has been applied to the workbook. */
  metadataChanged(sheet: SheetId): void {
    const meta = this.sheets.sheetMeta(sheet);
    const state = this.ensure_state(sheet);

    state.sortKeys = meta.sortKeys?.map((key) => ({ ...key })) ?? [];
    state.filters = new Map(
      meta.filters?.map(([col, filter]) => [col, cloneJsonValue(filter)]) ?? [],
    );
    state.hiddenRows = new Set(meta.hiddenRows ?? []);
    state.groups = meta.rowGroups?.map((group) => ({ ...group })) ?? [];

    this.recompute(sheet);
  }

  /**
   * Build the view of a sheet that was loaded with saved hidden rows, row
   * groups, filters or sort keys, as {@link metadataChanged} does for a live
   * edit. A sheet without them keeps no view state.
   */
  sheetLoaded(sheet: SheetId): void {
    const meta = this.sheets.sheetMeta(sheet);
    if (
      (meta.hiddenRows?.size ?? 0) > 0 ||
      (meta.rowGroups?.length ?? 0) > 0 ||
      (meta.filters?.length ?? 0) > 0 ||
      (meta.sortKeys?.length ?? 0) > 0
    ) {
      this.metadataChanged(sheet);
    }
  }

  /** Filters and sort keys read cell values, so cells loaded after the sheet change the view. */
  cellsLoaded(sheet: SheetId): void {
    const state = this.state_by_sheet.get(sheet);
    if (state && (state.filters.size > 0 || state.sortKeys.length > 0)) this.recompute(sheet);
  }

  /**
   * Row structures already rebased workbook metadata; invalidate the sort and
   * rebuild from it. Column filters keep: they name columns, not rows, as an
   * AutoFilter's do in Excel when rows are inserted or deleted.
   */
  rowsChanged(sheet: SheetId): void {
    const state = this.state_by_sheet.get(sheet);
    if (state) {
      const meta = this.sheets.sheetMeta(sheet);
      meta.sortKeys = [];
      state.sortKeys = [];
      state.hiddenRows = new Set(meta.hiddenRows ?? []);
      state.groups = meta.rowGroups?.map((group) => ({ ...group })) ?? [];
    }

    this.recompute(sheet);
  }

  /**
   * Column shifts invalidate the sort but preserve row visibility. Column
   * filters move with their columns; a removed column's filter goes.
   */
  columnsChanged(sheet: SheetId, remap: (col: number) => number | null): void {
    const state = this.state_by_sheet.get(sheet);
    if (state) {
      const meta = this.sheets.sheetMeta(sheet);
      const filters: Array<[number, ColumnFilter]> = [];
      for (const [col, filter] of meta.filters ?? []) {
        const moved = remap(col);
        if (moved !== null) filters.push([moved, filter]);
      }
      meta.sortKeys = [];
      meta.filters = filters;
      state.sortKeys = [];
      state.filters = new Map(filters);
    }

    this.recompute(sheet);
  }

  removeSheet(sheet: SheetId): void {
    this.state_by_sheet.delete(sheet);
    this.order_by_sheet.delete(sheet);
    this.row_index_by_sheet.delete(sheet);
    this.engine_hidden_rows.removeSheet(sheet);
  }

  resourceOwners(): ResourceOwnerBytes[] {
    let order_bytes = 0;
    let order_entries = 0;

    for (const order of this.order_by_sheet.values()) {
      order_bytes += order.byteLength;
      order_entries += order.length;
    }

    let inverse_bytes = 0;
    let inverse_entries = 0;

    for (const index of this.row_index_by_sheet.values()) {
      inverse_bytes += index.storage.byteLength;
      inverse_entries += index.storage.length;
    }

    let config_entries = 0;

    for (const state of this.state_by_sheet.values()) {
      config_entries +=
        state.sortKeys.length + state.filters.size + state.hiddenRows.size + state.groups.length;
    }

    return [
      {
        owner: "js.view.order",
        logicalBytes: order_bytes,
        allocatedBytes: order_bytes,
        entries: order_entries,
        measurement: "typed-array-byte-length",
      },
      {
        owner: "js.view.inverse-index",
        logicalBytes: inverse_bytes,
        allocatedBytes: inverse_bytes,
        entries: inverse_entries,
        measurement: "typed-array-byte-length",
      },
      {
        owner: "js.view.configuration",
        logicalBytes: 0,
        allocatedBytes: 0,
        entries: config_entries,
        measurement: "entry-count-only",
      },
    ];
  }

  dispose(): void {
    this.state_by_sheet.clear();
    this.order_by_sheet.clear();
    this.row_index_by_sheet.clear();
    this.engine_hidden_rows.dispose();
  }

  /**
   * The distinct values of a column, in first-seen order. With `rows` and
   * `counted`, also the style id of each value's first cell and how many
   * scanned rows hold each value, and the scan reads past `limit` values so
   * the counts cover every row; without `counted` both are empty.
   */
  distinctValues(
    sheet: SheetId,
    col: number,
    limit: number,
    rows?: { start: number; end: number },
    only?: Uint32Array,
    counted = false,
  ): { values: CellScalar[]; styles: Uint32Array; counts: Uint32Array } {
    const handle = this.sheets.handleOf(sheet);
    const column = rows
      ? this.wasm.distinctValuesInRows(handle, col, rows.start, rows.end, limit, only, counted)
      : this.wasm.distinctValues(handle, col, limit);
    const kinds = column.takeKinds();
    const numbers = column.takeNumbers();
    // Every text in one string, decoded once, then sliced by UTF-16 length.
    const text = column.takeTextJoined();
    const text_lengths = column.takeTextLengths();
    const styles = column.takeStyles();
    const counts = column.takeCounts();
    column.free();

    const out: CellScalar[] = new Array(kinds.length);
    let number_at = 0;
    let text_index = 0;
    let text_offset = 0;

    for (let i = 0; i < kinds.length; i++) {
      if (kinds[i] === KIND_NUMBER) out[i] = numbers[number_at++] ?? null;
      else if (kinds[i] === KIND_STRING) {
        const end = text_offset + (text_lengths[text_index++] ?? 0);
        out[i] = text.slice(text_offset, end);
        text_offset = end;
      } else if (kinds[i] === KIND_BOOL) out[i] = (numbers[number_at++] ?? 0) !== 0;
      else out[i] = null;
    }

    return { values: out, styles, counts };
  }

  /** The data rows of `sheet` that every filter in `filters` keeps, ascending. */
  filteredRows(sheet: SheetId, filters: ReadonlyMap<number, ColumnFilter>): Uint32Array {
    return this.run_filters(this.sheets.handleOf(sheet), filters);
  }

  private recompute(sheet: SheetId): void {
    const state = this.state_by_sheet.get(sheet);
    const hidden = state ? this.hidden_row_set(state) : null;
    const meta = this.sheets.sheetMeta(sheet);
    const row_count = meta.rowCount;

    if (
      state === undefined ||
      (state.sortKeys.length === 0 && state.filters.size === 0 && !hidden)
    ) {
      this.engine_hidden_rows.viewChanged(sheet, null, row_count);
      this.drop_order(sheet);
      return;
    }

    const has_sort = state.sortKeys.length > 0;
    const handle = this.sheets.handleOf(sheet);
    let survivors: Uint32Array | null =
      state.filters.size > 0
        ? keepOutsideAutoFilter(this.run_filters(handle, state.filters), meta.autoFilter, row_count)
        : null;
    this.engine_hidden_rows.viewChanged(sheet, survivors, row_count);

    if (hidden) {
      if (survivors) {
        survivors = survivors.filter((row) => !hidden.has(row));
      } else {
        const kept: number[] = [];
        for (let row = 0; row < row_count; row++) if (!hidden.has(row)) kept.push(row);
        survivors = Uint32Array.from(kept);
      }
    }

    if (survivors && survivors.length === 0) {
      this.set_order(sheet, EMPTY_U32);
      return;
    }

    if (!has_sort) {
      this.set_order(sheet, survivors ?? EMPTY_U32);
      return;
    }

    const cols = new Uint32Array(state.sortKeys.length);
    const ascending = new Uint8Array(state.sortKeys.length);

    for (const [i, key] of state.sortKeys.entries()) {
      cols[i] = key.col;
      ascending[i] = key.ascending ? 1 : 0;
    }

    this.set_order(sheet, this.wasm.sortRowsMulti(handle, cols, ascending, survivors ?? EMPTY_U32));
  }

  private run_filters(handle: number, filters: ReadonlyMap<number, ColumnFilter>): Uint32Array {
    if (filters.size === 1) {
      const [entry] = filters;
      const [col, filter] = entry!;
      if (filter.kind === "contains" && !filter.matchCase) {
        return this.wasm.filterRows(handle, col, filter.text);
      }
    }

    const count = filters.size;
    const cols = new Uint32Array(count);
    const kinds = new Uint8Array(count);
    const flags = new Uint8Array(count);
    const nums = new Float64Array(count);
    const num_counts = new Uint32Array(count);
    const text_counts = new Uint32Array(count);
    const value_nums: number[] = [];
    const value_texts: string[] = [];

    let i = 0;
    for (const [col, filter] of filters) {
      cols[i] = col;
      switch (filter.kind) {
        case "values": {
          kinds[i] = 0;
          let includes_null = false;
          let number_count = 0;
          let text_count = 0;
          for (const value of filter.values) {
            if (value === null) includes_null = true;
            else if (typeof value === "number") {
              value_nums.push(value);
              number_count++;
            } else if (typeof value === "boolean") {
              value_texts.push(value ? "\0TRUE" : "\0FALSE");
              text_count++;
            } else {
              value_texts.push(value);
              text_count++;
            }
          }

          num_counts[i] = number_count;
          text_counts[i] = text_count;
          flags[i] = includes_null ? 1 : 0;
          break;
        }
        case "contains":
          kinds[i] = 1;
          flags[i] = filter.matchCase ? 1 : 0;
          text_counts[i] = 1;
          value_texts.push(filter.text);
          break;
        case "compare":
          kinds[i] = 2;
          flags[i] = COMPARE_OP[filter.op];
          nums[i] = filter.value;
          break;
        case "empty":
          kinds[i] = 3;
          break;
        case "nonEmpty":
          kinds[i] = 4;
          break;
        case "custom":
          kinds[i] = 5;
          flags[i] = filter.join === "or" ? 1 : 0;
          text_counts[i] = filter.conditions.length;
          for (const condition of filter.conditions)
            value_texts.push(conditionCriterion(condition));
          break;
        case "dynamic": {
          // Relative spans compare serials; periods match months in Rust.
          const span = dynamicDateSpan(filter.type, new Date());
          if ("months" in span) {
            kinds[i] = 6;
            num_counts[i] = span.months.length;
            value_nums.push(...span.months);
          } else {
            kinds[i] = 5;
            text_counts[i] = 2;
            value_texts.push(`>=${span.start}`, `<${span.end}`);
          }
          break;
        }
      }

      i++;
    }

    return this.wasm.filterRowsMulti(
      handle,
      cols,
      kinds,
      flags,
      nums,
      num_counts,
      text_counts,
      Float64Array.from(value_nums),
      value_texts,
    );
  }

  private hidden_row_set(state: ViewState): ReadonlySet<number> | null {
    let has_collapsed = false;
    for (const group of state.groups) {
      if (group.collapsed) {
        has_collapsed = true;
        break;
      }
    }

    if (!has_collapsed) return state.hiddenRows.size > 0 ? state.hiddenRows : null;

    const hidden = new Set<number>(state.hiddenRows);
    for (const group of state.groups) {
      if (!group.collapsed) continue;
      for (let row = group.start; row <= group.end; row++) hidden.add(row);
    }

    return hidden.size > 0 ? hidden : null;
  }

  private ensure_state(sheet: SheetId): ViewState {
    let state = this.state_by_sheet.get(sheet);
    if (!state) {
      const meta = this.sheets.sheetMeta(sheet);
      state = {
        sortKeys: meta.sortKeys?.map((key) => ({ ...key })) ?? [],
        filters: new Map(meta.filters?.map(([col, filter]) => [col, cloneJsonValue(filter)]) ?? []),
        hiddenRows: new Set(meta.hiddenRows ?? []),
        groups: meta.rowGroups?.map((group) => ({ ...group })) ?? [],
      };
      this.state_by_sheet.set(sheet, state);
    }

    return state;
  }

  private rebuild_row_index(
    sheet: SheetId,
    order: Uint32Array,
    logical_rows: number,
    reusable: PackedRowIndex | undefined,
  ): PackedRowIndex {
    if (logical_rows > ABSENT_VIEW_ROW || order.length > ABSENT_VIEW_ROW) {
      throw new SheetwriteError(
        "resource-limit",
        "store",
        `sheet ${sheet} exceeds the packed inverse row limit of ${ABSENT_VIEW_ROW}`,
        { context: { sheet, limit: ABSENT_VIEW_ROW } },
      );
    }

    const shape = packed_index_shape(logical_rows, order.length);
    let index = reusable;
    if (!index || index.kind !== shape.kind || index.storage.length !== shape.storageLength) {
      index = {
        kind: shape.kind,
        storage: shape.storageLength === 0 ? EMPTY_U32 : new Uint32Array(shape.storageLength),
        logicalRows: logical_rows,
        valid: false,
      };
      this.row_index_by_sheet.set(sheet, index);
    } else {
      index.logicalRows = logical_rows;
    }

    if (index.kind === "empty") {
      index.valid = true;
      return index;
    }

    index.storage.fill(ABSENT_VIEW_ROW);
    if (index.kind === "dense") {
      for (let view_row = 0; view_row < order.length; view_row++) {
        const data_row = order[view_row]!;
        if (data_row >= logical_rows) {
          throw new RangeError(
            `view order for sheet ${sheet} contains out-of-bounds data row ${data_row}`,
          );
        }

        if (index.storage[data_row] !== ABSENT_VIEW_ROW) {
          throw new RangeError(
            `view order for sheet ${sheet} contains duplicate data row ${data_row}`,
          );
        }

        index.storage[data_row] = view_row;
      }
    } else {
      const capacity = index.storage.length / 2;
      const mask = capacity - 1;
      for (let view_row = 0; view_row < order.length; view_row++) {
        const data_row = order[view_row]!;
        if (data_row >= logical_rows) {
          throw new RangeError(
            `view order for sheet ${sheet} contains out-of-bounds data row ${data_row}`,
          );
        }

        let slot = hash_data_row(data_row) & mask;
        for (;;) {
          const at = slot * 2;
          const stored_data_row = index.storage[at]!;
          if (stored_data_row === data_row) {
            throw new RangeError(
              `view order for sheet ${sheet} contains duplicate data row ${data_row}`,
            );
          }

          if (stored_data_row === ABSENT_VIEW_ROW) {
            index.storage[at] = data_row;
            index.storage[at + 1] = view_row;
            break;
          }

          slot = (slot + 1) & mask;
        }
      }
    }

    index.valid = true;
    return index;
  }

  private set_order(sheet: SheetId, order: Uint32Array): void {
    this.order_by_sheet.set(sheet, order);
    const index = this.row_index_by_sheet.get(sheet);
    if (!index) return;

    const shape = packed_index_shape(this.sheets.sheetMeta(sheet).rowCount, order.length);
    if (index.kind !== shape.kind || index.storage.length !== shape.storageLength) {
      this.row_index_by_sheet.delete(sheet);
    } else {
      index.valid = false;
    }
  }

  private drop_order(sheet: SheetId): void {
    this.order_by_sheet.delete(sheet);
    this.row_index_by_sheet.delete(sheet);
  }
}
