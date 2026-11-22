import type { SourceSnapshot, WindowView } from "@sheetwrite/wasm";

import { MAX_CONDITIONAL_FORMAT_RULES } from "../conditional-format.js";
import type { StyleDictionary } from "../style-dictionary.js";
import type { CellScalar, CellStyle, ConditionalFormatRule } from "../types/cell.js";
import type { SheetId } from "../types/coordinates.js";
import type { ResourceOwnerBytes, VisibleWindowView } from "../types/store.js";
import { utf8ByteLength } from "../utf8.js";
import { pivotStatusAt } from "./pivot-status.js";
import type { SheetRegistry } from "./sheet-registry.js";
import type { RecomputingCellStore } from "./wasm-contract.js";
import {
  KIND_BOOL,
  KIND_EMPTY,
  KIND_NUMBER,
  KIND_STRING,
  NO_STRING,
  CONDITIONAL_GREATER_THAN,
  CONDITIONAL_LESS_THAN,
  CONDITIONAL_EQUAL_NUMBER,
  CONDITIONAL_EQUAL_STRING,
  CONDITIONAL_EQUAL_EMPTY,
  CONDITIONAL_CONTAINS,
  CONDITIONAL_FORMULA,
  CONDITIONAL_MATCH_CASE,
  CONDITIONAL_STOP_IF_TRUE,
  CONDITIONAL_HAS_RULES,
  CONDITIONAL_RULES_UPDATED,
} from "./wire-tags.js";

const EMPTY_COND_MATCHES = new Uint32Array(0);
const EMPTY_PIN_COLUMNS = new Uint32Array(0);
// Kept independent from the worker cache cap so each thread can be tuned separately.
const STRING_CACHE_CAP = 65_536;
const WINDOW_SCRATCH_MAX_REUSE = 65_536;
const UTF8_DECODER = new TextDecoder();
const DEFAULT_HYPERLINK_STYLE: CellStyle = { color: "#0563C1", underline: true };

const WINDOW_PACKED_MAGIC = 0x3157_4e53;
const WINDOW_PACKED_VERSION = 1;
const WINDOW_PACKED_HEADER_BYTES = 10 * Uint32Array.BYTES_PER_ELEMENT;

export interface DecodedPackedWindow {
  readonly nRows: number;
  readonly nCols: number;
  readonly kinds: Uint8Array;
  readonly numbers: Float64Array;
  readonly stringIds: Uint32Array;
  readonly stringIndex: Int32Array;
  readonly styleIds: Uint32Array;
  readonly styleDict: Uint32Array;
  readonly condMatches: Uint32Array;
  readonly localStringCount: number;
}

/** Resolved values of one rectangle plus its style dictionary, row-major. */
export interface RectangleSnapshot {
  /** Resolved scalar per cell; `null` for empty cells. */
  readonly values: readonly CellScalar[];
  /** Style dictionary slot per cell; index into {@link styles}. */
  readonly styleIds: Uint32Array;
  /** Style dictionary shared by every cell of the rectangle. */
  readonly styles: readonly CellStyle[];
}

/** Validates the internal packed layout before exposing zero-copy owned-buffer views. */
export function decodePackedWindow(packed: Uint8Array): DecodedPackedWindow {
  if (packed.byteLength < WINDOW_PACKED_HEADER_BYTES) {
    throw new Error("Sheetwrite: truncated packed window");
  }

  const header = new DataView(packed.buffer, packed.byteOffset, WINDOW_PACKED_HEADER_BYTES);
  const magic = header.getUint32(0, true);
  const version = header.getUint32(4, true);
  const header_bytes = header.getUint32(8, true);
  const total_bytes = header.getUint32(12, true);
  const n_rows = header.getUint32(16, true);
  const n_cols = header.getUint32(20, true);
  const cell_count = header.getUint32(24, true);
  const style_count = header.getUint32(28, true);
  const cond_count = header.getUint32(32, true);
  const local_string_count = header.getUint32(36, true);

  if (
    magic !== WINDOW_PACKED_MAGIC ||
    version !== WINDOW_PACKED_VERSION ||
    header_bytes !== WINDOW_PACKED_HEADER_BYTES
  ) {
    throw new Error("Sheetwrite: invalid packed window header");
  }

  if (total_bytes > packed.byteLength) {
    throw new Error("Sheetwrite: truncated packed window");
  }

  if (total_bytes !== packed.byteLength) {
    throw new Error("Sheetwrite: invalid packed window length");
  }

  const expected_cell_count = n_rows * n_cols;
  if (!Number.isSafeInteger(expected_cell_count) || expected_cell_count !== cell_count) {
    throw new Error("Sheetwrite: invalid packed window dimensions");
  }

  if (cond_count !== 0 && cond_count !== cell_count) {
    throw new Error("Sheetwrite: invalid packed conditional-match length");
  }

  const kinds_start = WINDOW_PACKED_HEADER_BYTES;
  const numbers_start = align_to8(checked_packed_end(kinds_start, cell_count));
  const string_ids_start = checked_packed_end(
    numbers_start,
    cell_count * Float64Array.BYTES_PER_ELEMENT,
  );
  const string_index_start = checked_packed_end(
    string_ids_start,
    cell_count * Uint32Array.BYTES_PER_ELEMENT,
  );
  const style_ids_start = checked_packed_end(
    string_index_start,
    cell_count * Int32Array.BYTES_PER_ELEMENT,
  );
  const style_dict_start = checked_packed_end(
    style_ids_start,
    cell_count * Uint32Array.BYTES_PER_ELEMENT,
  );
  const cond_matches_start = checked_packed_end(
    style_dict_start,
    style_count * Uint32Array.BYTES_PER_ELEMENT,
  );
  const expected_bytes = checked_packed_end(
    cond_matches_start,
    cond_count * Uint32Array.BYTES_PER_ELEMENT,
  );

  if (expected_bytes !== total_bytes) {
    throw new Error("Sheetwrite: invalid packed window layout");
  }

  const base = packed.byteOffset;
  if (
    (base + numbers_start) % Float64Array.BYTES_PER_ELEMENT !== 0 ||
    (base + string_ids_start) % Uint32Array.BYTES_PER_ELEMENT !== 0
  ) {
    throw new Error("Sheetwrite: invalid packed window alignment");
  }

  return {
    nRows: n_rows,
    nCols: n_cols,
    kinds: new Uint8Array(packed.buffer, base + kinds_start, cell_count),
    numbers: new Float64Array(packed.buffer, base + numbers_start, cell_count),
    stringIds: new Uint32Array(packed.buffer, base + string_ids_start, cell_count),
    stringIndex: new Int32Array(packed.buffer, base + string_index_start, cell_count),
    styleIds: new Uint32Array(packed.buffer, base + style_ids_start, cell_count),
    styleDict: new Uint32Array(packed.buffer, base + style_dict_start, style_count),
    condMatches: new Uint32Array(packed.buffer, base + cond_matches_start, cond_count),
    localStringCount: local_string_count,
  };
}

function checked_packed_end(start: number, byte_length: number): number {
  const end = start + byte_length;
  if (!Number.isSafeInteger(end) || start < 0 || byte_length < 0) {
    throw new Error("Sheetwrite: invalid packed window layout");
  }
  return end;
}

function align_to8(value: number): number {
  return Math.ceil(value / Float64Array.BYTES_PER_ELEMENT) * Float64Array.BYTES_PER_ELEMENT;
}

export interface PersistedCellView {
  readonly coordinates: Uint32Array;
  readonly values: readonly CellScalar[];
  readonly styles: readonly CellStyle[];
  readonly formulaOffsets: Uint32Array;
  readonly formulaSources: readonly string[];
  readonly referenceOffsets: Uint32Array;
  readonly referenceTargets: Uint32Array;
}

/** Exact internal diagnostics attached to each decoded visible-window read. */
interface VisibleWindowResourceMetrics {
  readonly ffiCalls: number;
  readonly ffiBoundaryCalls: number;
  readonly ffiInputBytes: number;
  readonly ffiOutputBytes: number;
  readonly ffiLargestTransferBytes: number;
  /** Fresh JS-owned packed-buffer allocation plus an optional local-string array. */
  readonly ffiOutputAllocationEvents: number;
}

export type InstrumentedVisibleWindowView = VisibleWindowView & VisibleWindowResourceMetrics;

/** Owns packed-window decoding, caches, and reusable viewport scratch. */
export class StoreWindowReader {
  private readonly cols_u32_cache = new WeakMap<ReadonlyArray<number>, Uint32Array>();
  private values_scratch: CellScalar[] = [];
  private readonly string_cache = new Map<number, string>();
  private string_pool_epoch: number | undefined;
  private visible_string_pool_epoch: number | undefined;
  private readonly cond_rules_synced = new Map<SheetId, string>();
  private conditional_rule_input_bytes = 0;
  private conditional_rule_largest_input_bytes = 0;

  constructor(
    private wasm: RecomputingCellStore,
    private readonly sheets: SheetRegistry,
    private readonly styles: StyleDictionary,
  ) {}

  replaceEngine(wasm: RecomputingCellStore): void {
    this.clear();
    this.wasm = wasm;
  }

  spillDerivedMask(
    sheet: SheetId,
    rows: { start: number; end: number },
    cols: readonly number[],
  ): Uint8Array {
    return this.wasm.spillDerivedMask(
      this.sheets.handleOf(sheet),
      rows.start,
      rows.end,
      this.cols_u32_for(cols),
    );
  }

  captureSourcesForRows(
    sheet: SheetId,
    rows: Uint32Array,
    cols: readonly number[],
  ): SourceSnapshot | undefined {
    if (rows.length === 0 || cols.length === 0) return undefined;
    return this.wasm.captureSourcesForRows(
      this.sheets.handleOf(sheet),
      rows,
      this.cols_u32_for(cols),
    );
  }

  capturePersistedCells(sheet: SheetId): PersistedCellView {
    const string_pool_epoch = this.wasm.stringPoolEpoch();
    const packed = this.wasm.persistedCellData(this.sheets.handleOf(sheet));
    const coordinates: number[] = [];
    const values: CellScalar[] = [];
    const styles: CellStyle[] = [];
    const formula_offsets: number[] = [];
    const formula_sources: string[] = [];
    const reference_offsets: number[] = [];
    const reference_targets: number[] = [];
    const string_ids: number[] = [];
    const string_offsets: number[] = [];
    let cursor = 0;

    while (cursor < packed.length) {
      if (packed.length - cursor < 8) {
        throw new Error("Sheetwrite: truncated persisted-cell projection");
      }

      const row = packed[cursor++]!;
      const col = packed[cursor++]!;
      const kind = packed[cursor++]!;
      const number = packed[cursor++]!;
      const style_id = packed[cursor++]!;
      const string_id = packed[cursor++]!;
      const source_kind = packed[cursor++]!;
      const source_length = packed[cursor++]!;

      if (
        !Number.isSafeInteger(row) ||
        row < 0 ||
        !Number.isSafeInteger(col) ||
        col < 0 ||
        !Number.isSafeInteger(kind) ||
        kind < 0 ||
        !Number.isSafeInteger(style_id) ||
        style_id < 0 ||
        !Number.isSafeInteger(source_kind) ||
        !Number.isSafeInteger(source_length) ||
        source_length < 0
      ) {
        throw new Error("Sheetwrite: invalid persisted-cell projection");
      }

      const offset = values.length;
      coordinates.push(row, col);
      values.push(kind === KIND_NUMBER ? number : kind === KIND_BOOL ? number !== 0 : null);
      styles.push(this.styles.get(style_id));

      if (kind === KIND_STRING && string_id >= 0) {
        if (!Number.isSafeInteger(string_id)) {
          throw new Error("Sheetwrite: invalid persisted string id");
        }

        string_ids.push(string_id);
        string_offsets.push(offset);
      }

      if (source_kind === 1) {
        const word_count = Math.ceil(source_length / 4);
        if (cursor + word_count > packed.length) {
          throw new Error("Sheetwrite: truncated persisted formula source");
        }

        const bytes = new Uint8Array(source_length);
        for (let word_index = 0; word_index < word_count; word_index++) {
          const word = packed[cursor++]!;
          if (!Number.isSafeInteger(word) || word < 0 || word > 0xffff_ffff) {
            throw new Error("Sheetwrite: invalid persisted formula source");
          }

          for (let byte = 0; byte < 4; byte++) {
            const byte_index = word_index * 4 + byte;
            if (byte_index < bytes.length) bytes[byte_index] = (word >>> (byte * 8)) & 0xff;
          }
        }

        formula_offsets.push(offset);
        formula_sources.push(UTF8_DECODER.decode(bytes));
      } else if (source_kind === 2) {
        if (source_length !== 3 || cursor + 3 > packed.length) {
          throw new Error("Sheetwrite: invalid persisted reference source");
        }

        const target_sheet = packed[cursor++]!;
        const target_row = packed[cursor++]!;
        const target_col = packed[cursor++]!;
        if (
          !Number.isSafeInteger(target_sheet) ||
          target_sheet < 0 ||
          !Number.isSafeInteger(target_row) ||
          target_row < 0 ||
          !Number.isSafeInteger(target_col) ||
          target_col < 0
        ) {
          throw new Error("Sheetwrite: invalid persisted reference target");
        }

        reference_offsets.push(offset);
        reference_targets.push(target_sheet, target_row, target_col);
      } else if (source_kind !== 0 || source_length !== 0) {
        throw new Error("Sheetwrite: invalid persisted source kind");
      }
    }

    this.sync_string_pool_epoch(string_pool_epoch);
    if (string_ids.length > 0) {
      const texts = this.wasm.poolStrings(Uint32Array.from(string_ids));
      if (texts.length !== string_offsets.length) {
        throw new Error("Sheetwrite: invalid persisted string projection");
      }

      for (let index = 0; index < texts.length; index++) {
        values[string_offsets[index]!] = texts[index] ?? null;
      }
    }

    return {
      coordinates: Uint32Array.from(coordinates),
      values,
      styles,
      formulaOffsets: Uint32Array.from(formula_offsets),
      formulaSources: formula_sources,
      referenceOffsets: Uint32Array.from(reference_offsets),
      referenceTargets: Uint32Array.from(reference_targets),
    };
  }

  read(
    sheet: SheetId,
    rows: { start: number; end: number },
    cols: readonly number[],
    order: Uint32Array | undefined,
    applyConditionalRules: boolean,
  ): InstrumentedVisibleWindowView {
    const handle = this.sheets.handleOf(sheet);
    const is_paged = this.wasm.isPaged(handle);

    try {
      return this.read_pinned(sheet, rows, cols, order, applyConditionalRules, is_paged);
    } finally {
      if (is_paged) {
        this.wasm.pinReadWindow(handle, 0, 0, EMPTY_PIN_COLUMNS, EMPTY_PIN_COLUMNS);
      }
    }
  }

  private read_pinned(
    sheet: SheetId,
    rows: { start: number; end: number },
    cols: readonly number[],
    order: Uint32Array | undefined,
    apply_conditional_rules: boolean,
    is_paged: boolean,
  ): InstrumentedVisibleWindowView {
    const handle = this.sheets.handleOf(sheet);
    const cols_u32 = this.cols_u32_for(cols);
    const data_rows = order?.subarray(rows.start, Math.min(rows.end, order.length));
    let ffi_calls = 1;
    let ffi_input_bytes = cols_u32.byteLength;
    let ffi_largest_transfer_bytes = cols_u32.byteLength;

    if (is_paged) {
      this.wasm.pinReadWindow(
        handle,
        data_rows ? 0 : rows.start,
        data_rows ? 0 : rows.end,
        data_rows ?? EMPTY_PIN_COLUMNS,
        cols_u32,
      );
      ffi_calls += 2;
      ffi_input_bytes += cols_u32.byteLength;
      ffi_input_bytes += data_rows?.byteLength ?? 0;
      ffi_largest_transfer_bytes = Math.max(ffi_largest_transfer_bytes, data_rows?.byteLength ?? 0);
    }

    const conditional_sync = apply_conditional_rules
      ? this.sync_conditional_rules(sheet, handle)
      : 0;
    const has_cond_rules = (conditional_sync & CONDITIONAL_HAS_RULES) !== 0;

    if ((conditional_sync & CONDITIONAL_RULES_UPDATED) !== 0) {
      ffi_calls += 1;
      ffi_input_bytes += this.conditional_rule_input_bytes;
      ffi_largest_transfer_bytes = Math.max(
        ffi_largest_transfer_bytes,
        this.conditional_rule_largest_input_bytes,
      );
    }

    let view: WindowView;
    let expected_rows: number;

    if (data_rows) {
      expected_rows = data_rows.length;
      ffi_input_bytes += data_rows.byteLength;
      ffi_largest_transfer_bytes = Math.max(ffi_largest_transfer_bytes, data_rows.byteLength);
      view = this.wasm.getWindowRows(handle, data_rows, cols_u32);
    } else {
      expected_rows = Math.max(0, rows.end - rows.start);
      view = this.wasm.getWindow(handle, rows.start, rows.end, cols_u32);
    }

    ffi_calls += 1;

    let packed: Uint8Array;
    let decoded: DecodedPackedWindow;
    let strings: string[];
    let string_pool_epoch: number;

    try {
      string_pool_epoch = view.stringPoolEpoch();
      packed = view.takePacked();
      decoded = decodePackedWindow(packed);

      if (
        decoded.nCols !== cols_u32.length ||
        decoded.nRows > expected_rows ||
        (order !== undefined && decoded.nRows !== expected_rows) ||
        (has_cond_rules &&
          decoded.kinds.length > 0 &&
          decoded.condMatches.length !== decoded.kinds.length)
      ) {
        throw new Error("Sheetwrite: invalid packed window shape");
      }

      strings = decoded.localStringCount === 0 ? [] : view.takeStrings();
      if (strings.length !== decoded.localStringCount) {
        throw new Error("Sheetwrite: invalid packed window strings");
      }

      for (let index = 0; index < decoded.kinds.length; index++) {
        const kind = decoded.kinds[index];
        const local = decoded.stringIndex[index]!;
        const pool = decoded.stringIds[index]!;

        if (
          (kind !== KIND_EMPTY &&
            kind !== KIND_NUMBER &&
            kind !== KIND_STRING &&
            kind !== KIND_BOOL) ||
          local < -1 ||
          local >= strings.length ||
          (local >= 0 && (kind !== KIND_STRING || pool !== NO_STRING)) ||
          (kind === KIND_STRING && pool === NO_STRING && local < 0)
        ) {
          throw new Error("Sheetwrite: invalid packed window value");
        }
      }
    } finally {
      view.free();
    }

    const {
      kinds,
      numbers,
      stringIds: string_ids,
      stringIndex: string_index,
      styleIds: style_ids,
      styleDict: style_dict,
    } = decoded;
    this.sync_string_pool_epoch(string_pool_epoch);

    // Rectangle/history reads may have warmed the host cache without updating the worker.
    if (this.visible_string_pool_epoch !== string_pool_epoch) {
      this.string_cache.clear();
      this.visible_string_pool_epoch = string_pool_epoch;
    }

    const cond_matches = has_cond_rules ? decoded.condMatches : EMPTY_COND_MATCHES;
    const string_output_allocation_events = decoded.localStringCount === 0 ? 0 : 1;
    let ffi_boundary_calls = ffi_calls + 3 + string_output_allocation_events;
    let local_string_bytes = 0;
    for (const value of strings) local_string_bytes += utf8ByteLength(value);

    let ffi_output_bytes = packed.byteLength + local_string_bytes;
    const ffi_output_allocation_events = 1 + string_output_allocation_events;
    ffi_largest_transfer_bytes = Math.max(
      ffi_largest_transfer_bytes,
      packed.byteLength,
      local_string_bytes,
    );

    let string_pool_update_ids: Uint32Array | undefined;
    let string_pool_update_values: string[] | undefined;
    let missing_id_set: Set<number> | null = null;
    if (this.string_cache.size >= STRING_CACHE_CAP) this.string_cache.clear();

    for (let i = 0; i < string_ids.length; i++) {
      const id = string_ids[i];
      if (id !== undefined && id !== NO_STRING && !this.string_cache.has(id)) {
        if (!missing_id_set) missing_id_set = new Set<number>();
        missing_id_set.add(id);
      }
    }

    if (missing_id_set) {
      string_pool_update_ids = Uint32Array.from(missing_id_set);
      string_pool_update_values = this.wasm.poolStrings(string_pool_update_ids);
      ffi_calls += 1;
      ffi_boundary_calls += 1;
      ffi_input_bytes += string_pool_update_ids.byteLength;
      let pool_string_bytes = 0;
      for (const value of string_pool_update_values) pool_string_bytes += utf8ByteLength(value);

      ffi_output_bytes += pool_string_bytes;
      ffi_largest_transfer_bytes = Math.max(
        ffi_largest_transfer_bytes,
        string_pool_update_ids.byteLength,
        pool_string_bytes,
      );

      for (let i = 0; i < string_pool_update_values.length; i++) {
        this.string_cache.set(
          string_pool_update_ids[i] ?? NO_STRING,
          string_pool_update_values[i] ?? "",
        );
      }
    }

    const values = this.values_for(kinds.length);

    for (let i = 0; i < kinds.length; i++) {
      if (kinds[i] === KIND_NUMBER) {
        values[i] = numbers[i] ?? null;
      } else if (kinds[i] === KIND_BOOL) {
        values[i] = (numbers[i] ?? 0) !== 0;
      } else if (kinds[i] === KIND_STRING) {
        const pool_id = string_ids[i] ?? NO_STRING;

        if (pool_id !== NO_STRING) {
          values[i] = this.string_cache.get(pool_id) ?? null;
        } else {
          const string_slot = string_index[i] ?? -1;
          values[i] = string_slot >= 0 ? (strings[string_slot] ?? null) : null;
        }
      } else {
        values[i] = null;
      }
    }

    const window_styles = this.styles_from(style_dict);
    const overlay = { rows, cols, order, styleIds: style_ids, styles: window_styles };
    this.merge_hyperlink_styles(overlay, sheet);
    this.merge_pivot_formats(overlay, sheet);

    if (cond_matches.length > 0) {
      this.merge_cond_matches(sheet, cond_matches, style_ids, window_styles);
    }

    return {
      sheet,
      rows: { start: rows.start, end: rows.end },
      cols,
      values,
      styleIds: style_ids,
      styles: window_styles,
      valueKinds: kinds,
      numberValues: numbers,
      stringPoolEpoch: string_pool_epoch,
      stringPoolIds: string_ids,
      stringLocalIds: string_index,
      stringPoolUpdateIds: string_pool_update_ids,
      stringPoolUpdateValues: string_pool_update_values,
      localStrings: strings,
      ffiInputBytes: ffi_input_bytes,
      ffiOutputBytes: ffi_output_bytes,
      ffiLargestTransferBytes: ffi_largest_transfer_bytes,
      ffiBoundaryCalls: ffi_boundary_calls,
      ffiOutputAllocationEvents: ffi_output_allocation_events,
      ffiCalls: ffi_calls,
    };
  }

  conditionalRulesChanged(sheet: SheetId): void {
    this.cond_rules_synced.delete(sheet);
    this.sync_conditional_rules(sheet, this.sheets.handleOf(sheet));
  }

  /**
   * Previous values and styles of one rectangle, row-major, in one packed read.
   *
   * This is the change-capture view of a rectangle: it replaces a `getCell` per
   * cell. It is not a viewport read — it never pins paged rows and never merges
   * hyperlink or conditional styles — so every entry is exactly what `getCell`
   * returns for the same cell.
   */
  readRectangle(
    sheet: SheetId,
    startRow: number,
    rows: number,
    cols: readonly number[],
  ): RectangleSnapshot {
    const view = this.wasm.getWindow(
      this.sheets.handleOf(sheet),
      startRow,
      startRow + rows,
      this.cols_u32_for(cols),
    );
    let decoded: DecodedPackedWindow;
    let strings: string[];
    let string_pool_epoch: number;
    try {
      string_pool_epoch = view.stringPoolEpoch();
      decoded = decodePackedWindow(view.takePacked());
      if (decoded.nCols !== cols.length || decoded.nRows !== rows) {
        throw new Error("Sheetwrite: invalid packed window shape");
      }

      strings = decoded.localStringCount === 0 ? [] : view.takeStrings();
      if (strings.length !== decoded.localStringCount) {
        throw new Error("Sheetwrite: invalid packed window strings");
      }

      for (let index = 0; index < decoded.kinds.length; index++) {
        const kind = decoded.kinds[index];
        const local = decoded.stringIndex[index] ?? -1;
        const pool = decoded.stringIds[index] ?? NO_STRING;
        if (
          (kind !== KIND_EMPTY &&
            kind !== KIND_NUMBER &&
            kind !== KIND_STRING &&
            kind !== KIND_BOOL) ||
          local < -1 ||
          local >= strings.length ||
          (local >= 0 && (kind !== KIND_STRING || pool !== NO_STRING)) ||
          (kind === KIND_STRING && pool === NO_STRING && local < 0)
        ) {
          throw new Error("Sheetwrite: invalid packed window value");
        }
      }
    } finally {
      view.free();
    }

    const {
      kinds,
      numbers,
      stringIds: string_ids,
      stringIndex: string_index,
      styleIds: style_ids,
      styleDict: style_dict,
    } = decoded;
    this.sync_string_pool_epoch(string_pool_epoch);
    if (this.string_cache.size >= STRING_CACHE_CAP) this.string_cache.clear();
    let missing_id_set: Set<number> | null = null;
    for (let index = 0; index < string_ids.length; index++) {
      const id = string_ids[index];
      if (id !== undefined && id !== NO_STRING && !this.string_cache.has(id)) {
        if (!missing_id_set) missing_id_set = new Set<number>();
        missing_id_set.add(id);
      }
    }

    if (missing_id_set) {
      const missing_ids = Uint32Array.from(missing_id_set);
      const resolved = this.wasm.poolStrings(missing_ids);
      for (let index = 0; index < resolved.length; index++) {
        this.string_cache.set(missing_ids[index] ?? NO_STRING, resolved[index] ?? "");
      }
    }

    const values = new Array<CellScalar>(kinds.length);
    for (let index = 0; index < kinds.length; index++) {
      const kind = kinds[index];
      if (kind === KIND_NUMBER) {
        values[index] = numbers[index] ?? null;
      } else if (kind === KIND_BOOL) {
        values[index] = (numbers[index] ?? 0) !== 0;
      } else if (kind === KIND_STRING) {
        const pool_id = string_ids[index] ?? NO_STRING;
        values[index] =
          pool_id !== NO_STRING
            ? (this.string_cache.get(pool_id) ?? null)
            : (strings[string_index[index] ?? -1] ?? null);
      } else {
        values[index] = null;
      }
    }

    return { values, styleIds: style_ids, styles: this.styles_from(style_dict) };
  }

  resourceOwners(): ResourceOwnerBytes[] {
    let cached_string_bytes = 0;
    for (const value of this.string_cache.values()) cached_string_bytes += value.length * 2;
    let conditional_signature_bytes = 0;
    for (const value of this.cond_rules_synced.values())
      conditional_signature_bytes += value.length * 2;
    return [
      {
        owner: "js.window.values-scratch",
        logicalBytes: 0,
        allocatedBytes: 0,
        entries: this.values_scratch.length,
        measurement: "entry-count-only",
      },
      {
        owner: "js.window.string-cache",
        logicalBytes: cached_string_bytes,
        allocatedBytes: cached_string_bytes,
        entries: this.string_cache.size,
        measurement: "utf16-upper-bound",
      },
      {
        owner: "js.window.conditional-signatures",
        logicalBytes: conditional_signature_bytes,
        allocatedBytes: conditional_signature_bytes,
        entries: this.cond_rules_synced.size,
        measurement: "utf16-upper-bound",
      },
    ];
  }

  clear(): void {
    this.values_scratch = [];
    this.string_cache.clear();
    this.string_pool_epoch = undefined;
    this.visible_string_pool_epoch = undefined;
    this.cond_rules_synced.clear();
  }

  /**
   * Drop the decoded pool strings and the value scratch. The next read decodes
   * its strings again and lists all of them as pool updates, so a worker that
   * dropped its own string cache gets every string it paints.
   */
  trim(): void {
    this.values_scratch = [];
    this.string_cache.clear();
  }

  removeSheet(sheet: SheetId): void {
    this.cond_rules_synced.delete(sheet);
  }

  private sync_string_pool_epoch(epoch: number): void {
    if (epoch !== this.string_pool_epoch) {
      this.string_cache.clear();
      this.string_pool_epoch = epoch;
    }
  }

  private cols_u32_for(cols: readonly number[]): Uint32Array {
    const cached = this.cols_u32_cache.get(cols);
    if (cached && cached.length === cols.length) {
      let same_columns = true;
      for (let i = 0; i < cols.length; i++) {
        if (cached[i] !== cols[i]) {
          same_columns = false;
          break;
        }
      }
      if (same_columns) return cached;
    }

    const fresh = Uint32Array.from(cols);
    this.cols_u32_cache.set(cols, fresh);
    return fresh;
  }

  private values_for(cell_count: number): CellScalar[] {
    if (this.values_scratch.length !== cell_count) {
      this.values_scratch = new Array<CellScalar>(cell_count);
    }
    const values = this.values_scratch;
    if (cell_count > WINDOW_SCRATCH_MAX_REUSE) {
      this.values_scratch = [];
    }
    return values;
  }

  private styles_from(style_dict: Uint32Array): CellStyle[] {
    const styles: CellStyle[] = new Array(style_dict.length);
    for (let index = 0; index < style_dict.length; index++) {
      styles[index] = this.styles.get(style_dict[index]!);
    }
    return styles;
  }

  private sync_conditional_rules(sheet: SheetId, handle: number): number {
    const rules = this.sheets.sheetMeta(sheet).conditionalFormats ?? [];
    const packable = rules
      .filter((rule) => rule.range.sheet === sheet)
      .slice(0, MAX_CONDITIONAL_FORMAT_RULES);
    const signature = conditional_rules_signature(packable);
    if (this.cond_rules_synced.get(sheet) === signature) {
      this.conditional_rule_input_bytes = 0;
      this.conditional_rule_largest_input_bytes = 0;
      return packable.length > 0 ? CONDITIONAL_HAS_RULES : 0;
    }

    this.cond_rules_synced.set(sheet, signature);

    const kinds = new Uint8Array(packable.length);
    const bounds = new Uint32Array(packable.length * 4);
    const nums = new Float64Array(packable.length);
    const strs: string[] = new Array(packable.length).fill("");
    const flags = new Uint8Array(packable.length);

    for (let i = 0; i < packable.length; i++) {
      const rule = packable[i]!;
      bounds[i * 4] = Math.min(rule.range.start.row, rule.range.end.row);
      bounds[i * 4 + 1] = Math.min(rule.range.start.col, rule.range.end.col);
      bounds[i * 4 + 2] = Math.max(rule.range.start.row, rule.range.end.row);
      bounds[i * 4 + 3] = Math.max(rule.range.start.col, rule.range.end.col);

      const when = rule.when;
      if (when.kind === "greaterThan") {
        kinds[i] = CONDITIONAL_GREATER_THAN;
        nums[i] = when.value;
      } else if (when.kind === "lessThan") {
        kinds[i] = CONDITIONAL_LESS_THAN;
        nums[i] = when.value;
      } else if (when.kind === "equal") {
        if (typeof when.value === "number") {
          kinds[i] = CONDITIONAL_EQUAL_NUMBER;
          nums[i] = when.value;
        } else if (typeof when.value === "string") {
          kinds[i] = CONDITIONAL_EQUAL_STRING;
          strs[i] = when.value;
        } else {
          kinds[i] = CONDITIONAL_EQUAL_EMPTY;
        }
      } else if (when.kind === "contains") {
        kinds[i] = CONDITIONAL_CONTAINS;
        strs[i] = when.text;
        flags[i] = when.matchCase ? CONDITIONAL_MATCH_CASE : 0;
      } else {
        kinds[i] = CONDITIONAL_FORMULA;
        strs[i] = when.source;
      }

      if (rule.stopIfTrue) flags[i] = (flags[i] ?? 0) | CONDITIONAL_STOP_IF_TRUE;
    }

    const string_bytes = strs.reduce((bytes, value) => bytes + utf8ByteLength(value), 0);
    this.conditional_rule_input_bytes =
      kinds.byteLength + bounds.byteLength + nums.byteLength + flags.byteLength + string_bytes;
    this.conditional_rule_largest_input_bytes = Math.max(
      kinds.byteLength,
      bounds.byteLength,
      nums.byteLength,
      flags.byteLength,
      string_bytes,
    );
    this.wasm.setConditionalRules(handle, kinds, bounds, nums, strs, flags);
    return (packable.length > 0 ? CONDITIONAL_HAS_RULES : 0) | CONDITIONAL_RULES_UPDATED;
  }

  /**
   * The number format of each value field over its value cells, as Excel
   * applies Value Field Settings › Number Format. Value fields repeat across
   * each column group, so a data column's field is its offset modulo the
   * number of value fields. Header rows and label columns keep their style.
   */
  private merge_pivot_formats(window: StyleOverlayWindow, sheet: SheetId): void {
    const pivots = this.sheets.sheetMeta(sheet).pivots ?? [];
    const formatted = pivots.some((pivot) => pivot.values.some((value) => value.numberFormat));
    if (!formatted || !this.wasm.pivotStatus) return;

    const status = this.wasm.pivotStatus(this.sheets.handleOf(sheet));
    const merged = new Map<string, number>();
    pivots.forEach((pivot, index) => {
      const record = pivotStatusAt(status, index);
      const formats = pivot.values.map((value) => value.numberFormat);
      if (!record || record.error !== 0) return;
      const first_col = record.col + record.labelCols;
      overlay_rect(
        window,
        merged,
        [record.row + record.headerRows, first_col],
        [record.row + record.rows - 1, record.col + record.cols - 1],
        (col) => formats[(col - first_col) % formats.length],
        (base, number_format) => ({ ...base, numberFormat: number_format }),
      );
    });
  }

  private merge_hyperlink_styles(window: StyleOverlayWindow, sheet: SheetId): void {
    const merged = new Map<string, number>();
    for (const hyperlink of this.sheets.sheetMeta(sheet).hyperlinks ?? []) {
      if (hyperlink.range.sheet !== sheet) continue;
      const { start, end } = hyperlink.range;
      // A link without its own style still overlays the default link look.
      const key = JSON.stringify(hyperlink.style ?? null);
      overlay_rect(
        window,
        merged,
        [Math.min(start.row, end.row), Math.min(start.col, end.col)],
        [Math.max(start.row, end.row), Math.max(start.col, end.col)],
        () => key,
        // Native XLSX hyperlink fonts can live on the cell, not the link.
        // Defaults must not erase those explicit font properties.
        (base) => ({ ...DEFAULT_HYPERLINK_STYLE, ...base, ...hyperlink.style }),
      );
    }
  }

  private merge_cond_matches(
    sheet: SheetId,
    cond_matches: Uint32Array,
    style_ids: Uint32Array,
    styles: CellStyle[],
  ): void {
    const rules = (this.sheets.sheetMeta(sheet).conditionalFormats ?? []).filter(
      (rule) => rule.range.sheet === sheet,
    );
    const merged_ids = new Map<number, number>();

    for (let i = 0; i < cond_matches.length; i++) {
      const full_mask = cond_matches[i]!;
      if (full_mask === 0) continue;

      const base = style_ids[i]!;
      const combo_key = base * 0x1_0000_0000 + full_mask;
      let local = merged_ids.get(combo_key);
      if (local === undefined) {
        let merged = styles[base] ?? {};
        for (let bit = Math.min(rules.length, MAX_CONDITIONAL_FORMAT_RULES) - 1; bit >= 0; bit--) {
          if ((full_mask & (1 << bit)) !== 0) merged = { ...merged, ...rules[bit]?.style };
        }
        local = styles.length;
        styles.push(merged);
        merged_ids.set(combo_key, local);
      }
      style_ids[i] = local;
    }
  }
}

function conditional_rules_signature(rules: readonly ConditionalFormatRule[]): string {
  let signature = String(rules.length);
  for (const rule of rules) {
    const r0 = Math.min(rule.range.start.row, rule.range.end.row);
    const c0 = Math.min(rule.range.start.col, rule.range.end.col);
    const r1 = Math.max(rule.range.start.row, rule.range.end.row);
    const c1 = Math.max(rule.range.start.col, rule.range.end.col);
    signature += `|${r0},${c0},${r1},${c1}|stop:${rule.stopIfTrue ? 1 : 0}`;

    const when = rule.when;
    if (when.kind === "greaterThan" || when.kind === "lessThan") {
      signature += `|${when.kind}:${when.value}`;
    } else if (when.kind === "equal") {
      const value = when.value;
      signature +=
        typeof value === "string" ? `|equal:s${value.length}:${value}` : `|equal:${value}`;
    } else if (when.kind === "contains") {
      signature += `|contains:${when.matchCase ? 1 : 0}:${when.text.length}:${when.text}`;
    } else {
      signature += `|formula:${when.source.length}:${when.source}`;
    }
  }
  return signature;
}

/** The cells of one window read that per-window style overlays restyle. */
interface StyleOverlayWindow {
  readonly rows: { start: number; end: number };
  readonly cols: readonly number[];
  /** View row to data row, when a sort or filter view orders the rows. */
  readonly order: Uint32Array | undefined;
  readonly styleIds: Uint32Array;
  readonly styles: CellStyle[];
}

/**
 * Restyle the window cells inside the data rectangle `[first, last]` (row,
 * column). `key_at` names the overlay of a column, or undefined to skip it;
 * each base style and key becomes one merged style, shared through `merged`.
 */
function overlay_rect(
  window: StyleOverlayWindow,
  merged: Map<string, number>,
  first: readonly [row: number, col: number],
  last: readonly [row: number, col: number],
  key_at: (col: number) => string | undefined,
  style_for: (base: CellStyle | undefined, key: string) => CellStyle,
): void {
  const { rows, cols, order, styleIds: style_ids, styles } = window;
  if (cols.length === 0) return;
  const row_count = Math.min(rows.end - rows.start, Math.floor(style_ids.length / cols.length));
  for (let row_index = 0; row_index < row_count; row_index++) {
    const data_row = order?.[rows.start + row_index] ?? rows.start + row_index;
    if (data_row < first[0] || data_row > last[0]) continue;
    for (let col_index = 0; col_index < cols.length; col_index++) {
      const col = cols[col_index] ?? -1;
      const key = col < first[1] || col > last[1] ? undefined : key_at(col);
      if (key === undefined) continue;
      const offset = row_index * cols.length + col_index;
      const base = style_ids[offset] ?? 0;
      const id = `${base}:${key}`;
      let index = merged.get(id);
      if (index === undefined) {
        index = styles.length;
        styles.push(style_for(styles[base], key));
        merged.set(id, index);
      }
      style_ids[offset] = index;
    }
  }
}
