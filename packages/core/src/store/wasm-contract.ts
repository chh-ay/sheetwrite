import type { CellStore } from "@sheetwrite/wasm";

/**
 * The engine store that core drives. The generated `@sheetwrite/wasm`
 * declarations are the contract, so a removed or changed export fails the
 * typecheck here instead of at runtime. Members that only one engine
 * exports are optional, so both engine packages satisfy this contract.
 */
export type RecomputingCellStore = Omit<CellStore, "setSavedPivots"> &
  Partial<Pick<CellStore, "setSavedPivots">> & {
    /** Full engine only: replace every pivot anchored on `sheet` (issue #194 wire format). */
    setPivots?(sheet: number, numbers: Float64Array, strings: string[]): boolean;

    /** Full engine only: 7 values per pivot, in the order sent to `setPivots`. */
    pivotStatus?(sheet: number): Uint32Array;

    /** Full engine only: source fields of the pivot at `index` in the sheet's payload. */
    pivotFields?(sheet: number, index: number): PivotFieldList;
  };

/** Source fields reported by the full engine; free after reading. */
interface PivotFieldList {
  names(): string[];
  /** 0 blank, 1 number, 2 text, 3 boolean, 4 mixed. */
  types(): Uint8Array;
  free(): void;
}
