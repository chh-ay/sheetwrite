import { afterEach, beforeAll, describe, expect, it } from "bun:test";

import { MAX_CHART_SERIES, MAX_CHARTS_PER_SHEET } from "../src/chart-definition.js";
import { DocumentController } from "../src/document-controller.js";
import {
  SnapshotResourceError,
  validateDocumentOperationShape,
  validateWorkbookSnapshot,
} from "../src/document-protocol.js";
import { initSheetwrite } from "../src/grid.js";
import { rebaseDocumentOperations } from "../src/rebase.js";
import { SheetwriteStore } from "../src/store.js";
import type { DocumentOp, Workbook, WorkbookSnapshot } from "../src/types.js";
import type { ChartDefinition, ChartRange } from "../src/types/chart.js";
import { range, sheet } from "./fixtures.js";

beforeAll(async () => {
  await initSheetwrite();
});

const stores: SheetwriteStore[] = [];

afterEach(() => {
  for (const store of stores.splice(0)) store.dispose();
});

const ROWS = 10;

/** Values in B1:B4 and categories in A1:A4 of `source`, anchored at D3 of its owner. */
function chart(id: string, source = "data", anchorRow = 2): ChartDefinition {
  return {
    id,
    kind: "column",
    title: "Sales",
    anchor: { row: anchorRow, col: 3, offsetX: 4, offsetY: 2, width: 400, height: 300 },
    series: [{ values: range(source, 0, 1, 3, 1), categories: range(source, 0, 0, 3, 0) }],
  };
}

/** `data` owns `own`, which reads itself; `other` owns `cross`, which reads `data`. */
function workbook(): Workbook {
  return {
    activeSheet: "data",
    sheets: [
      { ...sheet("data"), charts: [chart("own")] },
      { ...sheet("other"), charts: [chart("cross")] },
    ],
  };
}

function setup(source: Workbook = workbook()) {
  const store = new SheetwriteStore(source);
  stores.push(store);
  const controller = new DocumentController({
    store,
    loadable: store,
    readOnly: () => false,
    epoch: () => 0,
    materializeVirtualColumns: (patches) => patches,
    onMutationRejected: () => {},
    onHistoryApplied: () => {},
  });
  return { store, controller };
}

function chartsOf(store: SheetwriteStore, sheetId: string): ChartDefinition[] | undefined {
  return store.getWorkbook().sheets.find((candidate) => candidate.id === sheetId)?.charts;
}

function chartOf(store: SheetwriteStore, sheetId: string, id: string): ChartDefinition | undefined {
  return chartsOf(store, sheetId)?.find((candidate) => candidate.id === id);
}

function commit(controller: DocumentController, patches: DocumentOp[]): void {
  expect(controller.commit(patches, "api").status).toBe("applied");
}

function sources(definition: ChartDefinition | undefined): ChartRange[] {
  return (definition?.series ?? []).flatMap((series) => [
    series.values,
    ...(series.categories === undefined ? [] : [series.categories]),
  ]);
}

function snapshotWith(charts: unknown[], rowCount = ROWS): unknown {
  return {
    schemaVersion: 1,
    workbook: { activeSheet: "data" },
    sheets: [{ ...sheet("data", rowCount), order: 0, charts, cells: [] }],
  };
}

describe("chart persistence", () => {
  it("round-trips charts through a snapshot, including cross-sheet sources and #REF!", () => {
    const source = workbook();
    const own = source.sheets[0]?.charts?.[0];
    if (!own) throw new Error("fixture chart missing");
    own.series.push({ name: "Lost", values: "#REF!" });
    const owner = source.sheets[0];
    if (!owner) throw new Error("fixture sheet missing");
    // Deliberately reverse identifier order so snapshot validation cannot reorder drawings.
    owner.charts = [chart("z-last-id"), own, chart("a-first-id")];
    const { store } = setup(source);

    const exported = store.exportSnapshot();
    const reopened = SheetwriteStore.fromSnapshot(JSON.parse(JSON.stringify(exported)));
    stores.push(reopened);

    expect(chartsOf(reopened, "data")).toEqual(owner.charts);
    expect(chartsOf(reopened, "other")).toEqual([chart("cross")]);
    expect(reopened.exportSnapshot().sheets).toEqual(exported.sheets);
  });

  it("rejects over-limit and malformed charts in snapshots and operations", () => {
    const oversizedSeries = {
      ...chart("wide"),
      series: Array.from({ length: MAX_CHART_SERIES + 1 }, () => chart("wide").series[0]),
    };
    const cases: Array<[label: string, input: unknown, path: string, code: string]> = [
      [
        "too many charts",
        snapshotWith(
          Array.from({ length: MAX_CHARTS_PER_SHEET + 1 }, (_, index) => chart(`c${index}`)),
        ),
        "sheets[0].charts",
        "resource-limit",
      ],
      [
        "too many series",
        snapshotWith([oversizedSeries]),
        "sheets[0].charts[0].series",
        "resource-limit",
      ],
      [
        "source below the sheet",
        snapshotWith([{ ...chart("low"), series: [{ values: range("data", 0, 1, ROWS, 1) }] }]),
        "sheets[0].charts",
        "out-of-bounds",
      ],
      [
        "source on a missing sheet",
        snapshotWith([chart("ghost", "missing")]),
        "sheets[0].charts",
        "out-of-bounds",
      ],
      [
        "duplicate ids",
        snapshotWith([chart("same"), chart("same")]),
        "sheets[0].charts",
        "out-of-bounds",
      ],
      [
        "unknown kind",
        snapshotWith([{ ...chart("radar"), kind: "radar" }]),
        "sheets[0].charts[0]",
        "invalid-value",
      ],
    ];
    for (const [label, input, path, code] of cases) {
      const result = validateWorkbookSnapshot(input);
      expect(result.ok, label).toBe(false);
      if (result.ok) continue;
      expect(result.errors, label).toContainEqual(expect.objectContaining({ path, code }));
    }

    expect(
      validateDocumentOperationShape({ op: "setChart", sheet: "data", chart: oversizedSeries }),
    ).toContainEqual(
      expect.objectContaining({ path: "operation.chart.series", code: "resource-limit" }),
    );

    const crowded = workbook();
    const data = crowded.sheets[0];
    if (!data) throw new Error("fixture sheet missing");
    data.charts = Array.from({ length: MAX_CHARTS_PER_SHEET + 1 }, (_, index) =>
      chart(`c${index}`),
    );
    let thrown: unknown;
    try {
      stores.push(new SheetwriteStore(crowded));
    } catch (error) {
      thrown = error;
    }
    // The chart limit itself, not some other allocation guard, refuses the workbook.
    expect(thrown).toBeInstanceOf(SnapshotResourceError);
    expect(thrown).toMatchObject({
      code: "resource-limit",
      limit: MAX_CHARTS_PER_SHEET,
      actual: MAX_CHARTS_PER_SHEET + 1,
    });
  });

  it("undoes and redoes chart creation, replacement and removal exactly", () => {
    const { store, controller } = setup();
    const moved = { ...chart("own"), anchor: { ...chart("own").anchor, row: 6, col: 1 } };

    commit(controller, [{ op: "setChart", sheet: "data", chart: chart("added") }]);
    commit(controller, [{ op: "setChart", sheet: "data", chart: moved }]);
    commit(controller, [{ op: "removeChart", sheet: "other", id: "cross" }]);
    expect(chartsOf(store, "data")).toEqual([moved, chart("added")]);
    expect(chartsOf(store, "other")).toEqual([]);

    controller.undo();
    expect(chartOf(store, "other", "cross")).toEqual(chart("cross"));
    controller.undo();
    expect(chartOf(store, "data", "own")).toEqual(chart("own"));
    controller.undo();
    expect(chartOf(store, "data", "added")).toBeUndefined();

    controller.redo();
    controller.redo();
    controller.redo();
    expect(chartsOf(store, "data")).toEqual([moved, chart("added")]);
    expect(chartsOf(store, "other")).toEqual([]);
  });

  it("shrinks partly deleted sources and turns fully deleted ones into #REF!", () => {
    const { store } = setup();

    store.applyTransaction({ patches: [{ op: "removeRows", sheet: "data", at: 0, count: 2 }] });
    expect(sources(chartOf(store, "data", "own"))).toEqual([
      range("data", 0, 1, 1, 1),
      range("data", 0, 0, 1, 0),
    ]);
    expect(chartOf(store, "data", "own")?.anchor.row).toBe(0);

    store.applyTransaction({ patches: [{ op: "removeColumns", sheet: "data", at: 1, count: 1 }] });
    expect(sources(chartOf(store, "data", "own"))).toEqual(["#REF!", range("data", 0, 0, 1, 0)]);
    expect(sources(chartOf(store, "other", "cross"))).toEqual(["#REF!", range("data", 0, 0, 1, 0)]);
    expect(chartOf(store, "data", "own")?.anchor.col).toBe(2);

    store.applyTransaction({ patches: [{ op: "removeRows", sheet: "data", at: 0, count: 2 }] });
    expect(sources(chartOf(store, "other", "cross"))).toEqual(["#REF!", "#REF!"]);
  });

  it("undo of row, column and move edits restores every touched chart exactly", () => {
    const edits: DocumentOp[] = [
      { op: "removeRows", sheet: "data", at: 0, count: 4 },
      { op: "removeColumns", sheet: "data", at: 0, count: 2 },
      { op: "moveRows", sheet: "data", from: 2, count: 3, to: 6 },
      { op: "moveColumns", sheet: "data", from: 0, count: 1, to: 2 },
    ];
    for (const edit of edits) {
      const { store, controller } = setup();

      commit(controller, [edit]);
      expect(chartOf(store, "data", "own"), edit.op).not.toEqual(chart("own"));
      controller.undo();

      expect(chartsOf(store, "data"), edit.op).toEqual([chart("own")]);
      expect(chartsOf(store, "other"), edit.op).toEqual([chart("cross")]);
    }
  });

  it("restores a replaced definition after undoing a later deletion over it", () => {
    const { store, controller } = setup();
    const replaced = { ...chart("own"), title: "Replaced" };

    commit(controller, [{ op: "setChart", sheet: "data", chart: replaced }]);
    commit(controller, [{ op: "removeRows", sheet: "data", at: 0, count: 4 }]);
    controller.undo();
    expect(chartOf(store, "data", "own")).toEqual(replaced);
    controller.undo();

    expect(chartOf(store, "data", "own")).toEqual(chart("own"));
  });

  it("turns sources on a removed sheet into #REF! and restores them on undo", () => {
    const { store, controller } = setup();

    commit(controller, [{ op: "removeSheet", sheet: "data" }]);
    expect(sources(chartOf(store, "other", "cross"))).toEqual(["#REF!", "#REF!"]);
    expect(validateWorkbookSnapshot(store.exportSnapshot()).ok).toBe(true);

    controller.undo();
    expect(chartsOf(store, "data")).toEqual([chart("own")]);
    expect(chartsOf(store, "other")).toEqual([chart("cross")]);
  });

  it("rebases pending charts across row inserts and conflicts on replacement or source deletion", () => {
    const remote: DocumentOp[] = [{ op: "addRows", sheet: "data", at: 0, count: 2 }];

    const rebased = rebaseDocumentOperations(
      [{ op: "setChart", sheet: "data", chart: chart("own") }],
      remote,
    );

    const shifted: ChartDefinition = {
      ...chart("own", "data", 4),
      series: [{ values: range("data", 2, 1, 5, 1), categories: range("data", 2, 0, 5, 0) }],
    };
    expect(rebased).toEqual({
      status: "rebased",
      operations: [{ op: "setChart", sheet: "data", chart: shifted }],
    });
    expect(
      rebaseDocumentOperations(
        [{ op: "setChart", sheet: "data", chart: chart("own") }],
        [{ op: "setChart", sheet: "data", chart: chart("own", "data", 5) }],
      ).status,
    ).toBe("conflict");
    expect(
      rebaseDocumentOperations(
        [{ op: "setChart", sheet: "other", chart: chart("cross") }],
        [{ op: "removeRows", sheet: "data", at: 1, count: 1 }],
      ).status,
    ).toBe("conflict");
  });

  it("conflicts when a pending new sheet's chart reads a sheet whose rows moved", () => {
    const added: DocumentOp = {
      op: "addSheet",
      sheet: { ...sheet("report"), order: 2, charts: [chart("cross")], cells: [] },
    };

    const rebased = rebaseDocumentOperations(
      [added],
      [{ op: "moveRows", sheet: "data", from: 0, count: 2, to: 5 }],
    );

    // A move has no rebase mapping; keeping the old rows would chart other data.
    expect(rebased).toMatchObject({
      status: "conflict",
      conflict: { code: "unsupported-structural" },
    });
  });

  it("conflicts when a pending new sheet's chart reads a removed sheet", () => {
    const added: DocumentOp = {
      op: "addSheet",
      sheet: { ...sheet("report"), order: 2, charts: [chart("cross")], cells: [] },
    };

    const rebased = rebaseDocumentOperations([added], [{ op: "removeSheet", sheet: "data" }]);

    // The store refuses a chart source on a missing sheet, so "rebased" would fail on apply.
    expect(rebased).toMatchObject({ status: "conflict", conflict: { code: "sheet-removed" } });
  });

  it("keeps retained opaque XLSX graphs when a native chart is set or removed", () => {
    const source: Workbook = {
      ...workbook(),
      xlsxSource: {
        parts: [
          {
            name: "xl/charts/chart1.xml",
            contentType: "application/vnd.openxmlformats-officedocument.drawingml.chart+xml",
            method: 0,
            crc32: 0,
            uncompressedSize: 0,
            data: "",
          },
        ],
        graphs: [
          {
            owner: "sheet",
            sheetId: "data",
            type: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing",
            target: "xl/charts/chart1.xml",
            parts: ["xl/charts/chart1.xml"],
            dependencies: [{ sheetId: "data", name: "data", scope: "values", digest: "0" }],
          },
        ],
      },
    };
    const { store } = setup(source);

    expect(
      store.applyTransaction({
        patches: [
          { op: "setChart", sheet: "data", chart: chart("added") },
          { op: "removeChart", sheet: "data", id: "own" },
        ],
      }).status,
    ).toBe("applied");

    const retained: WorkbookSnapshot["workbook"]["xlsxSource"] = store.getWorkbook().xlsxSource;
    expect(retained?.graphs.map((graph) => graph.target)).toEqual(["xl/charts/chart1.xml"]);
    expect(retained?.dropped ?? []).toEqual([]);
  });
});
