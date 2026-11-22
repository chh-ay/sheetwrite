import { consumeSourceSnapshot } from "../reference.js";
import type {
  BoundaryResourceAccounting,
  RuntimeResourceOperation,
} from "../resource-accounting.js";
import { restoreBlockFacts } from "../restore-block.js";
import { applySheetLifecycleOperation, createSheetLifecycleState } from "../sheet-lifecycle.js";
import type { CellAddress, SheetId } from "../types/coordinates.js";
import type { DocumentOp, MutationIssue } from "../types/document.js";
import {
  deleteRemap,
  insertRemap,
  integerAt,
  movedCellBounds,
  moveRemap,
  normalizedRange,
  patchSheetId,
} from "./ranges.js";
import type { SheetRegistry } from "./sheet-registry.js";
import type { RecomputingCellStore } from "./wasm-contract.js";

export interface PagedDirtyPreflightStats {
  ffiCalls: number;
  maxTransferredArrayLength: number;
  admissionReferenceEntriesScanned: number;
  admissionReferenceMapsMaterialized: number;
}

// Sparse batches amortize the dirty-coordinate set after 128 probes and eight probes
// per dirty cell; measurements favor scalar reads below this transfer/setup cost.
const SPARSE_BULK_MIN_PROBES = 128;
const SPARSE_BULK_DIRTY_RATIO = 8;

interface PagedDirtyPreflightState {
  handle: number | null;
  rows: number;
  cols: number;
  columnKeys: string[];
  dirty: number;
  additional: number;
  existing: Set<string> | null;
  seen: Set<string>;
  sparseProbes: number;
}

function cell_key(addr: CellAddress): string {
  return JSON.stringify([addr.sheet, addr.row, addr.col]);
}

function parse_cell_key(key: string): CellAddress {
  const [sheet, row, col] = JSON.parse(key) as [SheetId, number, number];
  return { sheet, row, col };
}

/** Simulates paged dirty-cell and reference admission before a transaction mutates the store. */
export class PagedDirtyPreflight {
  constructor(
    private wasm: RecomputingCellStore,
    private readonly sheets: SheetRegistry,
    private readonly sheetIdsByHandle: readonly SheetId[],
    private readonly stats: PagedDirtyPreflightStats,
    private readonly boundaryAccounting: BoundaryResourceAccounting,
    private readonly dirtyCellLimit: number,
    private readonly referenceSimulationLimit: number,
  ) {}

  replaceEngine(wasm: RecomputingCellStore): void {
    this.wasm = wasm;
  }

  private note_range_mutation_ffi(operation: RuntimeResourceOperation | null): void {
    this.stats.ffiCalls += 1;
    this.boundaryAccounting.record(operation ?? "edit", "js-to-wasm", 0, "scalar");
  }

  issue(
    patches: readonly DocumentOp[],
    resourceOperation: RuntimeResourceOperation | null,
  ): MutationIssue | null {
    const limit = this.dirtyCellLimit;
    const reference_simulation_limit = this.referenceSimulationLimit;
    const wasm_index_limit = 0xffff_ffff;
    const states = new Map<SheetId, PagedDirtyPreflightState>();
    const sheet_lifecycle = createSheetLifecycleState(this.sheets.workbook.sheets);
    const reference_lifecycle = createSheetLifecycleState(this.sheets.workbook.sheets);
    const applicable_remove = patches.map((patch) => {
      const lifecycle = applySheetLifecycleOperation(reference_lifecycle, patch);
      return patch.op === "removeSheet" && lifecycle?.ok === true;
    });

    const remove_after = new Array<boolean>(patches.length);
    let later_remove = false;

    for (let index = patches.length - 1; index >= 0; index--) {
      remove_after[index] = later_remove;
      if (applicable_remove[index]) later_remove = true;
    }

    let track_virtual_refs = false;
    let reference_simulation_exceeded = false;
    let reference_simulation_actual = 0;
    let virtual_refs: Map<string, CellAddress> | null = null;
    const reference_simulation_issue = (): MutationIssue => ({
      kind: "resource-limit",
      severity: "error",
      resource: "paged-reference-simulation",
      actual: reference_simulation_actual,
      max: reference_simulation_limit,
      message: `Paged reference simulation exceeds the ${reference_simulation_limit} entry limit`,
    });

    const materialize_virtual_refs = (force = false): Map<string, CellAddress> | null => {
      if (!track_virtual_refs && !force) return null;
      if (virtual_refs) return virtual_refs;

      const refs = new Map<string, CellAddress>();
      for (const sheet of this.sheets.workbook.sheets) {
        if (
          !this.sheets.handles.has(sheet.id) ||
          sheet.rowCount === 0 ||
          sheet.columns.length === 0
        ) {
          continue;
        }

        this.note_range_mutation_ffi(resourceOperation);
        const snapshot = this.wasm.captureReferences(
          this.sheets.handleOf(sheet.id),
          reference_simulation_limit - refs.size,
        );
        if (!snapshot) {
          reference_simulation_actual = reference_simulation_limit + 1;
          reference_simulation_exceeded = true;
          return null;
        }

        const projection = consumeSourceSnapshot(snapshot, this.sheetIdsByHandle);
        for (const [offset, target] of projection.references()) {
          reference_simulation_actual++;
          this.stats.admissionReferenceEntriesScanned++;
          if (reference_simulation_actual > reference_simulation_limit) {
            reference_simulation_exceeded = true;
            return null;
          }

          const source = {
            sheet: sheet.id,
            row: Math.floor(offset / sheet.columns.length),
            col: offset % sheet.columns.length,
          };

          refs.set(cell_key(source), target);
        }
      }

      virtual_refs = refs;
      this.stats.admissionReferenceMapsMaterialized++;
      return virtual_refs;
    };

    const set_virtual_ref = (source: CellAddress, target: CellAddress | null): void => {
      const refs = materialize_virtual_refs();
      if (!refs) return;

      const key = cell_key(source);
      const replaced = refs.delete(key);
      if (target) {
        if (!replaced && refs.size >= reference_simulation_limit) {
          reference_simulation_actual = refs.size + 1;
          reference_simulation_exceeded = true;
          return;
        }

        refs.set(key, { ...target });
      }
    };

    const rebase_virtual_refs = (
      sheet: SheetId,
      row_at: (row: number) => number | null,
      col_at: (col: number) => number | null,
    ): void => {
      const refs = materialize_virtual_refs();
      if (!refs) return;

      this.stats.admissionReferenceMapsMaterialized++;
      const rebased = new Map<string, CellAddress>();
      for (const [source_key, target] of refs) {
        const source = parse_cell_key(source_key);
        const source_row = source.sheet === sheet ? row_at(source.row) : source.row;
        const source_col = source.sheet === sheet ? col_at(source.col) : source.col;
        const target_row = target.sheet === sheet ? row_at(target.row) : target.row;
        const target_col = target.sheet === sheet ? col_at(target.col) : target.col;
        if (
          source_row === null ||
          source_col === null ||
          target_row === null ||
          target_col === null
        ) {
          continue;
        }

        const next_source = { sheet: source.sheet, row: source_row, col: source_col };
        rebased.set(cell_key(next_source), {
          sheet: target.sheet,
          row: target_row,
          col: target_col,
        });
      }

      virtual_refs = rebased;
      if (rebased.size > reference_simulation_limit) {
        reference_simulation_actual = rebased.size;
        reference_simulation_exceeded = true;
      }
    };

    const clear_virtual_refs = (
      sheet: SheetId,
      start_row: number,
      start_col: number,
      rows: number,
      cols: number,
    ): void => {
      const refs = materialize_virtual_refs();
      if (!refs) return;

      for (const source_key of refs.keys()) {
        const source = parse_cell_key(source_key);
        if (
          source.sheet === sheet &&
          source.row >= start_row &&
          source.row < start_row + rows &&
          source.col >= start_col &&
          source.col < start_col + cols
        ) {
          refs.delete(source_key);
        }
      }
    };

    const key_of = (row: number, col: number) => `${row}:${col}`;

    const state_for = (sheet: SheetId) => {
      const existing = states.get(sheet);
      if (existing) return existing;
      if (!this.sheets.handles.has(sheet)) return undefined;

      const meta = this.sheets.sheetMeta(sheet);

      const state: PagedDirtyPreflightState = {
        handle: this.sheets.handleOf(sheet),
        rows: meta.rowCount,
        cols: meta.columns.length,
        columnKeys: meta.columns.map((column) => column.key),
        dirty: this.wasm.pagedStats(this.sheets.handleOf(sheet))[2] ?? 0,
        additional: 0,
        existing: null,
        seen: new Set<string>(),
        sparseProbes: 0,
      };

      states.set(sheet, state);
      return state;
    };

    const issue = (actual: number): MutationIssue => ({
      kind: "resource-limit",
      severity: "error",
      resource: "paged-dirty-cells",
      actual: Math.min(Number.MAX_SAFE_INTEGER, actual),
      max: limit,
      message: `Paged dirty cells exceed the ${limit} cell limit`,
    });

    const invalid = (operation_index: number, message: string): MutationIssue => ({
      kind: "invalid-operation",
      severity: "error",
      operationIndex: operation_index,
      message,
    });

    const consume = (state: PagedDirtyPreflightState): MutationIssue | null => {
      const actual = state.dirty + state.additional + 1;
      if (actual > limit) return issue(actual);
      state.additional += 1;
      return null;
    };

    const materialize_existing = (state: PagedDirtyPreflightState): Set<string> => {
      if (state.existing) return state.existing;
      const existing = new Set<string>();
      if (state.handle !== null) {
        const coordinates = this.wasm.pagedDirtyCoordinates(state.handle);
        for (let index = 0; index + 1 < coordinates.length; index += 2) {
          existing.add(key_of(coordinates[index]!, coordinates[index + 1]!));
        }
      }

      state.existing = existing;
      state.dirty = existing.size;
      return existing;
    };

    const rebase_set = (
      source: ReadonlySet<string>,
      row_at: (row: number) => number | null,
      col_at: (col: number) => number | null,
    ) => {
      const rebased = new Set<string>();
      for (const encoded of source) {
        const separator = encoded.indexOf(":");
        const row = Number(encoded.slice(0, separator));
        const col = Number(encoded.slice(separator + 1));
        const next_row = row_at(row);
        const next_col = col_at(col);
        if (next_row !== null && next_col !== null) rebased.add(key_of(next_row, next_col));
      }

      return rebased;
    };

    const rebase_state = (
      state: PagedDirtyPreflightState,
      row_at: (row: number) => number | null,
      col_at: (col: number) => number | null,
    ) => {
      state.existing = rebase_set(materialize_existing(state), row_at, col_at);
      state.seen = rebase_set(state.seen, row_at, col_at);
      state.dirty = state.existing.size;
      state.additional = state.seen.size;
    };

    const add_sparse = (sheet: SheetId, row: number, col: number): MutationIssue | null => {
      const state = state_for(sheet);
      if (!state || row < 0 || col < 0 || row >= state.rows || col >= state.cols) return null;

      const key = key_of(row, col);
      if (state.seen.has(key)) return null;

      state.sparseProbes += 1;
      if (
        state.existing === null &&
        state.sparseProbes >=
          Math.max(SPARSE_BULK_MIN_PROBES, state.dirty * SPARSE_BULK_DIRTY_RATIO)
      ) {
        materialize_existing(state);
      }

      if (
        state.existing?.has(key) ||
        (state.existing === null &&
          state.handle !== null &&
          this.wasm.cellState(state.handle, row, col) === 3)
      ) {
        return null;
      }

      const rejection = consume(state);
      if (!rejection) state.seen.add(key);
      return rejection;
    };

    const cell_applies = (sheet: SheetId, row: number, col: number): boolean => {
      const state = state_for(sheet);
      return Boolean(state && row >= 0 && col >= 0 && row < state.rows && col < state.cols);
    };

    const rectangle_applies = (
      sheet: SheetId,
      start_row: number,
      start_col: number,
      rows: number,
      cols: number,
    ): boolean => {
      const state = state_for(sheet);
      return Boolean(
        state &&
        start_row >= 0 &&
        start_col >= 0 &&
        Number.isSafeInteger(rows) &&
        Number.isSafeInteger(cols) &&
        rows > 0 &&
        cols > 0 &&
        rows <= state.rows - start_row &&
        cols <= state.cols - start_col,
      );
    };

    const add_rectangle = (
      sheet: SheetId,
      start_row: number,
      start_col: number,
      rows: number,
      cols: number,
    ): MutationIssue | null => {
      if (rows === 1 && cols === 1) return add_sparse(sheet, start_row, start_col);

      const state = state_for(sheet);
      if (!state) return null;
      if (start_row < 0 || start_col < 0) return null;
      if (
        !Number.isSafeInteger(rows) ||
        !Number.isSafeInteger(cols) ||
        rows < 0 ||
        cols < 0 ||
        rows > Math.floor(Number.MAX_SAFE_INTEGER / Math.max(cols, 1))
      ) {
        return issue(Number.MAX_SAFE_INTEGER);
      }

      if (rows > state.rows - start_row || cols > state.cols - start_col) {
        const actual = state.dirty + state.additional + rows * cols;
        return actual > limit ? issue(actual) : null;
      }

      const existing = materialize_existing(state);
      for (let row = start_row; row < start_row + rows; row++) {
        for (let col = start_col; col < start_col + cols; col++) {
          const key = key_of(row, col);
          if (existing.has(key) || state.seen.has(key)) continue;
          const rejection = consume(state);
          if (rejection) return rejection;
          state.seen.add(key);
        }
      }

      return null;
    };

    for (let operation_index = 0; operation_index < patches.length; operation_index++) {
      const patch = patches[operation_index]!;
      track_virtual_refs = remove_after[operation_index] ?? false;

      if (patch.op === "addSheet") {
        if (applySheetLifecycleOperation(sheet_lifecycle, patch)?.ok !== true) continue;
        const snapshot = patch.sheet;
        const state: PagedDirtyPreflightState = {
          handle: null,
          rows: snapshot.rowCount,
          cols: snapshot.columns.length,
          columnKeys: snapshot.columns.map((column) => column.key),
          dirty: 0,
          additional: 0,
          existing: new Set<string>(),
          seen: new Set<string>(),
          sparseProbes: 0,
        };

        states.set(snapshot.id, state);
        for (const block of snapshot.cells) {
          for (const cell of block.cells) {
            const rejection = add_sparse(
              snapshot.id,
              block.startRow + cell.rowOffset,
              block.startCol + cell.colOffset,
            );
            if (rejection) return rejection;
            if (cell.value.kind === "ref") {
              set_virtual_ref(
                {
                  sheet: snapshot.id,
                  row: block.startRow + cell.rowOffset,
                  col: block.startCol + cell.colOffset,
                },
                cell.value.target,
              );
              if (reference_simulation_exceeded) return reference_simulation_issue();
            }
          }
        }

        if (reference_simulation_exceeded) return reference_simulation_issue();
        continue;
      }

      if (patch.op === "removeSheet") {
        if (applySheetLifecycleOperation(sheet_lifecycle, patch)?.ok !== true) continue;
        if (reference_simulation_exceeded) return reference_simulation_issue();
        if (!track_virtual_refs && virtual_refs === null) {
          this.note_range_mutation_ffi(resourceOperation);
          const sources = this.wasm.referencesTargeting(
            this.sheets.handleOf(patch.sheet),
            reference_simulation_limit,
          );
          if (!sources) {
            reference_simulation_actual = reference_simulation_limit + 1;
            return reference_simulation_issue();
          }

          this.stats.admissionReferenceEntriesScanned += sources.length / 3;
          for (let index = 0; index < sources.length; index += 3) {
            const source_sheet = this.sheetIdsByHandle[sources[index]!];
            if (source_sheet === undefined || source_sheet === patch.sheet) continue;
            const rejection = add_sparse(source_sheet, sources[index + 1]!, sources[index + 2]!);
            if (rejection) return rejection;
          }

          states.delete(patch.sheet);
          continue;
        }

        const materialized_refs = materialize_virtual_refs(true);
        if (!materialized_refs) return reference_simulation_issue();
        const entries = (function* (): IterableIterator<[CellAddress, CellAddress]> {
          for (const [source_key, target] of materialized_refs) {
            yield [parse_cell_key(source_key), target];
          }
        })();

        const remaining = track_virtual_refs ? new Map<string, CellAddress>() : null;
        for (const [source, target] of entries) {
          if (source.sheet !== patch.sheet && target.sheet === patch.sheet) {
            const rejection = add_sparse(source.sheet, source.row, source.col);
            if (rejection) return rejection;
          }

          if (remaining && source.sheet !== patch.sheet && target.sheet !== patch.sheet) {
            remaining.set(cell_key(source), { ...target });
          }
        }

        virtual_refs = remaining;
        states.delete(patch.sheet);
        continue;
      }

      if (
        patch.op === "renameSheet" ||
        patch.op === "moveSheet" ||
        patch.op === "setSheetVisibility"
      ) {
        applySheetLifecycleOperation(sheet_lifecycle, patch);
        continue;
      }

      const sheet = patchSheetId(patch);
      if (
        sheet !== null &&
        (patch.op === "addRows" ||
          patch.op === "removeRows" ||
          patch.op === "moveRows" ||
          patch.op === "addColumns" ||
          patch.op === "removeColumns" ||
          patch.op === "moveColumns")
      ) {
        const state = state_for(sheet);
        if (!state) continue;
        const keep = (index: number) => index;
        const rebase_axes = (
          row_at: (row: number) => number | null,
          col_at: (col: number) => number | null,
        ): void => {
          rebase_state(state, row_at, col_at);
          rebase_virtual_refs(sheet, row_at, col_at);
        };
        if (patch.op === "addRows") {
          if (patch.at > state.rows || patch.count > wasm_index_limit - state.rows) {
            return invalid(operation_index, "addRows exceeds the current sheet bounds");
          }

          rebase_axes(insertRemap(patch.at, patch.count), keep);
          state.rows += patch.count;
        } else if (patch.op === "removeRows") {
          if (patch.at > state.rows || patch.count > state.rows - patch.at) {
            return invalid(operation_index, "removeRows exceeds the current sheet bounds");
          }

          rebase_axes(deleteRemap(patch.at, patch.count), keep);
          state.rows -= patch.count;
        } else if (patch.op === "moveRows") {
          if (
            patch.from > state.rows ||
            patch.count > state.rows - patch.from ||
            patch.to > state.rows - patch.count
          ) {
            return invalid(operation_index, "moveRows exceeds the current sheet bounds");
          }

          rebase_axes(moveRemap(patch.from, patch.count, patch.to), keep);
        } else if (patch.op === "addColumns") {
          const inserted_keys = patch.columns.map((column) => column.key);
          if (
            patch.at > state.cols ||
            inserted_keys.length === 0 ||
            inserted_keys.length > wasm_index_limit - state.cols ||
            new Set([...state.columnKeys, ...inserted_keys]).size !==
              state.columnKeys.length + inserted_keys.length
          ) {
            return invalid(operation_index, "addColumns exceeds the current sheet bounds");
          }

          rebase_axes(keep, insertRemap(patch.at, patch.columns.length));
          state.cols += patch.columns.length;
          state.columnKeys.splice(patch.at, 0, ...inserted_keys);
        } else if (patch.op === "removeColumns") {
          if (
            patch.at > state.cols ||
            patch.count > state.cols - patch.at ||
            patch.count === state.cols
          ) {
            return invalid(operation_index, "removeColumns exceeds the current sheet bounds");
          }

          rebase_axes(keep, deleteRemap(patch.at, patch.count));
          state.cols -= patch.count;
          state.columnKeys.splice(patch.at, patch.count);
        } else {
          if (
            patch.from > state.cols ||
            patch.count > state.cols - patch.from ||
            patch.to > state.cols - patch.count
          ) {
            return invalid(operation_index, "moveColumns exceeds the current sheet bounds");
          }

          rebase_axes(keep, moveRemap(patch.from, patch.count, patch.to));
          const moved_keys = state.columnKeys.splice(patch.from, patch.count);
          state.columnKeys.splice(patch.to, 0, ...moved_keys);
        }

        if (reference_simulation_exceeded) return reference_simulation_issue();
        continue;
      }

      let rejection: MutationIssue | null = null;
      if (patch.op === "set") {
        if (!cell_applies(patch.addr.sheet, patch.addr.row, patch.addr.col)) continue;
        rejection = add_sparse(patch.addr.sheet, patch.addr.row, patch.addr.col);
        if (!rejection) {
          set_virtual_ref(patch.addr, patch.value.kind === "ref" ? patch.value.target : null);
        }
      } else if (patch.op === "setRange") {
        const range = normalizedRange(patch.range);
        const rows = range.end.row - range.start.row + 1;
        const cols = range.end.col - range.start.col + 1;
        if (
          !rectangle_applies(range.sheet, range.start.row, range.start.col, rows, cols) ||
          patch.cells.some(
            (cell) =>
              !integerAt(cell.rowOffset) ||
              !integerAt(cell.colOffset) ||
              cell.rowOffset >= rows ||
              cell.colOffset >= cols,
          )
        ) {
          continue;
        }

        for (const cell of patch.cells) {
          rejection = add_sparse(
            range.sheet,
            range.start.row + cell.rowOffset,
            range.start.col + cell.colOffset,
          );
          if (rejection) break;
          const source = {
            sheet: range.sheet,
            row: range.start.row + cell.rowOffset,
            col: range.start.col + cell.colOffset,
          };

          set_virtual_ref(source, cell.value.kind === "ref" ? cell.value.target : null);
          if (reference_simulation_exceeded) return reference_simulation_issue();
        }
      } else if (patch.op === "setBlock" || patch.op === "restoreBlock") {
        const { block, range: source_range } =
          patch.op === "restoreBlock" ? restoreBlockFacts(patch) : patch;
        const range = patch.op === "restoreBlock" ? source_range : normalizedRange(source_range);

        rejection = add_rectangle(
          range.sheet,
          range.start.row,
          range.start.col,
          block.rowCount,
          block.colCount,
        );

        if (
          !rejection &&
          block.rowCount === range.end.row - range.start.row + 1 &&
          block.colCount === range.end.col - range.start.col + 1 &&
          rectangle_applies(
            range.sheet,
            range.start.row,
            range.start.col,
            block.rowCount,
            block.colCount,
          )
        ) {
          for (let row_offset = 0; row_offset < block.rowCount; row_offset++) {
            for (let col_offset = 0; col_offset < block.colCount; col_offset++) {
              set_virtual_ref(
                {
                  sheet: range.sheet,
                  row: range.start.row + row_offset,
                  col: range.start.col + col_offset,
                },
                null,
              );
              if (reference_simulation_exceeded) return reference_simulation_issue();
            }
          }

          for (const [offset, target] of block.refs ?? []) {
            set_virtual_ref(
              {
                sheet: range.sheet,
                row: range.start.row + Math.floor(offset / block.colCount),
                col: range.start.col + (offset % block.colCount),
              },
              target,
            );
            if (reference_simulation_exceeded) return reference_simulation_issue();
          }
        }
      } else if (
        patch.op === "setRangeStyle" ||
        patch.op === "clearRange" ||
        patch.op === "permuteRows"
      ) {
        const range = normalizedRange(patch.range);

        rejection = add_rectangle(
          range.sheet,
          range.start.row,
          range.start.col,
          range.end.row - range.start.row + 1,
          range.end.col - range.start.col + 1,
        );

        if (
          !rejection &&
          patch.op === "clearRange" &&
          (patch.contents ?? true) &&
          rectangle_applies(
            range.sheet,
            range.start.row,
            range.start.col,
            range.end.row - range.start.row + 1,
            range.end.col - range.start.col + 1,
          )
        ) {
          clear_virtual_refs(
            range.sheet,
            range.start.row,
            range.start.col,
            range.end.row - range.start.row + 1,
            range.end.col - range.start.col + 1,
          );
        }
      } else if (patch.op === "moveCells") {
        // A block move writes the cells it leaves and the cells it lands on.
        for (const block of movedCellBounds(patch)) {
          rejection ??= add_rectangle(
            block.sheet,
            block.start.row,
            block.start.col,
            block.end.row - block.start.row + 1,
            block.end.col - block.start.col + 1,
          );
        }
      }

      if (reference_simulation_exceeded) return reference_simulation_issue();
      if (rejection) return rejection;
    }

    return null;
  }
}
