import { afterEach, beforeAll, beforeEach, expect, it } from "bun:test";

import { listFunctions } from "../src/functions.js";
import { GridImpl, initSheetwrite } from "../src/grid.js";
import { loadPanels } from "../src/panels/panel-loader.js";
import { SheetwriteStore } from "../src/store.js";
import { storeEngine } from "../src/store/engine-registry.js";
import { installCanvasTestStubs } from "../src/testing.js";
import type { CellScalar, ChartDefinition, DocumentOp, Workbook } from "../src/types.js";

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

const CELLS: CellScalar[][] = [
  [null, "North", "South"],
  ["Jan", 1, 2],
  ["Feb", 3, 4],
];

async function setup(readOnly = false) {
  const columns = ["a", "b", "c", "d", "e", "f"].map((key) => ({
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
  Object.defineProperties(host, { clientWidth: { value: 900 }, clientHeight: { value: 500 } });
  document.body.appendChild(host);
  const grid = new GridImpl(host, { workbook, readOnly: false, config: { ribbon: true } }, store);
  grids.push(grid);
  // Await the ribbon's lazy mount, but do not load the panels.
  await import(RIBBON_MODULE);

  const patches = CELLS.flatMap((row, r) =>
    row.map((value, col): DocumentOp => ({
      op: "set",
      addr: { sheet: "s1", row: r, col },
      value: { kind: "literal", value },
    })),
  );
  expect(grid.applyTransaction({ patches }).status).toBe("applied");
  if (readOnly) grid.setReadOnly(true);

  // Count the grid operations each panel action makes.
  const setChart = grid.setChart.bind(grid);
  const chartOps: ChartDefinition[] = [];
  grid.setChart = (chart, sheet) => {
    chartOps.push(structuredClone(chart));
    return setChart(chart, sheet);
  };

  const scope = ".sheetwrite-ribbon-panel:not([hidden])";
  const control = (label: string): HTMLButtonElement => {
    const element = host.querySelector<HTMLButtonElement>(`${scope} [aria-label="${label}"]`);
    if (element === null) throw new Error(`no ribbon control "${label}"`);
    return element;
  };
  const openTab = (name: string): void => {
    const tab = [...host.querySelectorAll<HTMLElement>('[role="tab"]')].find(
      (candidate) => candidate.textContent === name,
    );
    if (tab === undefined) throw new Error(`no ribbon tab "${name}"`);
    tab.click();
  };
  const panel = (): HTMLElement | null => host.querySelector(".sheetwrite-panel");
  const field = (label: string): HTMLInputElement => {
    const labels = [...host.querySelectorAll<HTMLElement>(".sheetwrite-panel-field")];
    const match = labels.find(
      (candidate) => candidate.querySelector(".sheetwrite-panel-label")?.textContent === label,
    );
    const input = match?.querySelector<HTMLInputElement>("input, select");
    if (input == null) throw new Error(`no panel field "${label}"`);
    return input;
  };
  const key = (target: Element, name: string) =>
    target.dispatchEvent(
      new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true }),
    );
  const press = (target: Element) =>
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 0 }));
  const selectRange = (r0: number, c0: number, r1: number, c1: number) =>
    grid.setSelection({
      kind: "range",
      range: { sheet: "s1", start: { row: r0, col: c0 }, end: { row: r1, col: c1 } },
    });
  return { grid, host, chartOps, control, openTab, panel, field, key, press, selectRange };
}

const range = (r0: number, c0: number, r1: number, c1: number) => ({
  sheet: "s1",
  start: { row: r0, col: c0 },
  end: { row: r1, col: c1 },
});

/** Insert › Chart over A1:C3, which has text headers on both edges. */
async function insertedChart() {
  const context = await setup();
  context.openTab("Insert");
  context.selectRange(0, 0, 2, 2);
  context.press(context.control("Chart"));
  // Wait for the same pending load and let the button's command finish.
  await loadPanels(context.grid);
  await Promise.resolve();
  return context;
}
it("manages formula names through undo, redo and remote changes", async () => {
  const { grid, host, control, openTab, field, press } = await setup();
  openTab("Formulas");
  press(control("Name Manager"));
  await loadPanels(grid);
  await Promise.resolve();
  field("Name").value = "Rate";
  field("Refers to").value = "=0.2";
  const save = host.querySelector<HTMLButtonElement>('[data-focus-key="save-name"]');
  if (save === null) throw new Error("missing name save button");
  press(save);
  expect(grid.store.getWorkbook().namedRanges).toEqual([{ name: "Rate", formula: "=0.2" }]);
  grid.undo();
  expect(grid.store.getWorkbook().namedRanges).toEqual([]);
  grid.redo();
  expect(grid.store.getWorkbook().namedRanges).toEqual([{ name: "Rate", formula: "=0.2" }]);

  const edit = host.querySelector<HTMLButtonElement>('[aria-label="Edit Rate (Workbook)"]');
  if (edit === null) throw new Error("missing name edit button");
  press(edit);
  field("Refers to").value = "=0.3";
  const editSave = host.querySelector<HTMLButtonElement>('[data-focus-key="save-name"]');
  if (editSave === null) throw new Error("missing edit save button");
  press(editSave);
  expect(grid.store.getWorkbook().namedRanges?.[0]?.formula).toBe("=0.3");
  grid.undo();
  expect(grid.store.getWorkbook().namedRanges?.[0]?.formula).toBe("=0.2");

  expect(
    grid.applyRemoteOperations([
      { op: "setNamedRange", namedRange: { name: "Other", formula: "=7" } },
    ]).status,
  ).toBe("applied");
  expect(host.querySelector('[aria-label="Edit Other (Workbook)"]')).not.toBeNull();
  const remove = host.querySelector<HTMLButtonElement>('[aria-label="Delete Other (Workbook)"]');
  if (remove === null) throw new Error("missing name delete button");
  press(remove);
  expect(grid.store.getWorkbook().namedRanges?.map((name) => name.name)).toEqual(["Rate"]);
  grid.undo();
  expect(grid.store.getWorkbook().namedRanges?.map((name) => name.name)).toEqual(["Rate", "Other"]);
});

it("lists the seven chart kinds under Insert › Chart and inserts the picked kind in one step", async () => {
  const { grid, host, chartOps, control, openTab, press, selectRange } = await setup();
  openTab("Insert");
  selectRange(0, 0, 2, 2);

  press(control("Chart options"));
  const items = [...host.querySelectorAll<HTMLElement>(".sheetwrite-ribbon-menu-item")];
  expect(items.map((item) => item.textContent)).toEqual([
    "Column",
    "Bar",
    "Line",
    "Area",
    "Pie",
    "Doughnut",
    "Scatter",
  ]);
  expect(items.map((item) => item.querySelector<HTMLElement>("[data-icon]")?.dataset.icon)).toEqual(
    [
      "chartColumn",
      "chartBar",
      "chartLine",
      "chartArea",
      "chartPie",
      "chartDoughnut",
      "chartScatter",
    ],
  );

  const line = items.find((item) => item.textContent === "Line");
  if (line === undefined) throw new Error("no Line item");
  press(line);
  await loadPanels(grid);
  await Promise.resolve();

  expect(chartOps.map((chart) => chart.kind)).toEqual(["line"]);
  expect(grid.getCharts("s1").map((chart) => chart.kind)).toEqual(["line"]);
  grid.undo();
  expect(grid.getCharts("s1")).toEqual([]);
});

it("commits each chart kind, title and legend change as one setChart", async () => {
  const { grid, chartOps, host, field, key, press } = await insertedChart();
  chartOps.length = 0;

  const bar = host.querySelector<HTMLElement>('[role="radio"][data-kind="bar"]');
  if (bar === null) throw new Error("no Bar kind");
  press(bar);
  expect(chartOps.map((chart) => chart.kind)).toEqual(["bar"]);
  expect(bar.getAttribute("aria-checked")).toBe("true");

  // Arrow keys move through the radio group and select as they go.
  key(bar, "ArrowRight");
  expect(chartOps.map((chart) => chart.kind)).toEqual(["bar", "line"]);
  expect((document.activeElement as HTMLElement).dataset.kind).toBe("line");

  const title = field("Chart title");
  title.focus();
  title.value = "Sales";
  key(title, "Enter");
  expect(chartOps).toHaveLength(3);
  expect(chartOps.at(-1)?.title).toBe("Sales");
  // Blur after Enter commits nothing new: the value did not change.
  title.blur();
  expect(chartOps).toHaveLength(3);

  const yTitle = field("Vertical axis title");
  yTitle.focus();
  yTitle.value = "Units";
  yTitle.blur();
  expect(chartOps).toHaveLength(4);
  expect(chartOps.at(-1)?.axes).toEqual({ yTitle: "Units" });

  const legend = field("Legend position") as unknown as HTMLSelectElement;
  legend.value = "bottom";
  legend.dispatchEvent(new Event("change", { bubbles: true }));
  expect(chartOps).toHaveLength(5);
  expect(grid.getCharts("s1")[0]?.legend).toBe("bottom");

  legend.value = "";
  legend.dispatchEvent(new Event("change", { bubbles: true }));
  expect(grid.getCharts("s1")[0]).not.toHaveProperty("legend");
});

it("validates series ranges as A1 text and shows the error inline", async () => {
  const { grid, chartOps, host, key } = await insertedChart();
  chartOps.length = 0;
  const values = host.querySelectorAll<HTMLInputElement>(".sheetwrite-panel-series input")[1];
  if (values === undefined) throw new Error("no series Values field");
  expect(values.value).toBe("B2:B3");

  values.focus();
  values.value = "B2:B";
  key(values, "Enter");
  expect(chartOps).toHaveLength(0);
  expect(values.getAttribute("aria-invalid")).toBe("true");
  const error = host.querySelector(`#${values.getAttribute("aria-describedby")}`);
  expect(error?.textContent).toContain("Enter a cell or range");

  values.value = "Sheet1!B1:B3";
  key(values, "Enter");
  expect(chartOps).toHaveLength(1);
  expect(values.hasAttribute("aria-invalid")).toBe(false);
  expect(grid.getCharts("s1")[0]?.series[0]?.values).toEqual(range(0, 1, 2, 1));

  // Undo comes from elsewhere: the field shows the restored range.
  values.blur();
  grid.undo();
  expect(values.value).toBe("B2:B3");
});

it("inserts nothing when the grid is destroyed while the panel chunk loads", async () => {
  const { grid, chartOps, control, openTab, press, selectRange } = await setup();
  openTab("Insert");
  selectRange(0, 0, 2, 2);

  press(control("Chart"));
  const loading = loadPanels(grid);
  grid.destroy();

  // The grid's abort reason: command runners treat it as cancellation.
  await expect(loading).rejects.toMatchObject({ name: "AbortError" });
  expect(chartOps).toEqual([]);
});

it("keeps a draft on the first Escape and closes on the second", async () => {
  const { panel, field, key } = await insertedChart();
  const title = field("Chart title");
  title.focus();
  title.value = "Draft";

  key(title, "Escape");
  expect(title.value).toBe("");
  expect(panel()).not.toBeNull();
  key(title, "Escape");
  expect(panel()).toBeNull();
});

it("disables Insert › Chart without a selection and on a read-only grid", async () => {
  const { grid, control, openTab, selectRange } = await setup();
  openTab("Insert");
  grid.setSelection(null);
  expect(control("Chart").disabled).toBe(true);
  selectRange(0, 0, 1, 1);
  expect(control("Chart").disabled).toBe(false);
  grid.setReadOnly(true);
  expect(control("Chart").disabled).toBe(true);
});

it("disables Insert › PivotTable on the default engine and says why", async () => {
  const { grid, control, openTab, selectRange } = await setup();
  expect(storeEngine(grid.store)?.computesPivots).toBe(false);
  openTab("Insert");
  selectRange(0, 0, 2, 2);

  const pivot = control("PivotTable");
  expect(pivot.disabled).toBe(true);
  expect(pivot.title).toBe("Pivot tables need the full engine (@sheetwrite/formulas).");
  expect(pivot.getAttribute("aria-description")).toBe(pivot.title);
});

it("explains the formula in the focus cell from metadata and follows the selection", async () => {
  const { grid, control, openTab, panel, press } = await setup();
  const formula = "=ROUND(SUM(B2:C3), 1)+NOPE(B2)";
  grid.applyTransaction({
    patches: [
      {
        op: "set",
        addr: { sheet: "s1", row: 0, col: 3 },
        value: { kind: "formula", src: formula },
      },
    ],
  });
  grid.setSelection({ kind: "cell", addr: { sheet: "s1", row: 0, col: 3 } });
  openTab("Formulas");
  press(control("Explain Formula"));
  await loadPanels(grid);
  // The panel reads the function list on open; this awaits the same table load.
  await listFunctions(grid.store);
  await Promise.resolve();

  const text = panel()?.textContent ?? "";
  expect(text).toContain("Formula in D1");
  expect(text).toContain("ROUND(number, digits)");
  expect(text).toContain("digits: 1");
  expect(text).toContain("B2:C3: 4 cells on this sheet");
  expect(text).toContain("NOPE is not a known function. The cell shows #NAME?.");

  grid.setSelection({ kind: "cell", addr: { sheet: "s1", row: 0, col: 1 } });
  expect(panel()?.textContent).toContain("Select a cell with a formula to explain it.");
});

it.each([
  ["loads panels only on first use", "./packages/core/test/panel-loading-probe.ts"],
  [
    "edits the full-engine field list with one setPivot per action",
    "./packages/core/test/pivot-panel-probe.ts",
  ],
  [
    "shows a failed ribbon load to the user and still reports it",
    "./packages/core/test/ribbon-fallback-probe.ts",
  ],
])("%s", async (_description, path) => {
  // Isolate process-wide engine selection and module loading mocks.
  const probe = Bun.spawn([process.execPath, "--preload", "./test-setup.ts", path], {
    cwd: new URL("../../..", import.meta.url).pathname,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    probe.exited,
    new Response(probe.stdout).text(),
    new Response(probe.stderr).text(),
  ]);
  expect({ exitCode, stdout, stderr }).toEqual({ exitCode: 0, stdout: "", stderr: "" });
});
