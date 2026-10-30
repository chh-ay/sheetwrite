import { beforeAll, describe, expect, it } from "bun:test";

import {
  type ChartDefinition,
  type ChartKind,
  fromXlsxWorkbook,
  initSheetwrite,
  SheetwriteStore,
  toXlsxWorkbook,
  type WorkbookSnapshot,
  type XlsxWorkbookWarning,
} from "@sheetwrite/core";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

import { registerXlsxBackends } from "../src/index.js";
import { packageProblems } from "./raw-opc.js";

async function fixture(file: string): Promise<Uint8Array> {
  return new Uint8Array(await Bun.file(new URL(`fixtures/${file}`, import.meta.url)).arrayBuffer());
}

function drawingCount(files: Record<string, Uint8Array>, part: string): number {
  return strFromU8(files[part] ?? new Uint8Array()).match(/<drawing\b/g)?.length ?? 0;
}

beforeAll(async () => {
  await initSheetwrite();
  registerXlsxBackends();
});

const KINDS: ChartKind[] = ["column", "bar", "line", "area", "pie", "doughnut", "scatter"];

function authored(): WorkbookSnapshot {
  return {
    schemaVersion: 1,
    workbook: { activeSheet: "data" },
    sheets: [
      {
        id: "data",
        name: "O'Brien sales",
        order: 0,
        rowCount: 20,
        columns: Array.from({ length: 10 }, (_, index) => ({
          key: `c${index}`,
          header: `C${index}`,
          type: "number",
          width: 80,
        })),
        cells: [
          {
            startRow: 0,
            startCol: 0,
            rowCount: 3,
            colCount: 3,
            cells: [
              { rowOffset: 0, colOffset: 0, value: { kind: "literal", value: "Sales" } },
              ...[1, 2].flatMap((rowOffset) =>
                [0, 1, 2].map((colOffset) => ({
                  rowOffset,
                  colOffset,
                  value: { kind: "literal" as const, value: rowOffset + colOffset },
                })),
              ),
            ],
          },
        ],
        charts: KINDS.map((kind, index): ChartDefinition => ({
          id: `chart-${kind}`,
          kind,
          title: `${kind} & sales`,
          ...(kind === "pie" || kind === "doughnut"
            ? {}
            : { axes: { xTitle: "Quarter", yTitle: "Revenue" } }),
          legend: "bottom",
          anchor: { row: index, col: 4, offsetX: 2, offsetY: 3, width: 420, height: 280 },
          series: [
            {
              nameRange: { sheet: "data", start: { row: 0, col: 0 }, end: { row: 0, col: 0 } },
              values: { sheet: "data", start: { row: 1, col: 1 }, end: { row: 2, col: 1 } },
              categories: { sheet: "data", start: { row: 1, col: 0 }, end: { row: 2, col: 0 } },
            },
            {
              name: "Other",
              values: { sheet: "data", start: { row: 1, col: 2 }, end: { row: 2, col: 2 } },
            },
          ],
        })),
      },
    ],
  };
}

function withoutSidecar(bytes: Uint8Array): Uint8Array {
  const parts = unzipSync(bytes);
  // Native chart tests must not get their definitions from Sheetwrite metadata.
  for (const [part, content] of Object.entries(parts)) {
    if (
      part.startsWith("xl/worksheets/sheet") &&
      strFromU8(content).includes("sheetwrite-workbook-metadata-v1")
    ) {
      parts[part] = strToU8(
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData/></worksheet>',
      );
    }
  }
  return zipSync(parts);
}

/** Without the sidecar the sheet gets a new ID, so compare ranges by sheet name instead. */
function portable(chart: ChartDefinition, sheetNames: ReadonlyMap<string, string>): unknown {
  const reference = (range: ChartDefinition["series"][number]["values"] | undefined) =>
    range && range !== "#REF!" ? { ...range, sheet: sheetNames.get(range.sheet) } : range;
  return {
    ...chart,
    id: undefined,
    series: chart.series.map((series) => ({
      ...series,
      values: reference(series.values),
      ...(series.categories === undefined ? {} : { categories: reference(series.categories) }),
      ...(series.nameRange === undefined ? {} : { nameRange: reference(series.nameRange) }),
    })),
  };
}

function sheetNames(snapshot: WorkbookSnapshot): Map<string, string> {
  return new Map(snapshot.sheets.map((sheet) => [sheet.id, sheet.name]));
}

function collect(): {
  warnings: XlsxWorkbookWarning[];
  onWarning: (warning: XlsxWorkbookWarning) => void;
} {
  const warnings: XlsxWorkbookWarning[] = [];
  return { warnings, onWarning: (warning) => warnings.push(warning) };
}

describe("native XLSX charts", () => {
  it("round trips all seven kinds, ranges, titles, axes, legends and anchors from DrawingML alone", async () => {
    const snapshot = authored();
    const bytes = await toXlsxWorkbook(snapshot);
    const restored = await fromXlsxWorkbook(withoutSidecar(bytes));

    expect(
      restored.sheets[0]?.charts?.map((chart) => portable(chart, sheetNames(restored))),
    ).toEqual(snapshot.sheets[0]?.charts?.map((chart) => portable(chart, sheetNames(snapshot))));
    expect(packageProblems(bytes)).toEqual([]);
    const files = unzipSync(bytes);
    expect(Object.keys(files).filter((part) => /^xl\/charts\/[^/]+\.xml$/.test(part))).toHaveLength(
      KINDS.length,
    );
    expect(drawingCount(files, "xl/worksheets/sheet1.xml")).toBe(1);
  });

  it("keeps chart IDs, an omitted legend and subpixel anchors through the sidecar", async () => {
    const snapshot = authored();
    const first = snapshot.sheets[0]?.charts?.[0];
    if (!first) throw new Error("authored workbook has no chart");
    delete first.legend;
    first.anchor = { ...first.anchor, offsetX: 2.25, width: 420.5 };

    const restored = await fromXlsxWorkbook(await toXlsxWorkbook(snapshot));

    expect(restored.sheets[0]?.charts).toEqual(snapshot.sheets[0]?.charts);
  });

  it("writes no drawing or chart part for a workbook without charts", async () => {
    const snapshot = authored();
    const sheet = snapshot.sheets[0];
    if (!sheet) throw new Error("authored workbook has no sheet");
    delete sheet.charts;

    const files = unzipSync(await toXlsxWorkbook(snapshot));

    expect(Object.keys(files).filter((part) => /drawing|chart/.test(part))).toEqual([]);
  });

  it("imports the Excel-made line chart fixture and keeps it through a cell edit", async () => {
    const snapshot = await fromXlsxWorkbook(await fixture("preserve-WithChart.xlsx"));
    const owner = snapshot.sheets.find((sheet) => sheet.charts?.length);
    const source = snapshot.sheets.find((sheet) => sheet.name === "Sheet1");
    if (!owner || !source) throw new Error("Excel chart fixture did not import its chart");
    const column = (col: number) => ({
      sheet: source.id,
      start: { row: 0, col },
      end: { row: 5, col },
    });
    const chart = owner.charts?.[0];

    expect(chart?.kind).toBe("line");
    expect(chart?.series).toEqual([
      { name: "1st Column", values: column(0) },
      { name: "2nd Column", values: column(1) },
    ]);
    // `xdr:rowOff` 19049 EMU is 2 px at 9525 EMU per pixel.
    expect(chart?.anchor).toMatchObject({ row: 0, col: 0, offsetX: 0 });
    expect(chart?.anchor.offsetY).toBeCloseTo(2, 3);
    expect(chart?.anchor.width).toBeGreaterThan(0);
    expect(chart?.anchor.height).toBeGreaterThan(0);
    // A Sheetwrite chart owns its parts, so they are not also kept opaque.
    expect(
      snapshot.workbook.xlsxSource?.parts.some((part) => part.name.includes("chart")),
    ).not.toBe(true);

    // Kept charts are dropped after a cell edit; a Sheetwrite chart is written again.
    const store = SheetwriteStore.fromSnapshot(snapshot);
    store.applyTransaction({
      patches: [
        {
          op: "set",
          addr: { sheet: source.id, row: 0, col: 0 },
          value: { kind: "literal", value: 9 },
        },
      ],
    });
    const { warnings, onWarning } = collect();
    const saved = await toXlsxWorkbook(store, { onWarning });
    const reopened = await fromXlsxWorkbook(withoutSidecar(saved));

    expect(warnings.filter((warning) => warning.part?.includes("chart"))).toEqual([]);
    expect(packageProblems(saved)).toEqual([]);
    expect(
      reopened.sheets
        .find((sheet) => sheet.name === owner.name)
        ?.charts?.map((entry) => portable(entry, sheetNames(reopened))),
    ).toEqual(owner.charts?.map((entry) => portable(entry, sheetNames(snapshot))));
  });

  it("adds a new chart to a sheet's kept image drawing instead of a second drawing", async () => {
    const snapshot = await fromXlsxWorkbook(await fixture("preserve-picture.xlsx"));
    const sheet = snapshot.sheets[0];
    if (!sheet) throw new Error("picture fixture has no sheet");
    const cell = { sheet: sheet.id, start: { row: 0, col: 0 }, end: { row: 0, col: 0 } };
    sheet.charts = [
      {
        id: "new-chart",
        kind: "pie",
        anchor: { row: 0, col: 0, offsetX: 0, offsetY: 0, width: 200, height: 150 },
        series: [{ values: cell }],
      },
    ];

    const saved = await toXlsxWorkbook(snapshot);
    const files = unzipSync(saved);
    const drawing = strFromU8(files["xl/drawings/drawing1.xml"] ?? new Uint8Array());
    const reopened = await fromXlsxWorkbook(saved);

    expect(packageProblems(saved)).toEqual([]);
    expect(drawingCount(files, "xl/worksheets/sheet1.xml")).toBe(1);
    expect(drawing).toContain("xdr:pic");
    expect(drawing).toContain('name="new-chart"');
    expect(files["xl/media/10000000000006450000032120C875D8.jpg"]).toBeDefined();
    expect(reopened.sheets[0]?.charts).toEqual(sheet.charts);
    expect(reopened.workbook.xlsxSource?.parts.some((part) => part.name.endsWith(".jpg"))).toBe(
      true,
    );
  });

  it("keeps charts the model cannot hold beside Sheetwrite charts in one drawing", async () => {
    const parts = unzipSync(await toXlsxWorkbook(authored()));
    const unsupported = "xl/charts/sheetwrite-chart1-2.xml";
    parts[unsupported] = strToU8(
      strFromU8(parts[unsupported] ?? new Uint8Array()).replaceAll("c:barChart", "c:bar3DChart"),
    );
    const { warnings, onWarning } = collect();
    const imported = await fromXlsxWorkbook(withoutSidecar(zipSync(parts)), { onWarning });

    expect(imported.sheets[0]?.charts?.map((chart) => chart.kind)).toEqual(
      KINDS.filter((kind) => kind !== "bar"),
    );
    expect(warnings).toContainEqual(
      expect.objectContaining({ code: "unsupported-feature", part: unsupported }),
    );
    expect(imported.workbook.xlsxSource?.parts.map((part) => part.name)).toContain(unsupported);

    // The kept chart's part name is the one export would generate first; export must pick another.
    const exported = await toXlsxWorkbook(imported);
    const output = unzipSync(exported);
    const restored = await fromXlsxWorkbook(withoutSidecar(exported));

    expect(packageProblems(exported)).toEqual([]);
    expect(drawingCount(output, "xl/worksheets/sheet1.xml")).toBe(1);
    expect(strFromU8(output[unsupported] ?? new Uint8Array())).toContain("bar3DChart");
    expect(restored.sheets[0]?.charts?.map((chart) => chart.kind)).toEqual(
      KINDS.filter((kind) => kind !== "bar"),
    );
  });

  it("imports one chart per part when thousands of anchors repeat it or have no chart", async () => {
    const parts = unzipSync(withoutSidecar(await toXlsxWorkbook(authored())));
    const drawingPart = "xl/drawings/sheetwrite-drawing1.xml";
    const drawing = strFromU8(parts[drawingPart] ?? new Uint8Array());
    const anchor = drawing.match(/<xdr:oneCellAnchor\b[^>]*>[\s\S]*?<\/xdr:oneCellAnchor>/)?.[0];
    if (!anchor) throw new Error("authored drawing has no one-cell anchor");
    const repeats = 1_500;
    const unlinked = anchor.replace(/<c:chart\b[^>]*\/>/, "");
    parts[drawingPart] = strToU8(
      drawing.replace(
        "</xdr:wsDr>",
        `${anchor.repeat(repeats)}${unlinked.repeat(repeats)}</xdr:wsDr>`,
      ),
    );
    const { warnings, onWarning } = collect();

    const imported = await fromXlsxWorkbook(zipSync(parts, { level: 0 }), { onWarning });

    expect(imported.sheets[0]?.charts).toHaveLength(KINDS.length);
    expect(warnings.filter((warning) => warning.code === "unsupported-feature")).toHaveLength(
      repeats,
    );
    const exported = await toXlsxWorkbook(imported);
    expect(packageProblems(exported)).toEqual([]);
  }, 5_000);

  it("sizes two-cell anchors from default and explicit column and row sizes", async () => {
    const parts = unzipSync(withoutSidecar(await toXlsxWorkbook(authored())));
    const drawingPart = "xl/drawings/sheetwrite-drawing1.xml";
    const drawing = strFromU8(parts[drawingPart] ?? new Uint8Array());
    const frame = drawing.match(/<xdr:graphicFrame\b[\s\S]*?<\/xdr:graphicFrame>/)?.[0];
    if (!frame) throw new Error("authored drawing has no chart frame");
    const marker = (row: number, col: number, offset: number) =>
      `<xdr:col>${col}</xdr:col><xdr:colOff>${offset}</xdr:colOff><xdr:row>${row}</xdr:row><xdr:rowOff>${offset}</xdr:rowOff>`;
    const namespaces = drawing.match(/<xdr:oneCellAnchor([^>]*)>/)?.[1] ?? "";
    const anchor = `<xdr:twoCellAnchor${namespaces}><xdr:from>${marker(0, 0, 9525)}</xdr:from><xdr:to>${marker(1_000, 300, 19050)}</xdr:to>${frame}<xdr:clientData/></xdr:twoCellAnchor>`;
    parts[drawingPart] = strToU8(
      drawing.replace(/<xdr:oneCellAnchor\b[\s\S]*<\/xdr:oneCellAnchor>/, anchor),
    );
    parts["xl/worksheets/sheet1.xml"] = strToU8(
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols><col min="2" max="2" width="20" customWidth="1"/></cols><sheetData><row r="2" ht="30" customHeight="1"/></sheetData></worksheet>',
    );

    const imported = await fromXlsxWorkbook(zipSync(parts));

    expect(imported.sheets[0]?.charts?.[0]?.anchor).toEqual({
      row: 0,
      col: 0,
      offsetX: 1,
      offsetY: 1,
      width: 300 * 64 + (75 - 64) + (140 - 64) + 1,
      height: 1_000 * 20 + (40 - 20) + 1,
    });
  });

  it("does not parse further chart parts once the sheet chart limit is full", async () => {
    const snapshot = authored();
    const sheet = snapshot.sheets[0];
    const chart = sheet?.charts?.[0];
    if (!sheet || !chart) throw new Error("authored workbook has no chart");
    sheet.charts = Array.from({ length: 100 }, (_, index) => ({ ...chart, id: `chart-${index}` }));
    const parts = unzipSync(withoutSidecar(await toXlsxWorkbook(snapshot)));
    const drawingPart = "xl/drawings/sheetwrite-drawing1.xml";
    const drawing = strFromU8(parts[drawingPart] ?? new Uint8Array());
    const anchor = drawing.match(/<xdr:oneCellAnchor\b[^>]*>[\s\S]*?<\/xdr:oneCellAnchor>/)?.[0];
    if (!anchor) throw new Error("authored drawing has no chart anchor");
    parts[drawingPart] = strToU8(
      drawing.replace(
        "</xdr:wsDr>",
        `${anchor.replace('r:id="rId1"', 'r:id="overflow"')}</xdr:wsDr>`,
      ),
    );
    const relationshipsPart = "xl/drawings/_rels/sheetwrite-drawing1.xml.rels";
    parts[relationshipsPart] = strToU8(
      strFromU8(parts[relationshipsPart] ?? new Uint8Array()).replace(
        "</Relationships>",
        '<Relationship Id="overflow" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="/xl/charts/overflow.xml"/></Relationships>',
      ),
    );
    parts["xl/charts/overflow.xml"] = strToU8("<not-well-formed");
    const { warnings, onWarning } = collect();

    const imported = await fromXlsxWorkbook(zipSync(parts), { onWarning });

    expect(imported.sheets[0]?.charts).toHaveLength(100);
    expect(warnings).toContainEqual(
      expect.objectContaining({ code: "unsupported-feature", part: "xl/charts/overflow.xml" }),
    );
    expect(imported.workbook.xlsxSource?.parts.map((part) => part.name)).toContain(
      "xl/charts/overflow.xml",
    );
  });

  it("reads series ranges written with lower-case column letters", async () => {
    const parts = unzipSync(await toXlsxWorkbook(authored()));
    const expected = await fromXlsxWorkbook(withoutSidecar(zipSync(parts)));
    const chartPart = "xl/charts/sheetwrite-chart1-1.xml";
    parts[chartPart] = strToU8(
      strFromU8(parts[chartPart] ?? new Uint8Array()).replace(
        /<c:f>([^<]*)<\/c:f>/g,
        (_formula: string, source: string) =>
          `<c:f>${source.replace(/\$([A-Z]{1,3})\$/g, (column: string) => column.toLowerCase())}</c:f>`,
      ),
    );

    const imported = await fromXlsxWorkbook(withoutSidecar(zipSync(parts)));

    expect(strFromU8(parts[chartPart] ?? new Uint8Array())).toMatch(/<c:f>[^<]*\$[a-z]+\$/);
    expect(imported.sheets[0]?.charts?.[0]?.series).toEqual(
      expected.sheets[0]?.charts?.[0]?.series ?? [],
    );
  });
});
