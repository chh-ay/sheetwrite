// Engine providers are selected once per process; this probe owns the full
// provider for the pivot field list and Insert › PivotTable.
import assert from "node:assert/strict";

import * as formulas from "@sheetwrite/formulas";

import { createGrid, initSheetwrite } from "../src/index.js";
import type { DocumentOp, PivotDefinition } from "../src/index.js";
import { loadPanels } from "../src/panels/panel-loader.js";
import { storeEngine } from "../src/store/engine-registry.js";
import { installCanvasTestStubs } from "../src/testing.js";
import { elementAdded, installCoreStyles } from "./fixtures.js";

await initSheetwrite({ engine: formulas });
const restore = installCanvasTestStubs();
const remove_styles = installCoreStyles();
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
// The ribbon mounts when its lazy chunk arrives. Awaiting the same import does
// not order this probe after the grid's own `import().then`, so wait for the
// mounted ribbon itself; the first submit loads the panel controller.
await elementAdded(host, ".sheetwrite-ribbon", HTMLDivElement);

const ops: PivotDefinition[] = [];
const set_pivot = grid.setPivot.bind(grid);
grid.setPivot = (pivot, sheet) => {
  ops.push(structuredClone(pivot));
  return set_pivot(pivot, sheet);
};

const press = (target: Element) =>
  target.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 0 }));
const find = <T extends Element = HTMLElement>(selector: string): T => {
  const element = host.querySelector<T>(selector);
  if (element === null) throw new Error(`nothing matches ${selector}`);
  return element;
};
const by_label = <T extends Element = HTMLButtonElement>(label: string): T =>
  find<T>(`[aria-label="${label}"]`);
/** Open a field's menu from the keyboard and run the entry named `entry`. */
const run_menu = (button: string, entry: string): void => {
  press(by_label(button));
  const item = [
    ...host.querySelectorAll<HTMLElement>('.sheetwrite-panel-menu [role="menuitem"]'),
  ].find((candidate) => candidate.textContent === entry);
  if (item === undefined) throw new Error(`no "${entry}" in ${button}`);
  press(item);
};
const last_op = (): PivotDefinition => {
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
  const insert_tab = [...host.querySelectorAll<HTMLElement>('[role="tab"]')].find(
    (tab) => tab.textContent === "Insert",
  );
  if (insert_tab === undefined) throw new Error("the ribbon has no Insert tab");
  insert_tab.click();
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
  assert.deepEqual(last_op(), {
    id: "pivot-1",
    name: "PivotTable1",
    source: { range: source },
    anchor: { row: 1, col: 4 },
    rows: [],
    columns: [],
    values: [],
  });
  assert.equal(find(".sheetwrite-panel-title").textContent, "PivotTable Fields");
  assert.deepEqual(
    [...host.querySelectorAll(".sheetwrite-panel-fields .sheetwrite-panel-badge")].map(
      (badge) => badge.textContent,
    ),
    ["Text", "Text", "Number"],
  );

  // Each menu action sets the expected definition.
  run_menu("Region field actions", "Add to Rows");
  assert.deepEqual(last_op().rows, [0]);

  run_menu("Amount field actions", "Add to Values");
  assert.deepEqual(last_op().values, [{ field: 2, aggregation: "SUM" }]);

  run_menu("Month field actions", "Add to Rows");
  assert.deepEqual(last_op().rows, [0, 1]);
  run_menu("Month in Rows actions", "Move Up");
  assert.deepEqual(last_op().rows, [1, 0]);

  run_menu("Month in Rows actions", "Move to Columns");
  assert.deepEqual([last_op().rows, last_op().columns], [[0], [1]]);

  const aggregation = by_label<HTMLSelectElement>("Summarize Amount by");
  aggregation.value = "AVERAGE";
  aggregation.dispatchEvent(new Event("change", { bubbles: true }));
  assert.deepEqual(last_op().values, [{ field: 2, aggregation: "AVERAGE" }]);

  const sort = by_label<HTMLSelectElement>("Sort Region");
  sort.value = "descending";
  sort.dispatchEvent(new Event("change", { bubbles: true }));
  assert.deepEqual(last_op().sort, [{ axis: "rows", field: 0, descending: true }]);

  run_menu("Region field actions", "Add to Filters");
  assert.deepEqual(last_op().filters, [{ field: 0, values: ["East", "West"] }]);
  const west = [...host.querySelectorAll<HTMLInputElement>(".sheetwrite-panel-check input")][1];
  assert.ok(west);
  west.checked = false;
  west.dispatchEvent(new Event("change", { bubbles: true }));
  assert.deepEqual(last_op().filters, [{ field: 0, values: ["East"] }]);

  run_menu("Region in Filters actions", "Remove");
  assert.deepEqual([last_op().filters, last_op().rows], [[], [0]]);
  run_menu("Region in Rows actions", "Remove");
  assert.deepEqual(last_op().rows, []);

  // Drag and drop: a source field onto Rows, then out of its area.
  const drop = (target: Element) =>
    target.dispatchEvent(new MouseEvent("drop", { bubbles: true, cancelable: true, clientY: 1e6 }));
  const region_item = by_label("Region field actions").closest("li");
  assert.ok(region_item);
  region_item.dispatchEvent(new Event("dragstart", { bubbles: true }));
  drop(find('.sheetwrite-panel-area[data-area="rows"]'));
  assert.deepEqual(last_op().rows, [0]);

  by_label("Region in Rows actions")
    .closest("li")
    ?.dispatchEvent(new Event("dragstart", { bubbles: true }));
  drop(find(".sheetwrite-panel-fields"));
  assert.deepEqual(last_op().rows, []);
  assert.equal(ops.length, 14, "one setPivot per action");

  // Undo from elsewhere updates the list in place.
  grid.undo();
  assert.ok(by_label("Region in Rows actions"), "undo puts Region back in Rows");

  // While the list is open, a commit rebuilds it only when what it shows
  // changed, and reads the source fields only when they can have changed.
  let field_reads = 0;
  const get_pivot_fields = grid.getPivotFields.bind(grid);
  grid.getPivotFields = (sheet: string, id: string) => {
    field_reads += 1;
    return get_pivot_fields(sheet, id);
  };
  const write = (
    sheet: string,
    row: number,
    col: number,
    value: string | number | { formula: string },
  ): void => {
    const patch: DocumentOp = {
      op: "set",
      addr: { sheet, row, col },
      value:
        typeof value === "object"
          ? { kind: "formula", src: value.formula }
          : { kind: "literal", value },
    };
    assert.equal(grid.applyTransaction({ patches: [patch] }).status, "applied");
  };
  /** Field reads of one write. */
  const reads_of = (run: () => void): number => {
    const before = field_reads;
    run();
    return field_reads - before;
  };
  const field_list = (): Element => find(".sheetwrite-panel-fields");
  const badges = (): (string | null)[] =>
    [...host.querySelectorAll(".sheetwrite-panel-fields .sheetwrite-panel-badge")].map(
      (badge) => badge.textContent,
    );
  const shown = field_list();
  write("data", 20, 9, "elsewhere");
  assert.equal(field_list(), shown, "a cell edit outside the source keeps the list");
  const widened = grid.applyTransaction({
    patches: [{ op: "setColumn", sheet: "data", col: 9, patch: { width: 120 } }],
  });
  assert.equal(widened.status, "applied");
  assert.equal(field_list(), shown, "a column width change keeps the list");

  const notes_added = grid.applyTransaction({
    patches: [
      {
        op: "addSheet",
        sheet: { id: "notes", name: "Notes", order: 1, rowCount: 5, columns, cells: [] },
      },
    ],
  });
  assert.equal(notes_added.status, "applied");
  assert.equal(field_list(), shown, "a new sheet keeps the list");
  assert.equal(
    reads_of(() => write("notes", 0, 0, 1)),
    0,
    "literal sources ignore other sheets",
  );
  assert.equal(
    reads_of(() => write("data", 21, 9, { formula: "=1+1" })),
    1,
  );
  assert.equal(
    reads_of(() => write("notes", 0, 0, 2)),
    1,
    "a formula on the source sheet counts",
  );
  const cleared = grid.applyTransaction({
    patches: [
      {
        op: "clearRange",
        range: { sheet: "data", start: { row: 21, col: 9 }, end: { row: 21, col: 9 } },
      },
    ],
  });
  assert.equal(cleared.status, "applied");
  assert.equal(
    reads_of(() => write("notes", 0, 0, 3)),
    0,
    "a cleared formula stops counting",
  );
  const removed = grid.applyTransaction({ patches: [{ op: "removeSheet", sheet: "notes" }] });
  assert.equal(removed.status, "applied");
  assert.equal(field_list(), shown, "other sheets' edits never rebuilt the list");

  write("data", 1, 2, "ten");
  assert.notEqual(field_list(), shown, "a source edit that changes a field type rebuilds the list");
  assert.deepEqual(badges(), ["Text", "Text", "Mixed"]);
  write("data", 1, 2, 10);
  assert.deepEqual(badges(), ["Text", "Text", "Number"]);
  write("data", 0, 0, "Area");
  assert.ok(by_label("Area field actions"), "a header edit renames the field");
  write("data", 0, 0, "Region");
  assert.ok(by_label("Region in Rows actions"), "the renamed field keeps its area");
  grid.getPivotFields = get_pivot_fields;

  // Selecting a cell of the output opens the field list.
  grid.openPanel(null);
  assert.equal(host.querySelector(".sheetwrite-panel"), null);
  grid.setSelection({ kind: "cell", addr: { sheet: "data", row: 1, col: 4 } });
  assert.equal(find(".sheetwrite-panel-title").textContent, "PivotTable Fields");
  grid.setSelection({ kind: "cell", addr: { sheet: "data", row: 0, col: 0 } });
  assert.equal(host.querySelector(".sheetwrite-panel"), null, "leaving the output closes it");

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
  assert.equal(added?.name, "Sheet2");
  assert.equal(grid.getActiveSheet(), added?.id);
  const inserted = grid.getPivots(added?.id).find((pivot) => pivot.id === "pivot-2");
  assert.deepEqual(inserted?.anchor, { row: 2, col: 0 });
  assert.equal(find(".sheetwrite-panel-title").textContent, "PivotTable Fields");
  grid.undo();
  assert.deepEqual(
    grid.store.getWorkbook().sheets.map((sheet) => sheet.id),
    ["data"],
    "one undo removes the new sheet and its pivot",
  );
} finally {
  grid.destroy();
  remove_styles();
  restore();
}
