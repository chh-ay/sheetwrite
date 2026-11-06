import { afterEach, beforeAll, describe, expect, it } from "bun:test";

import { MAX_CHART_POINTS } from "../src/chart-definition.js";
import { resolveChartView, subscribeChartChanges } from "../src/charts-live.js";
import { createGrid, initSheetwrite } from "../src/grid.js";
import type {
  ChartChangeEvent,
  ChartDefinition,
  DocumentOp,
  Range,
  Workbook,
} from "../src/index.js";
import { SheetwriteStore } from "../src/store.js";
import { storeEngine } from "../src/store/engine-registry.js";
import { installCanvasTestStubs } from "../src/testing.js";
import { range, sheet } from "./fixtures.js";

beforeAll(async () => {
  await initSheetwrite();
});

const stores: SheetwriteStore[] = [];

afterEach(() => {
  for (const store of stores.splice(0)) store.dispose();
});

function workbook(rowCount: number, extraSheets = 0): Workbook {
  const sheets = [sheet("data", rowCount), sheet("other", rowCount)];
  for (let index = 0; index < extraSheets; index++) sheets.push(sheet(`extra${index}`, rowCount));
  return { activeSheet: "data", sheets };
}

function chart(id: string, values: Range, categories?: Range): ChartDefinition {
  return {
    id,
    kind: "column",
    anchor: { row: 0, col: 3, offsetX: 0, offsetY: 0, width: 400, height: 300 },
    series: [{ values, ...(categories ? { categories } : {}) }],
  };
}

function apply(store: SheetwriteStore, patches: DocumentOp[]): void {
  expect(store.applyTransaction({ patches }).status).toBe("applied");
}

function set(sheetId: string, row: number, col: number, value: number | string): DocumentOp {
  return { op: "set", addr: { sheet: sheetId, row, col }, value: { kind: "literal", value } };
}

function formula(sheetId: string, row: number, col: number, src: string): DocumentOp {
  return { op: "set", addr: { sheet: sheetId, row, col }, value: { kind: "formula", src } };
}

function setup(rowCount = 10, extraSheets = 0) {
  const store = new SheetwriteStore(workbook(rowCount, extraSheets));
  stores.push(store);
  apply(store, [
    set("data", 0, 0, "Q1"),
    set("data", 1, 0, "Q2"),
    set("data", 0, 1, 10),
    set("data", 1, 1, 20),
    {
      op: "setChart",
      sheet: "data",
      chart: chart("sales", range("data", 0, 1, 1, 1), range("data", 0, 0, 1, 0)),
    },
  ]);

  const events: ChartChangeEvent[] = [];
  const unsubscribe = subscribeChartChanges(store, (event) => events.push(event));
  return { store, events, unsubscribe };
}

describe("chart change events", () => {
  it("names a chart once when an edit touches its series and stays silent otherwise", () => {
    const { store, events } = setup();

    // Two cells of the same series in one commit still produce one event naming the chart once.
    apply(store, [set("data", 0, 1, 11), set("data", 1, 1, 21)]);
    expect(events).toHaveLength(1);
    expect(events[0]?.charts).toEqual([{ sheet: "data", id: "sales" }]);

    // Outside every series range: same sheet, another column, and another sheet at the same address.
    apply(store, [set("data", 5, 2, 1), set("other", 0, 1, 99)]);
    expect(events).toHaveLength(1);
  });

  it("matches only charts whose source overlaps an edit on the edited sheet", () => {
    const { store, events } = setup(10, 40);
    const patches: DocumentOp[] = [];
    for (let index = 0; index < 40; index++) {
      for (let slot = 0; slot < 50; slot++) {
        patches.push({
          op: "setChart",
          sheet: `extra${index}`,
          chart: chart(`c${slot}`, range(`extra${index}`, slot % 10, 2, slot % 10, 2)),
        });
      }
    }
    apply(store, patches);
    events.length = 0;

    // Fifty entries span more than one 32-entry index block on this sheet.
    apply(store, [set("extra5", 3, 2, 1)]);
    expect(events).toHaveLength(1);
    expect(events[0]?.charts.map((ref) => ref.id).sort()).toEqual([
      "c13",
      "c23",
      "c3",
      "c33",
      "c43",
    ]);
    expect(events[0]?.charts.every((ref) => ref.sheet === "extra5")).toBe(true);

    // The same address on a sheet with no matching source must not reach those charts.
    apply(store, [set("data", 3, 2, 1)]);
    expect(events).toHaveLength(1);
  });

  it("follows recalculated values when a series reads a formula", () => {
    const { store, events } = setup();
    apply(store, [formula("data", 1, 1, "=C9*2")]);
    expect(events).toHaveLength(1);

    // C9 sits outside the series, but the series cell's value changes through the formula.
    apply(store, [set("data", 8, 2, 7)]);
    expect(events).toHaveLength(2);
    expect(resolveChartView(store, "data", "sales")?.series[0]?.values).toEqual([10, 14]);
  });

  it("follows a spill written outside the series that reaches into it", () => {
    const { store, events } = setup();
    apply(store, [
      { op: "setChart", sheet: "data", chart: chart("spill", range("data", 4, 1, 6, 1)) },
    ]);
    events.length = 0;

    // A4 spills three rows by two columns, covering the series B5:B7 from outside it.
    apply(store, [set("data", 9, 2, 1), formula("data", 4, 0, "=SEQUENCE(3,2,C10)")]);
    expect(events.at(-1)?.charts).toContainEqual({ sheet: "data", id: "spill" });

    // Changing the spill's input, outside every series, must refresh the chart.
    const before = events.length;
    apply(store, [set("data", 9, 2, 100)]);
    expect(events).toHaveLength(before + 1);
    expect(resolveChartView(store, "data", "spill")?.series[0]?.values).toEqual([101, 103, 105]);
  });

  it("follows an existing spill that grows into a previously empty series", () => {
    const { store, events } = setup();
    apply(store, [set("data", 9, 2, 1), formula("data", 4, 0, "=SEQUENCE(C10,2)")]);
    apply(store, [
      { op: "setChart", sheet: "data", chart: chart("growth", range("data", 5, 1, 6, 1)) },
    ]);
    events.length = 0;

    apply(store, [set("data", 9, 2, 3)]);
    expect(events).toHaveLength(1);
    expect(events[0]?.charts).toContainEqual({ sheet: "data", id: "growth" });
    expect(resolveChartView(store, "data", "growth")?.series[0]?.values).toEqual([4, 6]);
  });

  it("reports number-format edits on a series and ignores other styling", () => {
    const { store, events } = setup();
    apply(store, [
      { op: "setRangeStyle", range: range("data", 0, 1, 0, 1), style: { bold: true } },
    ]);
    expect(events).toHaveLength(0);

    apply(store, [
      { op: "setRangeStyle", range: range("data", 0, 1, 0, 1), style: { numberFormat: "0%" } },
    ]);
    expect(events).toHaveLength(1);

    apply(store, [{ op: "setColumn", sheet: "data", col: 2, patch: { numberFormat: "0.0" } }]);
    expect(events).toHaveLength(1);
    apply(store, [{ op: "setColumn", sheet: "data", col: 1, patch: { numberFormat: "0.0" } }]);
    expect(events).toHaveLength(2);
  });

  const structuralCases: Array<{
    name: string;
    patch: DocumentOp;
    row: number;
    col: number;
  }> = [
    { name: "addRows", patch: { op: "addRows", sheet: "data", at: 0, count: 1 }, row: 3, col: 1 },
    {
      name: "removeRows",
      patch: { op: "removeRows", sheet: "data", at: 0, count: 1 },
      row: 1,
      col: 1,
    },
    {
      name: "moveRows",
      patch: { op: "moveRows", sheet: "data", from: 2, count: 1, to: 5 },
      row: 5,
      col: 1,
    },
    {
      name: "addColumns",
      patch: {
        op: "addColumns",
        sheet: "data",
        at: 0,
        columns: [{ key: "new", header: "New", width: 80, type: "number" }],
      },
      row: 2,
      col: 2,
    },
    {
      name: "removeColumns",
      patch: { op: "removeColumns", sheet: "data", at: 0, count: 1 },
      row: 2,
      col: 0,
    },
    {
      name: "moveColumns",
      patch: { op: "moveColumns", sheet: "data", from: 1, count: 1, to: 3 },
      row: 2,
      col: 3,
    },
  ];

  for (const { name, patch, row, col } of structuralCases) {
    it(`reports source and owner hits after ${name} and tracks the rewritten source`, () => {
      const store = new SheetwriteStore(workbook(10));
      stores.push(store);
      apply(store, [
        set("data", 2, 1, 17),
        {
          op: "setChart",
          sheet: "other",
          chart: chart("cross", range("data", 2, 1, 2, 1)),
        },
        {
          op: "setChart",
          sheet: "data",
          chart: {
            ...chart("anchor", range("other", 0, 0, 0, 0)),
            anchor: { row: 2, col: 1, offsetX: 0, offsetY: 0, width: 400, height: 300 },
          },
        },
      ]);
      const events: ChartChangeEvent[] = [];
      subscribeChartChanges(store, (event) => events.push(event));

      apply(store, [patch]);
      expect(events).toHaveLength(1);
      expect(events[0]?.charts).toHaveLength(2);
      expect(events[0]?.charts).toContainEqual({ sheet: "other", id: "cross" });
      expect(events[0]?.charts).toContainEqual({ sheet: "data", id: "anchor" });
      expect(resolveChartView(store, "data", "anchor")?.chart.anchor).toMatchObject({ row, col });
      expect(resolveChartView(store, "other", "cross")?.series[0]?.values).toEqual([17]);

      // A source edit at its new address must match the rebuilt index, not its old rectangle.
      apply(store, [set("data", row, col, 23)]);
      expect(events).toHaveLength(2);
      expect(events[1]?.charts).toEqual([{ sheet: "other", id: "cross" }]);
      expect(resolveChartView(store, "other", "cross")?.series[0]?.values).toEqual([23]);
    });
  }

  it("reports created and removed charts and stops after unsubscribe", () => {
    const { store, events, unsubscribe } = setup();
    apply(store, [
      { op: "setChart", sheet: "other", chart: chart("extra", range("data", 0, 1, 1, 1)) },
    ]);
    expect(events.at(-1)?.charts).toEqual([{ sheet: "other", id: "extra" }]);

    apply(store, [{ op: "removeChart", sheet: "other", id: "extra" }]);
    expect(events.at(-1)?.charts).toEqual([{ sheet: "other", id: "extra" }]);
    expect(resolveChartView(store, "other", "extra")).toBeNull();

    unsubscribe();
    apply(store, [set("data", 0, 1, 5)]);
    expect(events).toHaveLength(2);
  });
});

// Engine selection is process-wide, and only the full engine computes pivot output.
// So each case runs the full provider in its own process.
describe("chart change events for pivot output", () => {
  async function runProbe(scenario: string) {
    const probe = Bun.spawn(
      [
        process.execPath,
        "--preload",
        "./test-setup.ts",
        "./packages/core/test/charts-live-pivot-probe.ts",
        scenario,
      ],
      { cwd: new URL("../../..", import.meta.url).pathname, stdout: "pipe", stderr: "pipe" },
    );
    const [exitCode, stdout, stderr] = await Promise.all([
      probe.exited,
      new Response(probe.stdout).text(),
      new Response(probe.stderr).text(),
    ]);
    return { exitCode, stdout, stderr };
  }

  const passed = { exitCode: 0, stdout: "", stderr: "" };

  it("refreshes a chart that reads pivot output when the pivot source changes", async () => {
    expect(await runProbe("source-edit")).toEqual(passed);
  });

  it("refreshes a chart under the output when a pivot is set or removed", async () => {
    expect(await runProbe("set")).toEqual(passed);
    expect(await runProbe("remove")).toEqual(passed);
  });

  it("leaves a chart on a sheet without pivots alone when another sheet's pivot changes", async () => {
    expect(await runProbe("other-sheet")).toEqual(passed);
  });
});

it("plots the leaf items of worksheet pivots on the full engine, in its own process", async () => {
  // Engine selection is process-wide, so the full-engine checks run apart.
  const probe = Bun.spawn(
    [process.execPath, "test", "./packages/core/test/pivot-chart.full-engine.ts"],
    { cwd: new URL("../../..", import.meta.url).pathname, stdout: "pipe", stderr: "pipe" },
  );
  const [exitCode, stderr] = await Promise.all([probe.exited, new Response(probe.stderr).text()]);

  expect({ exitCode, failures: stderr.match(/^\(fail\).*$/gmu) ?? [] }).toEqual({
    exitCode: 0,
    failures: [],
  });
});

it("calls no engine when its grid is destroyed while the pivot views load", async () => {
  const restore = installCanvasTestStubs();
  const host = document.createElement("div");
  document.body.appendChild(host);
  const pivotChart: ChartDefinition = {
    ...chart("over-pivot", range("data", 0, 1, 1, 1)),
    series: [],
    pivot: "sales",
  };
  const grid = createGrid(host, {
    workbook: { activeSheet: "data", sheets: [{ ...sheet("data"), charts: [pivotChart] }] },
  });
  const engine = storeEngine(grid.store);
  if (engine === null) throw new Error("the grid's store has no engine");
  const calls: string[] = [];
  engine.setPivotView = () => {
    calls.push("setPivotView");
  };

  try {
    // The first resolve of a chart over a pivot starts loading the pivot views.
    resolveChartView(grid.store, "data", "over-pivot");
    grid.destroy();
    await import("../src/dashboard/dashboard-engine.js");
    // One macrotask turn runs every microtask queued by the load, including its callback.
    const { promise: turn, resolve } = Promise.withResolvers<void>();
    setTimeout(resolve, 0);
    await turn;

    expect(calls).toEqual([]);
  } finally {
    host.remove();
    restore();
  }
});

describe("resolveChartView", () => {
  it("resolves values, categories and number formats as plain data", () => {
    const { store } = setup();
    apply(store, [
      set("data", 1, 1, "n/a"),
      { op: "setRangeStyle", range: range("data", 0, 1, 0, 1), style: { numberFormat: "0.0%" } },
      {
        op: "setColumn",
        sheet: "data",
        col: 0,
        patch: { numberFormat: "@", numberLocale: "de-DE" },
      },
      {
        op: "setColumn",
        sheet: "data",
        col: 1,
        patch: { numberFormat: "#,##0", numberLocale: "fr-FR" },
      },
    ]);

    const view = resolveChartView(store, "data", "sales");
    expect(view?.series).toEqual([
      {
        name: "Series 1",
        values: [10, null],
        categories: ["Q1", "Q2"],
        categoryLevels: [],
        // The cell style wins over the column format, as in the painted grid.
        numberFormats: ["0.0%", "#,##0"],
        categoryFormats: ["@", "@"],
        numberLocale: "fr-FR",
        truncated: false,
        referenceError: false,
      },
    ]);
  });

  it("reads a category range of several columns as one level per column, the last innermost", () => {
    const { store, events } = setup();
    apply(store, [
      set("data", 3, 0, "East"),
      set("data", 5, 0, "West"),
      ...["Retail", "Online", "Retail", "Online"].map((segment, index) =>
        set("data", 3 + index, 1, segment),
      ),
      ...[1, 2, 3, 4].map((value, index) => set("data", 3 + index, 2, value)),
      {
        op: "setChart",
        sheet: "data",
        chart: chart("levels", range("data", 3, 2, 6, 2), range("data", 3, 0, 6, 1)),
      },
    ]);

    const series = resolveChartView(store, "data", "levels")?.series[0];
    expect(series?.values).toEqual([1, 2, 3, 4]);
    expect(series?.categories).toEqual(["Retail", "Online", "Retail", "Online"]);
    // A blank outer cell continues the group above it, as in Excel.
    expect(series?.categoryLevels.map((level) => level.labels)).toEqual([
      ["East", null, "West", null],
    ]);

    // An edit of an outer label redraws the chart.
    events.length = 0;
    apply(store, [set("data", 4, 0, "North")]);
    expect(events[0]?.charts).toContainEqual({ sheet: "data", id: "levels" });
    expect(resolveChartView(store, "data", "levels")?.series[0]?.categoryLevels[0]?.labels).toEqual(
      ["East", "North", "West", null],
    );
  });

  it("reads a category range of several rows as one level per row when the values run along a row", () => {
    const { store } = setup();
    apply(store, [
      set("data", 5, 0, 2024),
      set("data", 5, 2, 2025),
      ...["H1", "H2", "H1", "H2"].map((half, col) => set("data", 6, col, half)),
      ...[1, 2, 3, 4].map((value, col) => set("data", 7, col, value)),
      {
        op: "setChart",
        sheet: "data",
        chart: chart("rows", range("data", 7, 0, 7, 3), range("data", 5, 0, 6, 3)),
      },
    ]);

    const series = resolveChartView(store, "data", "rows")?.series[0];
    expect(series?.categories).toEqual(["H1", "H2", "H1", "H2"]);
    expect(series?.categoryLevels.map((level) => level.labels)).toEqual([[2024, null, 2025, null]]);
  });

  it("keeps one category level for a scatter chart, whose categories are x values", () => {
    const { store } = setup();
    apply(store, [
      {
        op: "setChart",
        sheet: "data",
        chart: {
          ...chart("xy", range("data", 0, 2, 1, 2), range("data", 0, 0, 1, 1)),
          kind: "scatter",
        },
      },
    ]);

    const series = resolveChartView(store, "data", "xy")?.series[0];
    expect(series?.categories).toEqual(["Q1", 10, "Q2", 20]);
    expect(series?.categoryLevels).toEqual([]);
  });

  it("reads the first nameRange cell and follows edits to that label", () => {
    const { store, events } = setup();
    apply(store, [
      set("data", 4, 2, "Revenue"),
      set("data", 5, 2, "Not the name"),
      {
        op: "setChart",
        sheet: "data",
        chart: {
          ...chart("named", range("data", 0, 1, 1, 1)),
          series: [
            {
              values: range("data", 0, 1, 1, 1),
              nameRange: range("data", 4, 2, 5, 2),
            },
          ],
        },
      },
    ]);
    expect(resolveChartView(store, "data", "named")?.series[0]?.name).toBe("Revenue");
    events.length = 0;

    apply(store, [set("data", 4, 2, 42)]);
    expect(events[0]?.charts).toEqual([{ sheet: "data", id: "named" }]);
    expect(resolveChartView(store, "data", "named")?.series[0]?.name).toBe("42");

    apply(store, [{ op: "clearRange", range: range("data", 4, 2, 4, 2), contents: true }]);
    expect(resolveChartView(store, "data", "named")?.series[0]?.name).toBe("Series 1");
  });

  it("keeps deleted values, categories and names explicit as reference errors", () => {
    const { store } = setup();
    apply(store, [
      {
        op: "setChart",
        sheet: "data",
        chart: {
          ...chart("broken", range("data", 0, 1, 1, 1)),
          series: [
            { values: "#REF!" },
            { values: range("data", 0, 1, 1, 1), categories: "#REF!" },
            { values: range("data", 0, 1, 1, 1), nameRange: "#REF!" },
          ],
        },
      },
    ]);

    const series = resolveChartView(store, "data", "broken")?.series;
    expect(series?.map((entry) => entry.referenceError)).toEqual([true, true, true]);
    expect(series?.[0]?.values).toEqual([]);
    expect(series?.[1]?.values).toEqual([10, 20]);
    expect(series?.[1]?.categories).toEqual([]);
    expect(series?.[2]?.name).toBe("#REF!");
  });

  it("drops points past the limit in row-major order", () => {
    const rows = MAX_CHART_POINTS / 2 + 1;
    const store = new SheetwriteStore(workbook(rows));
    stores.push(store);
    apply(store, [
      set("data", rows - 2, 1, 4),
      set("data", rows - 1, 0, 5),
      { op: "setChart", sheet: "data", chart: chart("wide", range("data", 0, 0, rows - 1, 1)) },
    ]);

    const series = resolveChartView(store, "data", "wide")?.series[0];
    expect(series?.values).toHaveLength(MAX_CHART_POINTS);
    expect(series?.values.at(-1)).toBe(4);
    expect(series?.truncated).toBe(true);
  });
});
