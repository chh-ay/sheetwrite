import { mock } from "bun:test";
// Isolate the module mock from the rest of the package tests: a ribbon chunk
// that fails to load must fall back to the flat toolbar and say why, without
// an unhandled rejection (the runner fails the probe on any stderr output).
import assert from "node:assert/strict";

import { GridImpl, initSheetwrite } from "../src/grid.js";
import { installCanvasTestStubs } from "../src/testing.js";

mock.module("../src/ribbon/ribbon.js", () => {
  throw new Error("the ribbon chunk failed to load");
});

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
  await Promise.resolve();

  assert.ok(host.querySelector(".sheetwrite-toolbar"), "the flat toolbar replaces the ribbon");
  const status = host.querySelector<HTMLElement>(".sheetwrite-action-status");
  assert.equal(status?.hidden, false, "the failure is shown to the user");
  assert.match(status?.textContent ?? "", /the ribbon chunk failed to load/);
} finally {
  grid.destroy();
  restore();
}
