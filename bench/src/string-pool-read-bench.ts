import { readFileSync } from "node:fs";
import type { Workbook } from "@sheetwrite/core";
import type * as WasmModule from "@sheetwrite/wasm";
import type * as CoreEngineModule from "../../packages/core/src/engine.js";
import type * as CoreGridModule from "../../packages/core/src/grid.js";
import type * as CoreStoreModule from "../../packages/core/src/store.js";

const root = process.env.STRING_POOL_CHECKOUT ?? new URL("../../", import.meta.url).pathname;
// Runtime selection keeps the two checked-out implementations isolated.
const wasm = (await import(`${root}/packages/wasm/loader-node.mjs`)) as typeof WasmModule;
const { initSheetwrite } = (await import(
  `${root}/packages/core/src/grid.ts`
)) as typeof CoreGridModule;
const { SheetwriteStore } = (await import(
  `${root}/packages/core/src/store.ts`
)) as typeof CoreStoreModule;
const { getEngine } = (await import(
  `${root}/packages/core/src/engine.ts`
)) as typeof CoreEngineModule;
await wasm.load(readFileSync(`${root}/packages/wasm/pkg/sheetwrite_wasm_bg.wasm`));
await initSheetwrite();
const selectedEngine = getEngine();
if (selectedEngine.CellStore !== wasm.CellStore) {
  throw new Error(`Public benchmark selected an engine outside ${root}`);
}
const engineResolution = {
  checkout: root,
  matchesSelectedCheckout: true,
  hasPoolEpoch: "stringPoolEpoch" in selectedEngine.CellStore.prototype,
};
const ROWS = 100_000;
const READS = 30_000;
const INGEST_ROWS = 1_000_000;
const BATCH_ROWS = 10_000;
const ingestSamples: number[] = [];
for (let sample = 0; sample <= 7; sample++) {
  const engine = new wasm.CellStore();
  try {
    const sheet = engine.addSheet(1, INGEST_ROWS);
    const start = performance.now();
    for (let row = 0; row < INGEST_ROWS; row += BATCH_ROWS) {
      engine.setColumnStrings(
        sheet,
        0,
        row,
        Array.from({ length: BATCH_ROWS }, (_, offset) => `distinct-${row + offset}`),
        0,
      );
    }
    if (sample > 0) ingestSamples.push(performance.now() - start);
    const last = engine.getCell(sheet, INGEST_ROWS - 1, 0);
    try {
      if (last.string !== `distinct-${INGEST_ROWS - 1}`)
        throw new Error("Incorrect distinct ingest");
    } finally {
      last.free();
    }
  } finally {
    engine.free();
  }
}
const workbook: Workbook = {
  activeSheet: "s1",
  sheets: [
    {
      id: "s1",
      name: "Sheet 1",
      rowCount: ROWS,
      columns: [{ key: "name", header: "Name", width: 160, type: "text" }],
    },
  ],
};
const store = new SheetwriteStore(workbook, {
  rowCount: ROWS,
  columns: { name: Array.from({ length: ROWS }, (_, row) => `category-${row % 100}`) },
});
try {
  const samples: number[] = [];
  for (let sample = 0; sample <= 7; sample++) {
    const start = performance.now();
    for (let read = 0; read < READS; read++) {
      const row = (read * 32) % (ROWS - 64);
      const view = store.getVisibleWindow("s1", { start: row, end: row + 64 }, [0]);
      if (view.values[0] !== `category-${row % 100}`) throw new Error("Incorrect public read");
    }
    if (sample > 0) samples.push(performance.now() - start);
  }
  const sorted = samples.toSorted((left, right) => left - right);
  process.stdout.write(
    `${JSON.stringify({
      engineResolution,
      samples,
      medianMs: sorted[3],
      ingestSamples,
      distinctIngestMedianMs: ingestSamples.toSorted((left, right) => left - right)[3],
    })}\n`,
  );
} finally {
  store.dispose();
}
