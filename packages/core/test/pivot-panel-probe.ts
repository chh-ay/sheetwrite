// Engine providers are selected once per process; this probe owns the full
// provider for the pivot field list and Insert › PivotTable.
import assert from "node:assert/strict";

import * as formulas from "@sheetwrite/formulas";

import { createGrid, initSheetwrite } from "../src/index.js";
import type { DocumentOp, PivotDefinition } from "../src/index.js";
import { loadPanels } from "../src/panels/panel-loader.js";
import { storeEngine } from "../src/store/engine-registry.js";
import { installCanvasTestStubs } from "../src/testing.js";

await initSheetwrite(undefined, formulas);
const restore = installCanvasTestStubs();
const host = document.createElement("div");
Object.defineProperties(host, { clientWidth: { value: 900 }, clientHeight: { value: 500 } });
document.body.appendChild(host);

const columns = Array.from({ length: 10 }, (_, index) => ({
  key: `c${index}`,
  header: `C${index}`,
  width: 80,
  type: "text" as const,
}));
const grid = createGrid(host, {
  workbook: { activeSheet: "data", sheets: [{ id: "data", name: "Data", rowCount: 30, columns }] },
  config: { ribbon: true },
});
// Await the ribbon's lazy mount; the first submit loads the panel controller.
await import("../src/ribbon/ribbon.js");

const ops: PivotDefinition[] = [];
const setPivot = grid.setPivot.bind(grid);
grid.setPivot = (pivot, sheet) => {
  ops.push(structuredClone(pivot));
  return setPivot(pivot, sheet);
};

const press = (target: Element) =>
  target.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 0 }));
const key = (target: Element, name: string) =>
  target.dispatchEvent(
    new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true }),
  );
const find = <T extends Element = HTMLElement>(selector: string): T => {
  const element = host.querySelector<T>(selector);
  if (element === null) throw new Error(`nothing matches ${selector}`);
  return element;
};
const byLabel = <T extends Element = HTMLButtonElement>(label: string): T =>
  find<T>(`[aria-label="${label}"]`);
/** Open a field's menu from the keyboard and run the entry named `entry`. */
const runMenu = (button: string, entry: string): void => {
  press(byLabel(button));
  const item = [
    ...host.querySelectorAll<HTMLElement>('.sheetwrite-panel-menu [role="menuitem"]'),
  ].find((candidate) => candidate.textContent === entry);
  if (item === undefined) throw new Error(`no "${entry}" in ${button}`);
  press(item);
};
const lastOp = (): PivotDefinition => {
  const op = ops.at(-1);
  if (op === undefined) throw new Error("no setPivot ran");
  return op;
};

try {
  assert.equal(storeEngine(grid.store)?.computesPivots, true);

  const data = [
    ["Region", "Month", "Amount"],
    ["East", "Jan", 10],
    ["West", "Jan", 20],
    ["East", "Feb", 5],
  ];
  const patches = data.flatMap((row, r) =>
    row.map((value, col): DocumentOp => ({
      op: "set",
      addr: { sheet: "data", row: r, col },
      value: { kind: "literal", value },
    })),
  );
  assert.equal(grid.applyTransaction({ patches }).status, "applied");
  const source = { sheet: "data", start: { row: 0, col: 0 }, end: { row: 3, col: 2 } };
  grid.setSelection({ kind: "range", range: source });

  // Insert › PivotTable at a typed cell.
  const insertTab = [...host.querySelectorAll<HTMLElement>('[role="tab"]')].find(
    (tab) => tab.textContent === "Insert",
  );
  insertTab?.click();
  // Let the tab's fit frame settle before opening its popup, just as a user
  // clicks after the tab has painted. A fit pass closes floating surfaces.
  const fitted = Promise.withResolvers<void>();
  requestAnimationFrame(() => fitted.resolve());
  await fitted.promise;
  const button = find<HTMLButtonElement>(
    '.sheetwrite-ribbon-panel:not([hidden]) [aria-label="PivotTable"]',
  );
  assert.equal(button.disabled, false, "the full engine enables Insert › PivotTable");
  press(button);
  const form = find<HTMLFormElement>("form.sheetwrite-ribbon-popup");
  const [, existing] = [...form.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
  const location = find<HTMLInputElement>("form.sheetwrite-ribbon-popup .sheetwrite-ribbon-field");
  assert.ok(existing);
  existing.checked = true;
  existing.dispatchEvent(new Event("change", { bubbles: true }));
  location.value = "Nowhere!A1";
  form.dispatchEvent(new Event("submit", { cancelable: true }));
  await loadPanels(grid);
  await Promise.resolve();
  assert.equal(ops.length, 0, "a bad location makes no pivot");
  assert.equal(find(".sheetwrite-ribbon-form-error").textContent, "No sheet has this name.");

  location.value = "E2:F3";
  form.dispatchEvent(new Event("submit", { cancelable: true }));
  await loadPanels(grid);
  await Promise.resolve();
  assert.equal(ops.length, 0, "a destination range must not silently become its first cell");
  assert.equal(
    find(".sheetwrite-ribbon-form-error").textContent,
    "Enter a cell for the pivot table, for example Sheet1!H2.",
  );

  location.value = "E2";
  form.dispatchEvent(new Event("submit", { cancelable: true }));
  await loadPanels(grid);
  await Promise.resolve();
  assert.equal(ops.length, 1);
  assert.deepEqual(lastOp(), {
    id: "pivot-1",
    name: "PivotTable1",
    source: { range: source },
    anchor: { row: 1, col: 4 },
    rows: [],
    columns: [],
    values: [],
  });
  assert.equal(find(".sheetwrite-panel-title").textContent, "PivotTable Fields");
  assert.ok(
    find(".sheetwrite-panel").contains(document.activeElement),
    "focus is in the field list",
  );
  assert.deepEqual(
    [...host.querySelectorAll(".sheetwrite-panel-fields .sheetwrite-panel-badge")].map(
      (badge) => badge.textContent,
    ),
    ["Text", "Text", "Number"],
  );

  // Keyboard: each menu action is one setPivot with the expected definition.
  runMenu("Region field actions", "Add to Rows");
  assert.equal(ops.length, 2);
  assert.deepEqual(lastOp().rows, [0]);
  assert.equal(
    document.activeElement,
    byLabel("Region in Rows actions"),
    "focus follows the moved field",
  );

  runMenu("Amount field actions", "Add to Values");
  assert.equal(ops.length, 3);
  assert.deepEqual(lastOp().values, [{ field: 2, aggregation: "SUM" }]);

  runMenu("Month field actions", "Add to Rows");
  assert.deepEqual(lastOp().rows, [0, 1]);
  runMenu("Month in Rows actions", "Move Up");
  assert.equal(ops.length, 5);
  assert.deepEqual(lastOp().rows, [1, 0]);

  runMenu("Month in Rows actions", "Move to Columns");
  assert.equal(ops.length, 6);
  assert.deepEqual([lastOp().rows, lastOp().columns], [[0], [1]]);

  // Arrow keys move through a menu; disabled entries are skipped.
  press(byLabel("Region in Rows actions"));
  assert.equal(document.activeElement?.textContent, "Move to Filters");
  key(document.activeElement as HTMLElement, "ArrowDown");
  assert.equal(document.activeElement?.textContent, "Move to Columns");
  key(document.activeElement as HTMLElement, "Escape");
  assert.equal(document.activeElement, byLabel("Region in Rows actions"));
  assert.ok(host.querySelector(".sheetwrite-panel"), "Escape in a menu keeps the panel open");

  const aggregation = byLabel<HTMLSelectElement>("Summarize Amount by");
  aggregation.value = "AVERAGE";
  aggregation.dispatchEvent(new Event("change", { bubbles: true }));
  assert.equal(ops.length, 7);
  assert.deepEqual(lastOp().values, [{ field: 2, aggregation: "AVERAGE" }]);

  const sort = byLabel<HTMLSelectElement>("Sort Region");
  sort.value = "descending";
  sort.dispatchEvent(new Event("change", { bubbles: true }));
  assert.equal(ops.length, 8);
  assert.deepEqual(lastOp().sort, [{ axis: "rows", field: 0, descending: true }]);

  runMenu("Region field actions", "Add to Filters");
  assert.equal(ops.length, 9);
  assert.deepEqual(lastOp().filters, [{ field: 0, values: ["East", "West"] }]);
  const west = [...host.querySelectorAll<HTMLInputElement>(".sheetwrite-panel-check input")][1];
  assert.ok(west);
  west.checked = false;
  west.dispatchEvent(new Event("change", { bubbles: true }));
  assert.equal(ops.length, 10);
  assert.deepEqual(lastOp().filters, [{ field: 0, values: ["East"] }]);

  runMenu("Region in Filters actions", "Remove");
  assert.equal(ops.length, 11);
  assert.deepEqual([lastOp().filters, lastOp().rows], [[], [0]]);
  runMenu("Region in Rows actions", "Remove");
  assert.equal(ops.length, 12);
  assert.deepEqual(lastOp().rows, []);

  // Drag and drop: a source field onto Rows, then out of its area.
  const drop = (target: Element) =>
    target.dispatchEvent(new MouseEvent("drop", { bubbles: true, cancelable: true, clientY: 1e6 }));
  const regionItem = byLabel("Region field actions").closest("li");
  assert.ok(regionItem);
  regionItem.dispatchEvent(new Event("dragstart", { bubbles: true }));
  drop(find('.sheetwrite-panel-area[data-area="rows"]'));
  assert.equal(ops.length, 13);
  assert.deepEqual(lastOp().rows, [0]);

  byLabel("Region in Rows actions")
    .closest("li")
    ?.dispatchEvent(new Event("dragstart", { bubbles: true }));
  drop(find(".sheetwrite-panel-fields"));
  assert.equal(ops.length, 14);
  assert.deepEqual(lastOp().rows, []);

  // Undo from elsewhere updates the list in place.
  grid.undo();
  assert.ok(byLabel("Region in Rows actions"), "undo puts Region back in Rows");

  // Selecting a cell of the output opens the field list without taking focus.
  grid.openPanel(null);
  assert.equal(host.querySelector(".sheetwrite-panel"), null);
  grid.setSelection({ kind: "cell", addr: { sheet: "data", row: 1, col: 4 } });
  assert.equal(find(".sheetwrite-panel-title").textContent, "PivotTable Fields");
  assert.ok(!find(".sheetwrite-panel").contains(document.activeElement));
  grid.setSelection({ kind: "cell", addr: { sheet: "data", row: 0, col: 0 } });
  assert.equal(host.querySelector(".sheetwrite-panel"), null, "leaving the output closes it");

  // The context menu's PivotTable Fields: it reopens a closed field list on an
  // output cell, and does nothing outside every pivot.
  grid.actions.showPivotFields();
  assert.equal(host.querySelector(".sheetwrite-panel"), null, "no pivot under A1");
  grid.setSelection({ kind: "cell", addr: { sheet: "data", row: 1, col: 4 } });
  grid.openPanel(null);
  grid.actions.showPivotFields();
  await Promise.resolve();
  assert.equal(find(".sheetwrite-panel-title").textContent, "PivotTable Fields");
  grid.openPanel(null);
  grid.setSelection({ kind: "cell", addr: { sheet: "data", row: 0, col: 0 } });

  // Insert › PivotTable on a new sheet puts the pivot at A3 of that sheet.
  grid.setSelection({ kind: "range", range: source });
  await Promise.resolve();
  press(button);
  find<HTMLFormElement>("form.sheetwrite-ribbon-popup").dispatchEvent(
    new Event("submit", { cancelable: true }),
  );
  await loadPanels(grid);
  await Promise.resolve();
  const added = grid.store.getWorkbook().sheets.at(-1);
  assert.equal(added?.name, "Sheet 2");
  assert.equal(grid.getActiveSheet(), added?.id);
  const inserted = grid.getPivots(added?.id).find((pivot) => pivot.id === "pivot-2");
  assert.deepEqual(inserted?.anchor, { row: 2, col: 0 });
  assert.equal(find(".sheetwrite-panel-title").textContent, "PivotTable Fields");
  grid.undo();
  assert.deepEqual(
    grid.store.getWorkbook().sheets.map((sheet) => sheet.id),
    ["data"],
  );
  assert.equal(
    grid.getPivots().some((pivot) => pivot.id === "pivot-2"),
    false,
  );
  grid.redo();
  assert.equal(grid.store.getWorkbook().sheets.at(-1)?.id, added?.id);
  assert.deepEqual(
    grid.getPivots(added?.id).find((pivot) => pivot.id === "pivot-2"),
    inserted,
  );
} finally {
  grid.destroy();
  restore();
}
