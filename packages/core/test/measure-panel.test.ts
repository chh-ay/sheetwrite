import { afterEach, beforeAll, beforeEach, expect, it } from "bun:test";

import { GridImpl, initSheetwrite } from "../src/grid.js";
import { loadPanels } from "../src/panels/panel-loader.js";
import { SheetwriteStore } from "../src/store.js";
import { installCanvasTestStubs } from "../src/testing.js";
import type { DocumentOp, Workbook, WorkbookTable } from "../src/types.js";

let restore: () => void;
const grids: GridImpl[] = [];

const RIBBON_MODULE = "../src/ribbon/ribbon.js";

beforeAll(async () => {
  await initSheetwrite();
  await import(RIBBON_MODULE);
});
beforeEach(() => {
  restore = installCanvasTestStubs();
});
afterEach(() => {
  for (const grid of grids.splice(0)) grid.destroy();
  document.body.replaceChildren();
  restore();
});

const orders: WorkbookTable = {
  id: "orders",
  name: "Orders",
  range: { sheet: "s1", start: { row: 0, col: 0 }, end: { row: 3, col: 1 } },
  columns: [
    { id: "region", name: "Region" },
    { id: "amount", name: "Amount" },
  ],
  headerRow: true,
  totalsRow: false,
};

async function setup() {
  const columns = ["a", "b", "c"].map((key) => ({
    key,
    header: key.toUpperCase(),
    type: "text" as const,
    width: 100,
  }));
  const workbook: Workbook = {
    activeSheet: "s1",
    sheets: [{ id: "s1", name: "Sheet1", rowCount: 10, columns }],
  };
  const store = new SheetwriteStore(workbook);
  const host = document.createElement("div");
  Object.defineProperties(host, { clientWidth: { value: 1400 }, clientHeight: { value: 500 } });
  document.body.appendChild(host);
  const grid = new GridImpl(host, { workbook, readOnly: false, config: { ribbon: true } }, store);
  grids.push(grid);
  await import(RIBBON_MODULE);

  const scope = ".sheetwrite-ribbon-panel:not([hidden])";
  const control = (label: string): HTMLButtonElement | null => {
    const element = host.querySelector<HTMLButtonElement>(`${scope} [aria-label="${label}"]`);
    return element === null || element.closest("[hidden]") !== null ? null : element;
  };
  const openTab = (name: string): void => {
    const tab = [...host.querySelectorAll<HTMLElement>('[role="tab"]')].find(
      (candidate) => candidate.textContent === name,
    );
    if (tab === undefined) throw new Error(`no ribbon tab "${name}"`);
    tab.click();
  };
  const input = (focusKey: string): HTMLInputElement => {
    const element = host.querySelector<HTMLInputElement>(`[data-focus-key="${focusKey}"]`);
    if (element === null) throw new Error(`no panel control "${focusKey}"`);
    return element;
  };
  const press = (target: Element) =>
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 0 }));
  const submit = () =>
    host
      .querySelector("form")
      ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  const patch: DocumentOp = { op: "addTable", table: orders };
  expect(grid.applyTransaction({ patches: [patch] }).status).toBe("applied");
  await Promise.resolve();
  return { grid, control, openTab, input, press, submit };
}

it("creates, renames and removes a measure from Data › Measures, each as one undo step", async () => {
  const { grid, control, openTab, input, press, submit } = await setup();
  openTab("Data");
  const command = control("Measures");
  if (command === null) throw new Error("missing Measures command");
  press(command);
  await loadPanels(grid);
  await Promise.resolve();
  const measures = () => grid.store.getWorkbook().dataModel?.measures ?? [];

  input("measure-name").value = "Total";
  input("measure-formula").value = "SUM(Orders[Amount])";
  submit();
  expect(measures()).toEqual([
    { id: "measure-1", name: "Total", table: "orders", formula: "=SUM(Orders[Amount])" },
  ]);

  press(input("new-measure"));
  input("measure-name").value = "Double";
  input("measure-formula").value = "=[Total]*2";
  submit();
  expect(measures().map((measure) => measure.id)).toEqual(["measure-1", "measure-2"]);

  // Editing the first measure renames it, and the reference to it follows.
  press(input("edit-measure-1"));
  expect(input("measure-name").value).toBe("Total");
  input("measure-name").value = "Revenue";
  submit();
  expect(measures().map((measure) => [measure.name, measure.formula])).toEqual([
    ["Revenue", "=SUM(Orders[Amount])"],
    ["Double", "=[Revenue]*2"],
  ]);

  press(input("remove-measure-2"));
  expect(measures().map((measure) => measure.name)).toEqual(["Revenue"]);
  grid.undo();
  expect(measures().map((measure) => measure.name)).toEqual(["Revenue", "Double"]);
  grid.undo();
  expect(measures().map((measure) => [measure.name, measure.formula])).toEqual([
    ["Total", "=SUM(Orders[Amount])"],
    ["Double", "=[Total]*2"],
  ]);
});

it("keeps the form and shows the reason when the model refuses a measure", async () => {
  const { grid, control, openTab, input, press, submit } = await setup();
  openTab("Data");
  const command = control("Measures");
  if (command === null) throw new Error("missing Measures command");
  press(command);
  await loadPanels(grid);
  await Promise.resolve();

  // A measure name may not repeat a column name of its home table.
  input("measure-name").value = "Amount";
  input("measure-formula").value = "=SUM(Orders[Amount])";
  submit();
  expect(grid.store.getWorkbook().dataModel?.measures ?? []).toEqual([]);
  expect(input("measure-name").value).toBe("Amount");
  expect(input("measure-formula").getAttribute("aria-invalid")).toBe("true");
});
