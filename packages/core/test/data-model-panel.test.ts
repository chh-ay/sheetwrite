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

const table = (id: string, col: number, columnIds: [string, string]): WorkbookTable => ({
  id,
  name: id[0]?.toUpperCase() + id.slice(1),
  range: { sheet: "s1", start: { row: 0, col }, end: { row: 3, col: col + 1 } },
  columns: columnIds.map((columnId) => ({ id: columnId, name: columnId })),
  headerRow: true,
  totalsRow: false,
});

async function setup() {
  const columns = ["a", "b", "c", "d", "e"].map((key) => ({
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
  // Await the ribbon's lazy mount, which loads its own chunk.
  await import(RIBBON_MODULE);

  const scope = ".sheetwrite-ribbon-panel:not([hidden])";
  /** A shown ribbon command; renderers keep unavailable commands as hidden elements. */
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
  const field = (label: string, index = 0): HTMLSelectElement => {
    const labels = [...host.querySelectorAll<HTMLElement>(".sheetwrite-panel-field")].filter(
      (candidate) => candidate.querySelector(".sheetwrite-panel-label")?.textContent === label,
    );
    const select = labels[index]?.querySelector<HTMLSelectElement>("select");
    if (select == null) throw new Error(`no panel field "${label}"`);
    return select;
  };
  const press = (target: Element) =>
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 0 }));
  const choose = (select: HTMLSelectElement, value: string) => {
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  };
  const addTable = (definition: WorkbookTable) => {
    const patch: DocumentOp = { op: "addTable", table: definition };
    expect(grid.applyTransaction({ patches: [patch] }).status).toBe("applied");
  };
  return { grid, host, control, openTab, field, press, choose, addTable };
}

it("shows the Data Tools commands once the workbook has tables to manage and relate", async () => {
  const { control, openTab, addTable } = await setup();
  const shown = () => ({
    manage: control("Manage Data Model") !== null,
    relate: control("Relationships") !== null,
  });
  openTab("Data");
  expect(shown()).toEqual({ manage: false, relate: false });

  // Command state, and so availability, refreshes in a microtask after a change.
  addTable(table("orders", 0, ["customer", "amount"]));
  await Promise.resolve();
  expect(shown()).toEqual({ manage: true, relate: false });

  addTable(table("customers", 3, ["id", "region"]));
  await Promise.resolve();
  expect(shown()).toEqual({ manage: true, relate: true });
});

it("creates, edits and deletes a relationship as single undo steps", async () => {
  const { grid, host, control, openTab, field, press, choose, addTable } = await setup();
  addTable(table("orders", 0, ["customer", "amount"]));
  addTable(table("customers", 3, ["id", "region"]));
  openTab("Data");
  const relationships = control("Relationships");
  if (relationships === null) throw new Error("missing Relationships command");
  press(relationships);
  await loadPanels(grid);
  await Promise.resolve();

  expect(host.querySelector(".sheetwrite-panel")?.textContent).toContain(
    "Orders: 2 columns, 3 rows",
  );
  choose(field("Data table"), "orders");
  choose(field("Key column", 0), "customer");
  choose(field("Lookup table"), "customers");
  choose(field("Key column", 1), "id");
  const save = host.querySelector<HTMLButtonElement>('[data-focus-key="save-relationship"]');
  if (save === null) throw new Error("missing save button");
  press(save);

  const created = {
    id: "relationship-1",
    from: { table: "orders", column: "customer" },
    to: { table: "customers", column: "id" },
  };
  expect(grid.store.getWorkbook().dataModel?.relationships).toEqual([created]);
  // The default engine keeps relationships but checks no keys.
  expect(host.querySelector(".sheetwrite-panel")?.textContent).toContain(
    "Key checks need the full engine.",
  );

  const label = "Orders[customer] → Customers[id]";
  const edit = host.querySelector<HTMLButtonElement>(`[aria-label="Edit ${label}"]`);
  if (edit === null) throw new Error("missing edit button");
  press(edit);
  choose(field("Key column", 0), "amount");
  press(save);
  expect(grid.store.getWorkbook().dataModel?.relationships).toEqual([
    { ...created, from: { table: "orders", column: "amount" } },
  ]);
  grid.undo();
  expect(grid.store.getWorkbook().dataModel?.relationships).toEqual([created]);

  const remove = host.querySelector<HTMLButtonElement>(`[aria-label="Delete ${label}"]`);
  if (remove === null) throw new Error("missing delete button");
  press(remove);
  expect(grid.store.getWorkbook().dataModel).toBeUndefined();
  grid.undo();
  expect(grid.store.getWorkbook().dataModel?.relationships).toEqual([created]);
});

it("refuses a relationship between one table and itself", async () => {
  const { grid, host, field, choose, press, addTable } = await setup();
  addTable(table("orders", 0, ["customer", "amount"]));
  addTable(table("customers", 3, ["id", "region"]));
  (await loadPanels(grid)).openDataModelPanel(grid);

  choose(field("Data table"), "orders");
  choose(field("Lookup table"), "orders");
  const save = host.querySelector<HTMLButtonElement>('[data-focus-key="save-relationship"]');
  if (save === null) throw new Error("missing save button");
  press(save);
  expect(grid.store.getWorkbook().dataModel).toBeUndefined();
  expect(host.querySelector(".sheetwrite-panel")?.textContent).toContain(
    "Choose two different tables.",
  );
});
