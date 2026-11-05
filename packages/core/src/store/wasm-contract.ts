import type { CellStore } from "@sheetwrite/wasm";

/**
 * The engine store that core drives. The generated `@sheetwrite/wasm`
 * declarations are the contract, so a removed or changed export fails the
 * typecheck here instead of at runtime. Members that only one engine
 * exports are optional, so both engine packages satisfy this contract.
 */
export type RecomputingCellStore = Omit<CellStore, "setSavedPivots" | "setHostFunction"> &
  Partial<Pick<CellStore, "setSavedPivots">> & {
    /**
     * Full engine only: add, replace or remove (`callback` absent) a host
     * function; `recalculate` is `false` for a memory-release replacement.
     */
    setHostFunction?(
      name: string,
      callback: ((...values: never[]) => unknown) | undefined,
      volatile: boolean,
      recalculate: boolean,
    ): boolean;

    /** Full engine only: replace every pivot anchored on `sheet` (issue #194 wire format). */
    setPivots?(sheet: number, numbers: Float64Array, strings: string[]): boolean;

    /** Full engine only: 7 values per pivot, in the order sent to `setPivots`. */
    pivotStatus?(sheet: number): Uint32Array;

    /** Full engine only: source fields of the pivot at `index` in the sheet's payload. */
    pivotFields?(sheet: number, index: number): PivotFieldList;

    /** Full engine only: the output cells of a pivot on a dashboard, which places none in cells. */
    pivotOutput?(sheet: number, index: number): PivotOutputCells;

    /** Full engine only: replace every relationship; five IDs each (`setRelationships`). */
    setRelationships?(strings: string[]): boolean;

    /** Full engine only: `[code, firstRow, secondRow, unmatched]`, empty for an unknown ID. */
    relationshipStatus?(id: string): Uint32Array;
  };

/** Dashboard pivot output in row-major order; free after reading. */
export interface PivotOutputCells {
  /** 0 blank, 1 number, 2 text, 3 boolean, 4 error. */
  kinds(): Uint8Array;
  /** Per cell: the number, the boolean as 0 or 1, or the error slot. */
  numbers(): Float64Array;
  /** The text cells, in order. */
  texts(): string[];
  free(): void;
}

/** Source fields reported by the full engine; free after reading. */
interface PivotFieldList {
  names(): string[];
  /** 0 blank, 1 number, 2 text, 3 boolean, 4 mixed. */
  types(): Uint8Array;
  free(): void;
}
