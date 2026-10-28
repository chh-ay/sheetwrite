import { mock } from "bun:test";
// Isolate the module mock from the rest of the package tests. The factory is
// evaluated by Bun only when the optional module is imported, so this watches
// the real loading boundary, not a production status flag.
import assert from "node:assert/strict";

import { GridImpl, initSheetwrite } from "../src/grid.js";
import { loadPanels } from "../src/panels/panel-loader.js";
import { installCanvasTestStubs } from "../src/testing.js";
import type { Grid } from "../src/types/grid.js";

let evaluations = 0;
let insertions = 0;
let insertedInto: Grid | null = null;
mock.module("../src/panels/panel-controller.js", () => {
  evaluations += 1;
  return {
    attachPanels: () => () => undefined,
    insertChart: (grid: Grid) => {
      insertions += 1;
      insertedInto = grid;
      return true;
    },
  };
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
  // The ribbon itself is lazy; await its mount without requesting the panels.
  await import("../src/ribbon/ribbon.js");
  assert.equal(evaluations, 0, "construction must not import the panels");
  grid.applyTransaction({
    patches: [
      { op: "set", addr: { sheet: "s1", row: 0, col: 0 }, value: { kind: "literal", value: 8 } },
    ],
  });
  grid.setSelection({ kind: "cell", addr: { sheet: "s1", row: 0, col: 0 } });
  const insert = [...host.querySelectorAll<HTMLElement>('[role="tab"]')].find(
    (tab) => tab.textContent === "Insert",
  );
  assert.ok(insert);
  insert.click();
  assert.equal(
    evaluations,
    0,
    "cell edits, selection and ribbon state reads must not import the panels",
  );
  const chart = host.querySelector<HTMLButtonElement>(
    '.sheetwrite-ribbon-panel:not([hidden]) [aria-label="Chart"]',
  );
  assert.ok(chart);
  chart.click();
  await loadPanels(grid);
  await Promise.resolve();
  assert.equal(evaluations, 1, "the first Chart click must import the panels once");
  assert.equal(insertions, 1);
  assert.equal(insertedInto, grid);
} finally {
  grid.destroy();
  restore();
}
