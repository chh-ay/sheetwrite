// Types for matched-formula-harness.ts only; tsconfig.matched-harness.json is
// the one project that includes this file. The harness runs against the
// pinned 77c4198 and 27be344 engines, which still have setColumnNumbers, but
// imports its types from the current engine build, which does not. Its bytes
// are pinned by hash, so the pinned-engine call is declared here.
export {};

declare module "../../packages/wasm/pkg/sheetwrite_wasm.js" {
  interface CellStore {
    /** Present in the pinned 77c4198 and 27be344 engines only. */
    setColumnNumbers(
      sheet: number,
      col: number,
      startRow: number,
      values: Float64Array,
      style: number,
    ): void;
  }
}
