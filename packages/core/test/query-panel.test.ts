import { afterEach, beforeAll, beforeEach, expect, it } from "bun:test";

import { GridImpl, initSheetwrite } from "../src/grid.js";
import { loadPanels } from "../src/panels/panel-loader.js";
import { registerQueryCommands } from "../src/query-commands.js";
import { createToolbar } from "../src/shell.js";
import { SheetwriteStore } from "../src/store.js";
import { installCanvasTestStubs } from "../src/testing.js";
import type { QueryCommands } from "../src/types.js";
import type { SavedQuery, Workbook } from "../src/types.js";

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
  const workbook: Workbook = {
    ...(xlsxSource === undefined ? {} : { xlsxSource }),
    activeSheet: "s1",
    sheets: [
      {
        id: "s1",
        name: "Sheet1",
        rowCount: 20,
        columns: ["a", "b", "c", "d"].map((key) => ({
          key,
          header: key.toUpperCase(),
          type: "text" as const,
          width: 100,
        })),
      },
    ],
  };
  const store = new SheetwriteStore(workbook);
  const host = document.createElement("div");
  Object.defineProperties(host, { clientWidth: { value: 1400 }, clientHeight: { value: 500 } });
  document.body.appendChild(host);
  const grid = new GridImpl(host, { workbook, readOnly: false, config: { ribbon: true } }, store);
  grids.push(grid);
  await import(RIBBON_MODULE);

  /** The command's button while the ribbon shows it; hidden commands stay in the DOM. */
  const commandButton = (id: string): HTMLButtonElement | null => {
    const button = host.querySelector<HTMLButtonElement>(
      `.sheetwrite-ribbon [data-command="${id}"]`,
    );
    for (let node: HTMLElement | null = button; node !== null; node = node.parentElement) {
      if (node.hidden) return null;
    }
    return button;
  };
  const openTab = (name: string): void => {
    const tab = [...host.querySelectorAll<HTMLElement>('[role="tab"]')].find(
      (candidate) => candidate.textContent === name,
    );
    if (tab === undefined) throw new Error(`no ribbon tab "${name}"`);
    tab.click();
  };
  const press = (target: Element) =>
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 0 }));
  const panelOpened = async (): Promise<void> => {
    await loadPanels(grid);
    await import(QUERY_PANEL_MODULE);
    await Promise.resolve();
    await Promise.resolve();
  };
  const focusKey = <T extends HTMLElement>(key: string): T => {
    const element = host.querySelector<T>(`[data-focus-key="${key}"]`);
    if (element === null) throw new Error(`no panel control ${key}`);
    return element;
  };
  const buttonLabelled = (label: string): HTMLButtonElement => {
    const found = [...host.querySelectorAll<HTMLButtonElement>(".sheetwrite-panel button")].find(
      (candidate) => candidate.textContent === label && !candidate.hidden,
    );
    if (found === undefined) throw new Error(`no panel button ${label}`);
    return found;
  };
  return { grid, host, commandButton, openTab, press, panelOpened, focusKey, buttonLabelled };
}

it("shows the Data query commands only while a session is registered", async () => {
  const { grid, commandButton, openTab } = await setup();
  openTab("Data");
  expect(commandButton("getData")).toBeNull();

  const toolbarHost = document.createElement("div");
  document.body.appendChild(toolbarHost);
  const toolbar = createToolbar(toolbarHost, grid);
  // The toolbar places a newly available command at its next fit, one frame later.
  const toolbarShows = async (id: string): Promise<boolean> => {
    const frame = Promise.withResolvers<void>();
    requestAnimationFrame(() => frame.resolve());
    await frame.promise;
    return toolbar.element.querySelector<HTMLElement>(`[data-command="${id}"]`)?.hidden === false;
  };
  expect(await toolbarShows("refreshAll")).toBe(false);

  const unregister = registerQueryCommands(grid, new FakeCommands(grid));
  expect(commandButton("getData")).not.toBeNull();
  expect(commandButton("refreshAll")).not.toBeNull();
  expect(commandButton("queries")).not.toBeNull();
  expect(await toolbarShows("refreshAll")).toBe(true);

  unregister();
  expect(commandButton("refreshAll")).toBeNull();
  expect(await toolbarShows("refreshAll")).toBe(false);
  toolbar.destroy();
});

it("runs one Refresh All, and a second press cancels it", async () => {
  const { grid, host, commandButton, openTab, press } = await setup();
  const commands = new FakeCommands(grid);
  registerQueryCommands(grid, commands);
  openTab("Data");
  const refreshAll = commandButton("refreshAll");
  if (refreshAll === null) throw new Error("no Refresh All");

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
  const { grid, commandButton, openTab, press, panelOpened, focusKey } = await setup();
  const commands = new FakeCommands(grid);
  registerQueryCommands(grid, commands);
  openTab("Data");
  const getData = commandButton("getData");
  if (getData === null) throw new Error("no Get Data");
  press(getData);
  await panelOpened();

  focusKey<HTMLInputElement>("query-name").value = "Sales";
  focusKey<HTMLInputElement>("query-source-id").value = "sales-feed";
  focusKey<HTMLInputElement>("query-locator").value = "https://example.test/sales.csv";
  focusKey<HTMLTextAreaElement>("query-columns").value = "Region: text\nTotal: number";
  press(focusKey("query-add-step"));
  const step = document.querySelector<HTMLInputElement>(
    '.sheetwrite-query-steps input[aria-label="Step"]',
  );
  if (step === null) throw new Error("no step input");
  step.value = "Total >= 100";
  focusKey<HTMLInputElement>("query-table-name").value = "SalesTable";
  focusKey<HTMLInputElement>("query-anchor").value = "B2";
  focusKey<HTMLButtonElement>("query-save").click();

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
  const { grid, host, commandButton, openTab, press, panelOpened, buttonLabelled } = await setup({
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
  openTab("Data");
  const queries = commandButton("queries");
  if (queries === null) throw new Error("no Queries & Connections");
  press(queries);
  await panelOpened();

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
});
