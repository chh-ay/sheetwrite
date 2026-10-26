import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { CellStore, initSync } from "../pkg/sheetwrite_wasm.js";

const ROWS = 2_048;
// A supplied binary lets the same fixture exercise the pre-fix engine without
// loading its glue or sharing a previously grown WASM memory.
const wasmPath = process.argv[2] ?? new URL("../pkg/sheetwrite_wasm_bg.wasm", import.meta.url);
const wasm = initSync({ module: readFileSync(wasmPath) });
const store = new CellStore();

try {
  const sheet = store.addSheet(2, ROWS);
  const source = `=SUM(A1:A${ROWS})`;
  for (let row = 0; row < ROWS; row++) {
    store.setFormula(sheet, row, 0, "=1", 0);
    store.setFormula(sheet, row, 1, source, 0);
  }

  // Linear memory cannot shrink, so its high-water mark includes temporary
  // dependency edges even after the depth check frees them.
  const beforeBytes = wasm.memory.buffer.byteLength;
  store.recompute(sheet);
  const afterBytes = wasm.memory.buffer.byteLength;
  const first = store.getCell(sheet, 0, 1);
  const last = store.getCell(sheet, ROWS - 1, 1);
  try {
    assert.equal(first.num, ROWS, "first shared-range reader");
    assert.equal(last.num, ROWS, "last shared-range reader");
    process.stdout.write(
      JSON.stringify({
        rows: ROWS,
        firstValue: first.num,
        lastValue: last.num,
        beforeBytes,
        afterBytes,
        growthBytes: afterBytes - beforeBytes,
      }) + "\n",
    );
  } finally {
    first.free();
    last.free();
  }
} finally {
  store.free();
}
