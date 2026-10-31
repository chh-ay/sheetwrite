import { mock } from "bun:test";
// Isolate the module mock from the rest of the package tests: a ribbon chunk
// that fails to load gives its space back, tells the user why, and still
// reports the error to the host as a rejection.
import assert from "node:assert/strict";

import { GridImpl, initSheetwrite } from "../src/grid.js";
import { installCanvasTestStubs } from "../src/testing.js";

const LOAD_ERROR = "the ribbon chunk failed to load";
mock.module("../src/ribbon/ribbon.js", () => {
  throw new Error(LOAD_ERROR);
});
const reported: unknown[] = [];
process.on("unhandledRejection", (reason) => reported.push(reason));

await initSheetwrite();
const restore = installCanvasTestStubs();
const host = document.createElement("div");
Object.defineProperties(host, { clientWidth: { value: 900 }, clientHeight: { value: 500 } });
document.body.appendChild(host);
const grid = new GridImpl(host, {
  workbook: {
    activeSheet: "s1",
    sheets: [
      {
        id: "s1",
        name: "Sheet1",
        rowCount: 10,
        columns: [{ key: "a", header: "A", type: "number", width: 100 }],
      },
    ],
  },
  config: { ribbon: true },
});
try {
  // Settle the grid's own import of the same module first; this test exercises
  // the lazy loading boundary, so the import must stay dynamic.
  await import("../src/ribbon/ribbon.js").catch(() => undefined);
  // Unhandled rejections are reported after the microtask queue drains.
  await new Promise<void>((resolve) => setImmediate(resolve));

  const status = host.querySelector<HTMLElement>(".sheetwrite-action-status");
  assert.equal(status?.hidden, false, "the failure is shown to the user");
  assert.equal(status?.textContent, `The ribbon could not load: ${LOAD_ERROR}`);
  assert.equal(reported.length, 1, "the load error still reaches the host");
} finally {
  grid.destroy();
  restore();
}
