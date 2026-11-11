import { beforeAll, describe, expect, it } from "bun:test";

import {
  type ChartDefinition,
  type ChartKind,
  fromXlsxWorkbook,
  initSheetwrite,
  SheetwriteStore,
  toXlsxWorkbook,
  type WorkbookSnapshot,
} from "@sheetwrite/core";

import { xlsxAddon } from "../src/index.js";
import { packageProblems } from "./raw-opc.js";
import {
  book,
  collectWarnings,
  columns,
  editParts,
  fixture,
  partNames,
  partText,
  range,
  sheet,
  sheetAt,
  sheetNamed,
  withoutSidecar,
} from "./workbook-fixtures.js";

beforeAll(async () => {
  await initSheetwrite({ addons: [xlsxAddon()] });
});

const KINDS: ChartKind[] = ["column", "bar", "line", "area", "pie", "doughnut", "scatter"];
const DRAWING = "xl/drawings/sheetwrite-drawing1.xml";
const drawingCount = (bytes: Uint8Array) =>
  partText(bytes, "xl/worksheets/sheet1.xml").match(/<drawing\b/g)?.length ?? 0;

function authored(): WorkbookSnapshot {
  return book([
    sheet(
      "data",
      "O'Brien sales",
      [
        ["Sales", null, null],
        [1, 2, 3],
        [2, 3, 4],
      ],
      {
        rowCount: 20,
        columns: columns(10, "number"),
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
              nameRange: range("data", 0, 0),
              values: range("data", 1, 1, 2, 1),
              categories: range("data", 1, 0, 2, 0),
            },
            { name: "Other", values: range("data", 1, 2, 2, 2) },
          ],
        })),
      },
    ),
  ]);
}

/** Without the sidecar the sheet gets a new ID, so compare ranges by sheet name instead. */
function portable(snapshot: WorkbookSnapshot, sheetName: string): unknown {
  const names = new Map(snapshot.sheets.map((entry) => [entry.id, entry.name]));
  const reference = (target: ChartDefinition["series"][number]["values"] | undefined) =>
    target && target !== "#REF!" ? { ...target, sheet: names.get(target.sheet) } : target;
  return sheetNamed(snapshot, sheetName).charts?.map((chart) => ({
    ...chart,
    id: undefined,
    series: chart.series.map((series) => ({
      ...series,
      values: reference(series.values),
      ...(series.categories === undefined ? {} : { categories: reference(series.categories) }),
      ...(series.nameRange === undefined ? {} : { nameRange: reference(series.nameRange) }),
    })),
  }));
}

describe("native XLSX charts", () => {
  it("round trips all seven kinds, ranges, titles, axes, legends and anchors from DrawingML alone", async () => {
    const snapshot = authored();
    const bytes = await toXlsxWorkbook(snapshot);
    const restored = await fromXlsxWorkbook(withoutSidecar(bytes));

    expect(portable(restored, "O'Brien sales")).toEqual(portable(snapshot, "O'Brien sales"));
    expect(packageProblems(bytes)).toEqual([]);
    expect(partNames(bytes).filter((part) => /^xl\/charts\/[^/]+\.xml$/.test(part))).toHaveLength(
      KINDS.length,
    );
    expect(drawingCount(bytes)).toBe(1);
  });

  it("imports the Excel-made line chart fixture and keeps it through a cell edit", async () => {
    const snapshot = await fromXlsxWorkbook(await fixture("preserve-WithChart.xlsx"));
    const owner = snapshot.sheets.find((entry) => entry.charts?.length);
    const source = sheetNamed(snapshot, "Sheet1");
    if (!owner) throw new Error("Excel chart fixture did not import its chart");
    const chart = owner.charts?.[0];

    expect(chart?.kind).toBe("line");
    expect(chart?.series).toEqual([
      { name: "1st Column", values: range(source.id, 0, 0, 5, 0) },
      { name: "2nd Column", values: range(source.id, 0, 1, 5, 1) },
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
    const { warnings, onWarning } = collectWarnings();
    const saved = await toXlsxWorkbook(store, { onWarning });
    expect(warnings.filter((warning) => warning.part?.includes("chart"))).toEqual([]);
    expect(packageProblems(saved)).toEqual([]);
    expect(portable(await fromXlsxWorkbook(withoutSidecar(saved)), owner.name)).toEqual(
      portable(snapshot, owner.name),
    );
    store.dispose();
  });

  it("adds a new chart to a sheet's kept image drawing instead of a second drawing", async () => {
    const snapshot = await fromXlsxWorkbook(await fixture("preserve-picture.xlsx"));
    const first = sheetAt(snapshot);
    first.charts = [
      {
        id: "new-chart",
        kind: "pie",
        anchor: { row: 0, col: 0, offsetX: 0, offsetY: 0, width: 200, height: 150 },
        series: [{ values: range(first.id, 0, 0) }],
      },
    ];

    const saved = await toXlsxWorkbook(snapshot);
    const drawing = partText(saved, "xl/drawings/drawing1.xml");
    const reopened = await fromXlsxWorkbook(saved);

    expect(packageProblems(saved)).toEqual([]);
    expect(drawingCount(saved)).toBe(1);
    expect(drawing).toContain("xdr:pic");
    expect(drawing).toContain('name="new-chart"');
    expect(partNames(saved)).toContain("xl/media/10000000000006450000032120C875D8.jpg");
    expect(sheetAt(reopened).charts).toEqual(first.charts);
    expect(reopened.workbook.xlsxSource?.parts.some((part) => part.name.endsWith(".jpg"))).toBe(
      true,
    );
  });

  it("keeps charts the model cannot hold beside Sheetwrite charts in one drawing", async () => {
    const unsupported = "xl/charts/sheetwrite-chart1-2.xml";
    const edited = editParts(await toXlsxWorkbook(authored()), {
      [unsupported]: (xml) => xml.replaceAll("c:barChart", "c:bar3DChart"),
    });
    const { warnings, onWarning } = collectWarnings();
    const imported = await fromXlsxWorkbook(withoutSidecar(edited), { onWarning });
    const supported = KINDS.filter((kind) => kind !== "bar");

    expect(sheetAt(imported).charts?.map((chart) => chart.kind)).toEqual(supported);
    expect(warnings).toContainEqual(
      expect.objectContaining({ code: "unsupported-feature", part: unsupported }),
    );
    expect(imported.workbook.xlsxSource?.parts.map((part) => part.name)).toContain(unsupported);

    // The kept chart's part name is the one export would generate first; export must pick another.
    const exported = await toXlsxWorkbook(imported);
    expect(packageProblems(exported)).toEqual([]);
    expect(drawingCount(exported)).toBe(1);
    expect(partText(exported, unsupported)).toContain("bar3DChart");
    const restored = await fromXlsxWorkbook(withoutSidecar(exported));
    expect(sheetAt(restored).charts?.map((chart) => chart.kind)).toEqual(supported);
  });

  it("sizes two-cell anchors from default and explicit column and row sizes", async () => {
    const bytes = withoutSidecar(await toXlsxWorkbook(authored()));
    const drawing = partText(bytes, DRAWING);
    const frame = drawing.match(/<xdr:graphicFrame\b[\s\S]*?<\/xdr:graphicFrame>/)?.[0];
    if (!frame) throw new Error("authored drawing has no chart frame");
    const marker = (row: number, col: number, offset: number) =>
      `<xdr:col>${col}</xdr:col><xdr:colOff>${offset}</xdr:colOff><xdr:row>${row}</xdr:row><xdr:rowOff>${offset}</xdr:rowOff>`;
    const namespaces = drawing.match(/<xdr:oneCellAnchor([^>]*)>/)?.[1] ?? "";
    const anchor = `<xdr:twoCellAnchor${namespaces}><xdr:from>${marker(0, 0, 9525)}</xdr:from><xdr:to>${marker(1_000, 300, 19050)}</xdr:to>${frame}<xdr:clientData/></xdr:twoCellAnchor>`;
    const imported = await fromXlsxWorkbook(
      editParts(bytes, {
        [DRAWING]: (xml) => xml.replace(/<xdr:oneCellAnchor\b[\s\S]*<\/xdr:oneCellAnchor>/, anchor),
        "xl/worksheets/sheet1.xml":
          '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols><col min="2" max="2" width="20" customWidth="1"/></cols><sheetData><row r="2" ht="30" customHeight="1"/></sheetData></worksheet>',
      }),
    );

    expect(sheetAt(imported).charts?.[0]?.anchor).toEqual({
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
    const owner = sheetAt(snapshot);
    const [chart] = owner.charts ?? [];
    if (!chart) throw new Error("authored workbook has no chart");
    owner.charts = Array.from({ length: 100 }, (_, index) => ({ ...chart, id: `chart-${index}` }));
    const bytes = withoutSidecar(await toXlsxWorkbook(snapshot));
    const anchor = partText(bytes, DRAWING).match(
      /<xdr:oneCellAnchor\b[^>]*>[\s\S]*?<\/xdr:oneCellAnchor>/,
    )?.[0];
    if (!anchor) throw new Error("authored drawing has no chart anchor");
    const { warnings, onWarning } = collectWarnings();
    const imported = await fromXlsxWorkbook(
      editParts(bytes, {
        [DRAWING]: (xml) =>
          xml.replace(
            "</xdr:wsDr>",
            `${anchor.replace('r:id="rId1"', 'r:id="overflow"')}</xdr:wsDr>`,
          ),
        "xl/drawings/_rels/sheetwrite-drawing1.xml.rels": (xml) =>
          xml.replace(
            "</Relationships>",
            '<Relationship Id="overflow" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="/xl/charts/overflow.xml"/></Relationships>',
          ),
        "xl/charts/overflow.xml": "<not-well-formed",
      }),
      { onWarning },
    );

    expect(sheetAt(imported).charts).toHaveLength(100);
    expect(warnings).toContainEqual(
      expect.objectContaining({ code: "unsupported-feature", part: "xl/charts/overflow.xml" }),
    );
    expect(imported.workbook.xlsxSource?.parts.map((part) => part.name)).toContain(
      "xl/charts/overflow.xml",
    );
  });

  it("reads series ranges written with lower-case column letters", async () => {
    const bytes = await toXlsxWorkbook(authored());
    const expected = await fromXlsxWorkbook(withoutSidecar(bytes));
    const chartPart = "xl/charts/sheetwrite-chart1-1.xml";
    const lowered = editParts(bytes, {
      [chartPart]: (xml) =>
        xml.replace(
          /<c:f>([^<]*)<\/c:f>/g,
          (_formula: string, source: string) =>
            `<c:f>${source.replace(/\$([A-Z]{1,3})\$/g, (column: string) => column.toLowerCase())}</c:f>`,
        ),
    });
    expect(partText(lowered, chartPart)).toMatch(/<c:f>[^<]*\$[a-z]+\$/);

    const imported = await fromXlsxWorkbook(withoutSidecar(lowered));
    expect(sheetAt(imported).charts?.[0]?.series).toEqual(
      sheetAt(expected).charts?.[0]?.series ?? [],
    );
  });
});
