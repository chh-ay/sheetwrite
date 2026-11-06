import { beforeAll, describe, expect, it } from "bun:test";

import {
  type ChartDefinition,
  type ChartSeriesView,
  type ChartView,
  type DashboardExport,
  initSheetwrite,
  resolveChartView,
  SheetwriteStore,
  type WorkbookSnapshot,
} from "@sheetwrite/core";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

import { sheetwriteWorkbookBackend } from "../src/index.js";

beforeAll(async () => {
  await initSheetwrite();
});

const literal = (row: number, col: number, value: string | number) => ({
  rowOffset: row,
  colOffset: col,
  value: { kind: "literal" as const, value },
});

const columns = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    key: `c${index}`,
    header: `C${index}`,
    width: 80,
    type: "text" as const,
  }));

const range = (r0: number, c0: number, r1: number, c1: number) => ({
  sheet: "data",
  start: { row: r0, col: c0 },
  end: { row: r1, col: c1 },
});

/** Regions in A1:A4 (blank where a group continues), segments in B1:B4, amounts in C1:C4. */
function rangeSnapshot(chart: Partial<ChartDefinition> = {}): WorkbookSnapshot {
  return {
    schemaVersion: 1,
    workbook: { activeSheet: "data" },
    sheets: [
      {
        id: "data",
        name: "Data",
        order: 0,
        rowCount: 10,
        columns: columns(6),
        cells: [
          {
            startRow: 0,
            startCol: 0,
            rowCount: 4,
            colCount: 3,
            cells: [
              literal(0, 0, "East"),
              literal(2, 0, "West"),
              ...["Retail", "Online", "Retail", "Online"].map((segment, row) =>
                literal(row, 1, segment),
              ),
              ...[1, 2, 3, 4].map((amount, row) => literal(row, 2, amount)),
            ],
          },
        ],
        charts: [
          {
            id: "levels",
            kind: "column",
            anchor: { row: 0, col: 4, offsetX: 0, offsetY: 0, width: 400, height: 300 },
            series: [{ values: range(0, 2, 3, 2), categories: range(0, 0, 3, 1) }],
            ...chart,
          },
        ],
      },
    ],
  };
}

function chartPart(bytes: Uint8Array): string {
  const files = unzipSync(bytes);
  const part = Object.keys(files).find((name) => /^xl\/charts\/[^/]+\.xml$/u.test(name));
  return strFromU8(files[part ?? ""] ?? new Uint8Array());
}

/** `bytes` without the Sheetwrite metadata sheet, and with `edit` applied to each chart part. */
function asExcelWrote(bytes: Uint8Array, edit: (xml: string) => string = (xml) => xml): Uint8Array {
  const parts = unzipSync(bytes);
  for (const [part, content] of Object.entries(parts)) {
    const xml = strFromU8(content);
    if (part.startsWith("xl/worksheets/sheet") && xml.includes("sheetwrite-workbook-metadata-v1")) {
      parts[part] = strToU8(
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData/></worksheet>',
      );
    } else if (/^xl\/charts\/[^/]+\.xml$/u.test(part)) {
      parts[part] = strToU8(edit(xml));
    }
  }
  return zipSync(parts);
}

describe("multi-level categories over a cell range", () => {
  it("writes a category range of two columns as c:multiLvlStrRef and reads it back", async () => {
    const bytes = await sheetwriteWorkbookBackend.toXlsxWorkbook(rangeSnapshot());

    expect(chartPart(bytes)).toContain(
      "<c:cat><c:multiLvlStrRef><c:f>&apos;Data&apos;!$A$1:$B$4</c:f></c:multiLvlStrRef></c:cat>",
    );
    const reopened = await sheetwriteWorkbookBackend.fromXlsxWorkbook(asExcelWrote(bytes));
    const sheet = reopened.sheets[0];
    expect(sheet?.charts?.[0]?.series[0]?.categories).toEqual({
      ...range(0, 0, 3, 1),
      sheet: sheet?.id ?? "",
    });
  });

  it("keeps Multi-level Category Labels cleared through c:noMultiLvlLbl", async () => {
    const bytes = await sheetwriteWorkbookBackend.toXlsxWorkbook(
      rangeSnapshot({ axes: { multiLevelLabels: false } }),
    );

    expect(chartPart(bytes)).toContain('<c:noMultiLvlLbl val="1"/>');
    const reopened = await sheetwriteWorkbookBackend.fromXlsxWorkbook(asExcelWrote(bytes));
    expect(reopened.sheets[0]?.charts?.[0]?.axes).toEqual({ multiLevelLabels: false });
    // Charts with the setting on write nothing for it, as before.
    const plain = await sheetwriteWorkbookBackend.toXlsxWorkbook(rangeSnapshot());
    expect(chartPart(plain)).not.toContain("noMultiLvlLbl");
  });

  it("imports Excel's c:multiLvlStrRef with its cache as a chart whose view has the levels", async () => {
    const excel =
      "<c:cat><c:multiLvlStrRef><c:f>Data!$A$1:$B$4</c:f><c:multiLvlStrCache>" +
      '<c:ptCount val="4"/>' +
      '<c:lvl><c:pt idx="0"><c:v>Retail</c:v></c:pt><c:pt idx="1"><c:v>Online</c:v></c:pt><c:pt idx="2"><c:v>Retail</c:v></c:pt><c:pt idx="3"><c:v>Online</c:v></c:pt></c:lvl>' +
      '<c:lvl><c:pt idx="0"><c:v>East</c:v></c:pt><c:pt idx="2"><c:v>West</c:v></c:pt></c:lvl>' +
      "</c:multiLvlStrCache></c:multiLvlStrRef></c:cat>";
    const bytes = asExcelWrote(
      await sheetwriteWorkbookBackend.toXlsxWorkbook(rangeSnapshot()),
      (xml) =>
        xml
          .replace(/<c:cat>.*?<\/c:cat>/u, excel)
          .replace(
            '<c:lblOffset val="100"/>',
            '<c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/>',
          ),
    );

    const snapshot = await sheetwriteWorkbookBackend.fromXlsxWorkbook(bytes);
    const sheet = snapshot.sheets[0];
    const chart = sheet?.charts?.[0];
    expect(chart?.axes).toBeUndefined();
    const store = SheetwriteStore.fromSnapshot(snapshot);
    const series = resolveChartView(store, sheet?.id ?? "", chart?.id ?? "")?.series[0];
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

function pivotSnapshot(layout: "compact" | "tabular"): WorkbookSnapshot {
  const orders = [
    ["East", "Online", 2],
    ["East", "Retail", 1],
    ["West", "Retail", 3],
  ] as const;
  return {
    schemaVersion: 1,
    workbook: { activeSheet: "data" },
    sheets: [
      {
        id: "data",
        name: "Data",
        order: 0,
        rowCount: 20,
        columns: columns(14),
        tables: [
          {
            id: "orders",
            name: "Orders",
            range: range(0, 0, orders.length, 2),
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
        cells: [
          {
            startRow: 0,
            startCol: 0,
            rowCount: orders.length + 1,
            colCount: 3,
            cells: [
              literal(0, 0, "Region"),
              literal(0, 1, "Segment"),
              literal(0, 2, "Amount"),
              ...orders.flatMap((order, row) =>
                order.map((value, col) => literal(row + 1, col, value)),
              ),
            ],
          },
        ],
      },
    ],
  };
}

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
const PIVOT_VIEW: ChartView = { chart: PIVOT_CHART, series: [PIVOT_SERIES] };

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
  const bytes = await sheetwriteWorkbookBackend.toXlsxWorkbook(pivotSnapshot(layout), undefined, {
    pivotCharts: new Map([["data", new Map([[PIVOT_CHART.id, PIVOT_VIEW]])]]),
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
    const reopened = await sheetwriteWorkbookBackend.fromXlsxWorkbook(bytes);
    expect(reopened.sheets[0]?.charts).toEqual([PIVOT_CHART]);
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
