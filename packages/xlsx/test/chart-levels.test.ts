import { beforeAll, describe, expect, it } from "bun:test";

import {
  type ChartDefinition,
  type ChartSeriesView,
  type DashboardExport,
  initSheetwrite,
  resolveChartView,
  SheetwriteStore,
  type WorkbookSnapshot,
} from "@sheetwrite/core";

import { sheetwriteWorkbookBackend as backend } from "../src/index.js";
import {
  book,
  columns,
  editParts,
  partNames,
  partText,
  range,
  sheet,
  sheetAt,
  withoutSidecar,
} from "./workbook-fixtures.js";

beforeAll(async () => {
  await initSheetwrite();
});

const chartPart = (bytes: Uint8Array) =>
  partText(bytes, partNames(bytes).find((name) => /^xl\/charts\/[^/]+\.xml$/u.test(name)) ?? "");

/** Regions in A1:A4 (blank where a group continues), segments in B1:B4, amounts in C1:C4. */
function rangeSnapshot(chart: Partial<ChartDefinition> = {}): WorkbookSnapshot {
  return book([
    sheet(
      "data",
      "Data",
      [
        ["East", "Retail", 1],
        [null, "Online", 2],
        ["West", "Retail", 3],
        [null, "Online", 4],
      ],
      {
        rowCount: 10,
        columns: columns(6),
        charts: [
          {
            id: "levels",
            kind: "column",
            anchor: { row: 0, col: 4, offsetX: 0, offsetY: 0, width: 400, height: 300 },
            series: [{ values: range("data", 0, 2, 3, 2), categories: range("data", 0, 0, 3, 1) }],
            ...chart,
          },
        ],
      },
    ),
  ]);
}

describe("multi-level categories over a cell range", () => {
  it("writes a category range of two columns as c:multiLvlStrRef and reads it back", async () => {
    const bytes = await backend.toXlsxWorkbook(rangeSnapshot());
    expect(chartPart(bytes)).toContain(
      "<c:cat><c:multiLvlStrRef><c:f>&apos;Data&apos;!$A$1:$B$4</c:f></c:multiLvlStrRef></c:cat>",
    );
    expect(chartPart(bytes)).not.toContain("noMultiLvlLbl");
    const reopened = sheetAt(await backend.fromXlsxWorkbook(withoutSidecar(bytes)));
    expect(reopened.charts?.[0]?.series[0]?.categories).toEqual(range(reopened.id, 0, 0, 3, 1));
  });

  it("keeps Multi-level Category Labels cleared through c:noMultiLvlLbl", async () => {
    const bytes = await backend.toXlsxWorkbook(
      rangeSnapshot({ axes: { multiLevelLabels: false } }),
    );
    expect(chartPart(bytes)).toContain('<c:noMultiLvlLbl val="1"/>');
    const reopened = await backend.fromXlsxWorkbook(withoutSidecar(bytes));
    expect(sheetAt(reopened).charts?.[0]?.axes).toEqual({ multiLevelLabels: false });
  });

  it("imports Excel's c:multiLvlStrRef with its cache as a chart whose view has the levels", async () => {
    const excel =
      '<c:cat><c:multiLvlStrRef><c:f>Data!$A$1:$B$4</c:f><c:multiLvlStrCache><c:ptCount val="4"/>' +
      '<c:lvl><c:pt idx="0"><c:v>Retail</c:v></c:pt><c:pt idx="1"><c:v>Online</c:v></c:pt><c:pt idx="2"><c:v>Retail</c:v></c:pt><c:pt idx="3"><c:v>Online</c:v></c:pt></c:lvl>' +
      '<c:lvl><c:pt idx="0"><c:v>East</c:v></c:pt><c:pt idx="2"><c:v>West</c:v></c:pt></c:lvl>' +
      "</c:multiLvlStrCache></c:multiLvlStrRef></c:cat>";
    const bytes = await backend.toXlsxWorkbook(rangeSnapshot());
    const name = partNames(bytes).find((part) => /^xl\/charts\/[^/]+\.xml$/u.test(part)) ?? "";
    const edited = editParts(withoutSidecar(bytes), {
      [name]: (xml) =>
        xml
          .replace(/<c:cat>.*?<\/c:cat>/u, excel)
          .replace(
            '<c:lblOffset val="100"/>',
            '<c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/>',
          ),
    });

    const snapshot = await backend.fromXlsxWorkbook(edited);
    const owner = sheetAt(snapshot);
    const chart = owner.charts?.[0];
    expect(chart?.axes).toBeUndefined();
    const store = SheetwriteStore.fromSnapshot(snapshot);
    const series = resolveChartView(store, owner.id, chart?.id ?? "")?.series[0];
    expect(series?.categories).toEqual(["Retail", "Online", "Retail", "Online"]);
    expect(series?.categoryLevels.map((level) => level.labels)).toEqual([
      ["East", null, "West", null],
    ]);
    store.dispose();
  });
});

/** Orders, a pivot by region then segment at E1 of Data, and a chart over it. */
const PIVOT_CHART: ChartDefinition = {
  id: "pivot-chart",
  kind: "column",
  anchor: { row: 0, col: 9, offsetX: 0, offsetY: 0, width: 480, height: 288 },
  series: [],
  pivot: "sales",
};

const pivotSnapshot = (layout: "compact" | "tabular") =>
  book([
    sheet(
      "data",
      "Data",
      [
        ["Region", "Segment", "Amount"],
        ["East", "Online", 2],
        ["East", "Retail", 1],
        ["West", "Retail", 3],
      ],
      {
        rowCount: 20,
        columns: columns(14),
        tables: [
          {
            id: "orders",
            name: "Orders",
            range: range("data", 0, 0, 3, 2),
            columns: [
              { id: "region", name: "Region" },
              { id: "segment", name: "Segment" },
              { id: "amount", name: "Amount" },
            ],
            headerRow: true,
            totalsRow: false,
          },
        ],
        pivots: [
          {
            id: "sales",
            name: "Sales",
            source: { table: "orders" },
            anchor: { row: 0, col: 4 },
            rows: [0, 1],
            columns: [],
            values: [{ field: 2, aggregation: "SUM" }],
            layout,
            subtotals: false,
          },
        ],
        charts: [PIVOT_CHART],
      },
    ),
  ]);

/** What core resolves for the chart: segments under regions, outermost first. */
const PIVOT_SERIES: ChartSeriesView = {
  name: "Sum of Amount",
  values: [2, 1, 3],
  categories: ["Online", "Retail", "Retail"],
  categoryLevels: [{ labels: ["East", null, "West"], formats: [null, null, null] }],
  numberFormats: [null, null, null],
  categoryFormats: [null, null, null],
  numberLocale: null,
  truncated: false,
  referenceError: false,
};

/** The pivot's output at E1 as the engine computes it. */
const OUTPUTS = {
  tabular: [
    ["Region", "Segment", "Sum of Amount"],
    ["East", "Online", 2],
    [null, "Retail", 1],
    ["West", "Retail", 3],
    ["Total", null, 6],
  ],
  compact: [
    ["Row Labels", "Sum of Amount"],
    ["East", null],
    ["Online", 2],
    ["Retail", 1],
    ["West", null],
    ["Retail", 3],
    ["Total", 6],
  ],
} as const;

async function exportPivotChart(layout: "compact" | "tabular", withOutput = true) {
  const cells = OUTPUTS[layout].map((row) => [...row]);
  const pivotOutputs: DashboardExport[] = [
    {
      sheet: "data",
      items: [{ id: "sales", cells, numberFormats: cells.map((row) => row.map(() => null)) }],
    },
  ];
  const bytes = await backend.toXlsxWorkbook(pivotSnapshot(layout), undefined, {
    pivotCharts: new Map([
      ["data", new Map([[PIVOT_CHART.id, { chart: PIVOT_CHART, series: [PIVOT_SERIES] }]])],
    ]),
    ...(withOutput ? { pivotOutputs } : {}),
  });
  return { bytes, chart: chartPart(bytes) };
}

const LEVELS_CACHE =
  '<c:multiLvlStrCache><c:ptCount val="3"/>' +
  '<c:lvl><c:pt idx="0"><c:v>Online</c:v></c:pt><c:pt idx="1"><c:v>Retail</c:v></c:pt><c:pt idx="2"><c:v>Retail</c:v></c:pt></c:lvl>' +
  '<c:lvl><c:pt idx="0"><c:v>East</c:v></c:pt><c:pt idx="2"><c:v>West</c:v></c:pt></c:lvl>' +
  "</c:multiLvlStrCache>";

describe("multi-level categories of a chart over a pivot with two row fields", () => {
  it("reads the label and value cells of a tabular pivot as an Excel PivotChart of it", async () => {
    const { bytes, chart } = await exportPivotChart("tabular");
    expect(chart).toContain(
      '<c:pivotSource><c:name>[]Data!Sales</c:name><c:fmtId val="0"/></c:pivotSource>',
    );
    expect(chart).toContain(
      `<c:cat><c:multiLvlStrRef><c:f>&apos;Data&apos;!$E$2:$F$4</c:f>${LEVELS_CACHE}</c:multiLvlStrRef></c:cat>`,
    );
    expect(chart).toContain(
      "<c:val><c:numRef><c:f>&apos;Data&apos;!$G$2:$G$4</c:f><c:numCache><c:formatCode>General</c:formatCode>" +
        '<c:ptCount val="3"/><c:pt idx="0"><c:v>2</c:v></c:pt><c:pt idx="1"><c:v>1</c:v></c:pt><c:pt idx="2"><c:v>3</c:v></c:pt></c:numCache></c:numRef></c:val>',
    );
    // Sheetwrite reads its own PivotChart back as the chart over the pivot.
    expect(sheetAt(await backend.fromXlsxWorkbook(bytes)).charts).toEqual([PIVOT_CHART]);
  });

  it("spans the rows of a compact pivot, where outer items have their own rows", async () => {
    const { chart } = await exportPivotChart("compact");
    expect(chart).toContain("<c:pivotSource>");
    expect(chart).toContain(
      `<c:cat><c:multiLvlStrRef><c:f>&apos;Data&apos;!$E$3:$E$6</c:f>${LEVELS_CACHE}</c:multiLvlStrRef></c:cat>`,
    );
    expect(chart).toContain("<c:val><c:numRef><c:f>&apos;Data&apos;!$F$3:$F$6</c:f>");
  });

  it("keeps the levels in a cache with no written cells", async () => {
    const { chart } = await exportPivotChart("tabular", false);
    expect(chart).not.toContain("<c:pivotSource>");
    expect(chart).toContain(
      `<c:cat><c:multiLvlStrRef><c:f>#REF!</c:f>${LEVELS_CACHE}</c:multiLvlStrRef></c:cat>`,
    );
    expect(chart).toContain("<c:val><c:numLit>");
  });
});
