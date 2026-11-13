// matched-formula-harness.ts runs against the pinned 77c4198 and 27be344
// engines, and bench/results/formula-regression-raw.json pins its bytes by
// hash, so its engine types are declared here instead of in the harness. It
// takes its types from the current engine build, which no longer has
// setColumnNumbers, so this file declares that pinned-engine call. The
// current engines share one CellStore contract, so both builds declare it.
// Other benchmarks write through packed-fixture.ts and must not call it.
export {};

interface PinnedColumnSetters {
  /** Present in the pinned 77c4198 and 27be344 engines only. */
  setColumnNumbers(
    sheet: number,
    col: number,
    startRow: number,
    values: Float64Array,
    style: number,
  ): void;
}

declare module "../../packages/wasm/pkg/sheetwrite_wasm.js" {
  interface CellStore extends PinnedColumnSetters {}
}

declare module "../../packages/formulas/pkg/sheetwrite_wasm.js" {
  interface CellStore extends PinnedColumnSetters {}
}
