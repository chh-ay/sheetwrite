import { afterEach, beforeAll, beforeEach, expect, it } from "bun:test";

import { GridImpl, initSheetwrite } from "../src/grid.js";
import { loadPanels } from "../src/panels/panel-loader.js";
import { registerQueryCommands } from "../src/query-commands.js";
import { SheetwriteStore } from "../src/store.js";
import { installCanvasTestStubs } from "../src/testing.js";
import type {
  DocumentOp,
  QueryCommands,
  SavedQuery,
  Workbook,
  WorkbookTable,
} from "../src/types.js";

let restore: () => void;
const grids: GridImpl[] = [];

const RIBBON_MODULE = "../src/ribbon/ribbon.js";
const QUERY_PANEL_MODULE = "../src/panels/query-panel.js";

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

const sales: SavedQuery = {
  id: "sales",
  name: "Sales",
  source: {
    kind: "csv",
    sourceId: "sales-feed",
    columns: [
      { id: "region", name: "Region", type: "text" },
      { id: "total", name: "Total", type: "number" },
    ],
  },
  steps: [],
};

/** A session stand-in: core never loads the query engine, so it sees only this seam. */
class FakeCommands implements QueryCommands {
  readonly defined: SavedQuery[] = [];
  readonly refreshes: Array<{ ids: readonly string[] | null; signal: AbortSignal }> = [];
  private release: (() => void) | undefined;

  constructor(private readonly grid: GridImpl) {}

  define(query: SavedQuery): string | null {
    this.defined.push(query);
    const result = this.grid.applyTransaction({ patches: [{ op: "setQuery", query }] });
    return result.status === "applied" ? null : "rejected";
  }

  refresh(ids: readonly string[] | null, signal: AbortSignal): Promise<string | null> {
    this.refreshes.push({ ids, signal });
    const { promise, resolve } = Promise.withResolvers<string | null>();
    this.release = () => resolve(null);
    signal.addEventListener("abort", () => resolve("aborted by the session"));
    return promise;
  }

  finish(): void {
    this.release?.();
  }
}

async function setup(xlsxSource?: Workbook["xlsxSource"]) {
  const columns = ["a", "b", "c", "d", "e"].map((key) => ({
    key,
    header: key.toUpperCase(),
    type: "text" as const,
    width: 100,
  }));
  const workbook: Workbook = {
    ...(xlsxSource === undefined ? {} : { xlsxSource }),
    activeSheet: "s1",
    sheets: [{ id: "s1", name: "Sheet1", rowCount: 20, columns }],
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
  const openPanel = async (command: string) => {
    openTab("Data");
    const button = control(command);
    if (button === null) throw new Error(`missing ${command} command`);
    press(button);
    await loadPanels(grid);
    await Promise.resolve();
  };
  const input = <T extends HTMLElement = HTMLInputElement>(focusKey: string): T => {
    const element = host.querySelector<T>(`[data-focus-key="${focusKey}"]`);
    if (element === null) throw new Error(`no panel control "${focusKey}"`);
    return element;
  };
  const submit = () =>
    host
      .querySelector("form")
      ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  /** A Data command's button while the ribbon shows it; hidden commands stay in the DOM. */
  const commandButton = (id: string): HTMLButtonElement => {
    const button = host.querySelector<HTMLButtonElement>(
      `.sheetwrite-ribbon [data-command="${id}"]`,
    );
    for (let node: HTMLElement | null = button; node !== null; node = node.parentElement) {
      if (node.hidden) throw new Error(`command ${id} is hidden`);
    }
    if (button === null) throw new Error(`no command ${id}`);
    return button;
  };
  const openQueryPanel = async (id: string): Promise<void> => {
    openTab("Data");
    press(commandButton(id));
    await loadPanels(grid);
    await import(QUERY_PANEL_MODULE);
    await Promise.resolve();
    await Promise.resolve();
  };
  const buttonLabelled = (label: string): HTMLButtonElement => {
    const found = [...host.querySelectorAll<HTMLButtonElement>(".sheetwrite-panel button")].find(
      (candidate) => candidate.textContent === label && !candidate.hidden,
    );
    if (found === undefined) throw new Error(`no panel button ${label}`);
    return found;
  };
  return {
    grid,
    host,
    field,
    press,
    choose,
    addTable,
    openPanel,
    input,
    submit,
    openTab,
    commandButton,
    openQueryPanel,
    buttonLabelled,
  };
}

it("creates, edits and deletes a relationship as single undo steps", async () => {
  const { grid, host, field, press, choose, addTable, openPanel } = await setup();
  addTable(table("orders", 0, ["customer", "amount"]));
  addTable(table("customers", 3, ["id", "region"]));
  await openPanel("Relationships");

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
  grid.undo();
  expect(grid.store.getWorkbook().dataModel).toBeUndefined();
});

it("creates, renames and removes a measure from Data › Measures, each as one undo step", async () => {
  const { grid, input, press, submit, addTable, openPanel } = await setup();
  addTable(orders);
  await openPanel("Measures");
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
  const { grid, input, submit, addTable, openPanel } = await setup();
  addTable(orders);
  await openPanel("Measures");

  // A measure name may not repeat a column name of its home table.
  input("measure-name").value = "Amount";
  input("measure-formula").value = "=SUM(Orders[Amount])";
  submit();
  expect(grid.store.getWorkbook().dataModel?.measures ?? []).toEqual([]);
  expect(input("measure-name").value).toBe("Amount");
  expect(input("measure-formula").getAttribute("aria-invalid")).toBe("true");
});

it("runs one Refresh All, and a second press cancels it", async () => {
  const { grid, host, commandButton, openTab, press } = await setup();
  const commands = new FakeCommands(grid);
  registerQueryCommands(grid, commands);
  openTab("Data");
  const refreshAll = commandButton("refreshAll");

  press(refreshAll);
  expect(commands.refreshes).toHaveLength(1);
  expect(commands.refreshes[0]?.ids).toBeNull();
  // A user's second click is a later task; the first press's busy state has ended.
  await Promise.resolve();

  press(refreshAll);
  expect(commands.refreshes).toHaveLength(1);
  expect(commands.refreshes[0]?.signal.aborted).toBe(true);
  await Promise.resolve();
  await Promise.resolve();
  expect(host.textContent).toContain("The refresh was cancelled; nothing was written.");
});

it("saves a new query from Get Data through the session's define", async () => {
  const { grid, press, openQueryPanel, input } = await setup();
  const commands = new FakeCommands(grid);
  registerQueryCommands(grid, commands);
  await openQueryPanel("getData");

  input<HTMLInputElement>("query-name").value = "Sales";
  input<HTMLInputElement>("query-source-id").value = "sales-feed";
  input<HTMLInputElement>("query-locator").value = "https://example.test/sales.csv";
  input<HTMLTextAreaElement>("query-columns").value = "Region: text\nTotal: number";
  press(input("query-add-step"));
  const step = document.querySelector<HTMLInputElement>(
    '.sheetwrite-query-steps input[aria-label="Step"]',
  );
  if (step === null) throw new Error("no step input");
  step.value = "Total >= 100";
  input<HTMLInputElement>("query-table-name").value = "SalesTable";
  input<HTMLInputElement>("query-anchor").value = "B2";
  input<HTMLButtonElement>("query-save").click();

  expect(commands.defined).toEqual([
    {
      id: "sales",
      name: "Sales",
      source: {
        kind: "csv",
        sourceId: "sales-feed",
        columns: sales.source.columns,
        locator: "https://example.test/sales.csv",
      },
      steps: [
        {
          kind: "filter",
          predicate: { kind: "compare", column: "total", op: "gte", value: 100 },
        },
      ],
      output: {
        table: "query-sales",
        tableName: "SalesTable",
        anchor: { sheet: "s1", row: 1, col: 1 },
      },
    },
  ]);
  expect(grid.store.getWorkbook().queries?.map((query) => query.id)).toEqual(["sales"]);
});

it("lists saved queries, removes one undoably and shows kept unsupported members read-only", async () => {
  const { grid, host, press, openQueryPanel, buttonLabelled } = await setup({
    parts: [
      {
        name: "customXml/item1.xml",
        contentType: "application/xml",
        method: 0,
        crc32: 0,
        uncompressedSize: 0,
        data: "",
      },
    ],
    graphs: [
      {
        owner: "workbook",
        type: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXml",
        target: "customXml/item1.xml",
        queries: "0123456789abcdef",
        unsupportedQueries: [{ member: "Budget", reason: "schema" }],
        parts: ["customXml/item1.xml"],
        dependencies: [],
      },
    ],
  });
  expect(grid.applyTransaction({ patches: [{ op: "setQuery", query: sales }] }).status).toBe(
    "applied",
  );
  registerQueryCommands(grid, new FakeCommands(grid));
  await openQueryPanel("queries");

  expect(host.querySelector(".sheetwrite-panel")?.textContent).toContain("Sales");
  const kept = host.querySelector('.sheetwrite-query-row[aria-disabled="true"]');
  expect(kept?.textContent).toContain("Budget");
  expect(kept?.textContent).toContain("Not supported: schema.");
  expect(kept?.textContent).toContain(
    "stays in the file unchanged while the saved queries are not edited",
  );

  press(buttonLabelled("Remove"));
  expect(grid.store.getWorkbook().queries ?? []).toEqual([]);
  grid.undo();
  expect(grid.store.getWorkbook().queries).toEqual([sales]);
  grid.undo();
  expect(grid.store.getWorkbook().queries ?? []).toEqual([]);
});
