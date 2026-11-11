import { beforeAll, describe, expect, it } from "bun:test";

import {
  fromXlsxWorkbook,
  initSheetwrite,
  type PivotDefinition,
  type SheetSnapshot,
  SheetwriteStore,
  toXlsxWorkbook,
  type WorkbookSnapshot,
} from "@sheetwrite/core";

import { xlsxAddon } from "../src/index.js";
import {
  block,
  book,
  collectWarnings,
  editParts,
  fixture,
  partNames,
  partText,
  range,
  sheet,
  sheetNamed,
} from "./workbook-fixtures.js";

const SAMPLE = "preserve-ExcelPivotTableSample.xlsx";
const TABLE_ONE = "xl/pivotTables/pivotTable1.xml";
const TABLE_TWO = "xl/pivotTables/pivotTable2.xml";
/** Serials of the sample's dates: 2022-01-01, 2022-01-03, 2022-11-11 and 2022-11-13. */
const [JAN_1, JAN_3, NOV_11, NOV_13] = [44562, 44564, 44876, 44878];
const DATA_RANGE = range("data", 0, 0, 5, 3);

const cellCount = (owner: SheetSnapshot) =>
  owner.cells.reduce((total, entry) => total + entry.cells.length, 0);

/** The sample with `find` replaced by `replace` in both of its pivot tables. */
async function editedSample(find: string, replace: string, parts = [TABLE_ONE, TABLE_TWO]) {
  const sample = await fixture(SAMPLE);
  return editParts(
    sample,
    Object.fromEntries(parts.map((part) => [part, (xml: string) => xml.replace(find, replace)])),
  );
}

/** A data sheet and a report sheet that holds `pivots`. */
function authored(pivots: PivotDefinition[]): WorkbookSnapshot {
  return book(
    [
      sheet("data", "Data", [
        ["Region", "Product", "Units", "Flag"],
        ["East", "Pen", 3, true],
        ["West", "Pen", 5, false],
        ["East", "Ink", 2.5, null],
        ["West", "Ink", 7, true],
        ["North", "Pen", 1, false],
      ]),
      sheet("report", "Report", [[null, null, null, null]], { rowCount: 20, pivots }),
    ],
    { activeSheet: "report" },
  );
}

const pivotOn = (overrides: Partial<PivotDefinition>): PivotDefinition => ({
  id: "units",
  name: "Units",
  source: { range: DATA_RANGE },
  anchor: { row: 0, col: 0 },
  rows: [0],
  columns: [],
  values: [{ field: 2, aggregation: "SUM" }],
  ...overrides,
});

beforeAll(async () => {
  await initSheetwrite({ addons: [xlsxAddon()] });
});

describe("XLSX pivot tables", () => {
  it("maps Excel's range and table pivots, hidden items and page fields to definitions", async () => {
    const { warnings, onWarning } = collectWarnings();
    const snapshot = await fromXlsxWorkbook(await fixture(SAMPLE), { onWarning });
    const source = sheetNamed(snapshot, "Tabelle1");
    const values: PivotDefinition["values"] = [
      { field: 1, aggregation: "SUM", name: "Summe von Field2" },
    ];

    expect(sheetNamed(snapshot, "Tabelle2").pivots).toEqual([
      {
        id: "xlsx-pivot-2-1",
        name: "PivotTable1",
        source: { range: range(source.id, 0, 0, 3, 2) },
        anchor: { row: 2, col: 0 },
        rows: [0],
        columns: [2],
        values,
        filters: [
          { field: 0, values: ["a", "c"] },
          { field: 2, values: [JAN_1, JAN_3] },
        ],
        savedOutput: {
          rows: 5,
          cols: 4,
          // prettier-ignore
          cells: [
            "Summe von Field2", "Spaltenbeschriftungen", null, null,
            "Zeilenbeschriftungen", JAN_1, JAN_3, "Gesamtergebnis",
            "a", 1, null, 1,
            "c", null, 3, 3,
            "Gesamtergebnis", 1, 3, 4,
          ],
        },
      },
    ]);
    expect(sheetNamed(snapshot, "Tabelle3").pivots).toEqual([
      {
        id: "xlsx-pivot-3-1",
        name: "PivotTable1",
        source: { table: source.tables?.[0]?.id ?? "" },
        anchor: { row: 2, col: 0 },
        rows: [0],
        columns: [],
        values,
        filters: [{ field: 2, values: [NOV_11, NOV_13] }],
        savedOutput: {
          rows: 4,
          cols: 2,
          cells: [
            "Zeilenbeschriftungen",
            "Summe von Field2",
            "x",
            11,
            "z",
            33,
            "Gesamtergebnis",
            44,
          ],
        },
      },
    ]);
    // Excel's rendered output, page filter included, belongs to the pivot now.
    expect(cellCount(sheetNamed(snapshot, "Tabelle2"))).toBe(0);
    expect(cellCount(sheetNamed(snapshot, "Tabelle3"))).toBe(0);
    expect(
      snapshot.workbook.xlsxSource?.parts.some((part) => part.name.includes("pivot")) ?? false,
    ).toBe(false);
    expect(warnings.filter((warning) => warning.message.includes("Pivot"))).toEqual([]);
  });

  it("loads Excel output into the default engine, formulas and a refreshable saved XLSX without persisting derived cells", async () => {
    const imported = await fromXlsxWorkbook(await fixture(SAMPLE));
    const report = sheetNamed(imported, "Tabelle3");
    report.rowCount = Math.max(report.rowCount, 10);
    const store = SheetwriteStore.fromSnapshot(imported);
    expect(store.getCell({ sheet: report.id, row: 5, col: 1 }).resolved).toBe(44);
    expect(store.getPivotResult(report.id, "xlsx-pivot-3-1")?.status).toBe("saved");
    const sum = { sheet: report.id, row: 8, col: 0 };
    const patch = {
      op: "set" as const,
      addr: sum,
      value: { kind: "formula" as const, src: "=SUM(B4:B5)" },
    };
    expect(store.applyTransaction({ patches: [patch] }).status).toBe("applied");
    expect(store.getCell(sum).resolved).toBe(44);
    const exported = store.exportSnapshot();
    expect(cellCount(sheetNamed(exported, "Tabelle3"))).toBe(1);
    store.dispose();

    const saved = await toXlsxWorkbook(exported);
    expect(partText(saved, "xl/pivotCache/pivotCacheDefinition1.xml")).toContain(
      'refreshOnLoad="1"',
    );
    expect(partNames(saved)).not.toContain("xl/pivotCache/pivotCacheRecords1.xml");
    const reopened = await fromXlsxWorkbook(saved);
    expect(reopened.sheets.map((entry) => entry.pivots)).toEqual(
      imported.sheets.map((entry) => entry.pivots),
    );
    const restored = SheetwriteStore.fromSnapshot(reopened);
    expect(restored.getCell({ sheet: report.id, row: 5, col: 1 }).resolved).toBe(44);
    expect(restored.getCell(sum).resolved).toBe(44);
    restored.dispose();
  });

  it("round-trips aggregations, totals, subtotals, sorting, layout and blank or logical filters", async () => {
    const pivot = pivotOn({
      name: "Units by region",
      anchor: { row: 2, col: 1 },
      columns: [1],
      values: [
        { field: 2, aggregation: "SUM", name: "Total units" },
        { field: 2, aggregation: "COUNT" },
        { field: 0, aggregation: "COUNTA" },
        { field: 2, aggregation: "AVERAGE" },
        { field: 2, aggregation: "MIN" },
        { field: 2, aggregation: "MAX" },
      ],
      filters: [
        { field: 0, values: ["East", "West"] },
        { field: 3, values: [true, null] },
      ],
      sort: [{ axis: "rows", field: 0, descending: true }],
      rowTotals: false,
      columnTotals: false,
      subtotals: false,
      layout: "tabular",
    });
    const saved = await toXlsxWorkbook(authored([pivot]));
    expect(partNames(saved)).toContain(TABLE_ONE);
    expect(sheetNamed(await fromXlsxWorkbook(saved), "Report").pivots).toEqual([pivot]);
  });

  it("keeps pivots that OOXML cannot express in Sheetwrite metadata, with a warning", async () => {
    const distinct = pivotOn({
      id: "distinct",
      name: "Distinct products",
      values: [{ field: 1, aggregation: "DISTINCTCOUNT" }],
    });
    const orphan = pivotOn({
      id: "orphan",
      name: "Deleted source",
      source: { range: range("gone", 0, 0, 9, 1), invalid: true },
      anchor: { row: 10, col: 0 },
      values: [{ field: 1, aggregation: "SUM" }],
    });
    const { warnings, onWarning } = collectWarnings();
    const saved = await toXlsxWorkbook(authored([distinct, orphan]), { onWarning });

    expect(partNames(saved).some((part) => part.includes("pivot"))).toBe(false);
    expect(warnings.map((warning) => warning.message)).toEqual([
      expect.stringContaining("Distinct products was not written as a native pivot"),
      expect.stringContaining("Deleted source was not written as a native pivot"),
    ]);
    expect(sheetNamed(await fromXlsxWorkbook(saved), "Report").pivots).toEqual([distinct, orphan]);
  });

  it("restores only metadata-only pivots once another application deleted the native one", async () => {
    const metadataOnly = pivotOn({
      id: "distinct",
      name: "Distinct",
      anchor: { row: 10, col: 0 },
      values: [{ field: 1, aggregation: "DISTINCTCOUNT" }],
    });
    const saved = await toXlsxWorkbook(authored([pivotOn({}), metadataOnly]));
    // Deleting the pivot in Excel removes its relationship but keeps the metadata sheet.
    const withoutPivot = (xml: string) =>
      xml.replace(/<Relationship [^>]*\/pivotTable"[^>]*\/>/g, "");
    const edited = editParts(
      saved,
      Object.fromEntries(
        partNames(saved)
          .filter((part) => part.endsWith(".rels"))
          .map((part) => [part, withoutPivot]),
      ),
    );
    expect(sheetNamed(await fromXlsxWorkbook(edited), "Report").pivots).toEqual([metadataOnly]);
  });

  it("gives new pivots part names and cache ids that preserved pivots do not use", async () => {
    const imported = await fromXlsxWorkbook(
      await editedSample('baseItem="0"/>', 'baseItem="0" showDataAs="percentOfTotal"/>'),
    );
    const source = sheetNamed(imported, "Tabelle1");
    source.pivots = [
      pivotOn({
        id: "added",
        name: "Added",
        source: { range: range(source.id, 0, 0, 3, 2) },
        anchor: { row: 0, col: 6 },
        values: [{ field: 1, aggregation: "SUM" }],
      }),
    ];

    const saved = await toXlsxWorkbook(imported);
    const cacheIds = [
      ...partText(saved, "xl/workbook.xml").matchAll(/<pivotCache cacheId="(\d+)"/g),
    ].map((match) => match[1]);
    expect(new Set(cacheIds).size).toBe(3);
    expect(partText(saved, TABLE_ONE)).toContain("percentOfTotal");
    const reopened = await fromXlsxWorkbook(saved);
    expect(sheetNamed(reopened, "Tabelle1").pivots?.map((pivot) => pivot.id)).toEqual(["added"]);
    expect(
      reopened.workbook.xlsxSource?.graphs.filter((graph) => graph.type.endsWith("/pivotTable")),
    ).toHaveLength(2);
  });

  it.each([
    ["values shown as a share", 'baseItem="0"/>', 'baseItem="0" showDataAs="percentOfTotal"/>'],
    ["a product summary", 'baseItem="0"/>', 'baseItem="0" subtotal="product"/>'],
    [
      "Show All Items",
      '<pivotField axis="axisRow" showAll="0">',
      '<pivotField axis="axisRow" showAll="1">',
    ],
    [
      "Show All Items by default",
      '<pivotField axis="axisRow" showAll="0">',
      '<pivotField axis="axisRow">',
    ],
    [
      "a manual item order",
      '<item x="0"/><item h="1" x="1"/><item x="2"/>',
      '<item x="2"/><item h="1" x="1"/><item x="0"/>',
    ],
    [
      "values outside the innermost column field",
      '<colFields count="1"><field x="2"/></colFields>',
      '<colFields count="2"><field x="-2"/><field x="2"/></colFields>',
    ],
    [
      "the outline layout",
      '<pivotField axis="axisRow" showAll="0">',
      '<pivotField axis="axisRow" compact="0" showAll="0">',
    ],
  ])(
    "keeps a pivot with %s as an opaque part, with its rendered cells and a warning",
    async (_feature, find, replace) => {
      const sample = await fixture(SAMPLE);
      expect(partText(sample, TABLE_ONE)).toContain(find);
      const { warnings, onWarning } = collectWarnings();
      const snapshot = await fromXlsxWorkbook(await editedSample(find, replace, [TABLE_ONE]), {
        onWarning,
      });
      const owner = sheetNamed(snapshot, "Tabelle2");

      expect(owner.pivots).toBeUndefined();
      expect(cellCount(owner)).toBeGreaterThan(0);
      expect(warnings).toContainEqual(
        expect.objectContaining({
          code: "unsupported-feature",
          part: TABLE_ONE,
          sheet: "Tabelle2",
        }),
      );
      expect(snapshot.workbook.xlsxSource?.graphs.map((graph) => graph.target)).toContain(
        TABLE_ONE,
      );
    },
  );

  it("keeps a saved pivot and its source blocker, and prefers output another application rendered", async () => {
    const pivot = pivotOn({
      id: "blocked",
      name: "Blocked",
      anchor: { row: 2, col: 1 },
      savedOutput: { rows: 2, cols: 2, cells: ["Stale", 10, 20, 30] },
    });
    const blocked = authored([pivot]);
    sheetNamed(blocked, "Report").cells.push(block([[7]], 2, 1));
    const blockedBytes = await toXlsxWorkbook(blocked);

    const reopened = await fromXlsxWorkbook(blockedBytes);
    expect(sheetNamed(reopened, "Report").pivots).toEqual([pivot]);
    const store = SheetwriteStore.fromSnapshot(reopened);
    expect(store.getCell({ sheet: "report", row: 2, col: 1 }).resolved).toBe(7);
    expect(store.getPivotResult("report", pivot.id)?.error).toBe("#SPILL!");
    store.dispose();

    // Excel cleared the blocker and refreshed: the report sheet and the
    // pivot location change, the Sheetwrite metadata does not.
    const fresh = { rows: 2, cols: 2, cells: ["Fresh", 1, 2, 3] };
    const refreshed = await toXlsxWorkbook(authored([{ ...pivot, savedOutput: fresh }]));
    const reportPart = "xl/worksheets/sheet2.xml";
    expect(partText(refreshed, reportPart)).toContain("Fresh");
    const merged = editParts(blockedBytes, {
      [reportPart]: partText(refreshed, reportPart),
      [TABLE_ONE]: partText(refreshed, TABLE_ONE),
    });
    const report = sheetNamed(await fromXlsxWorkbook(merged), "Report");
    expect(report.pivots).toEqual([{ ...pivot, savedOutput: fresh }]);
    expect(cellCount(report)).toBe(0);
  });
});

describe("XLSX pivot value number formats", () => {
  it("writes a value field's number format as its dataField numFmtId", async () => {
    const pivot = pivotOn({
      values: [
        { field: 2, aggregation: "SUM", numberFormat: "$#,##0.00" },
        { field: 2, aggregation: "MAX", numberFormat: "0.00%" },
      ],
    });
    const bytes = await toXlsxWorkbook(authored([pivot]));
    // 0.00% is built-in format 10; the currency code is custom, from 164.
    expect(
      partText(bytes, TABLE_ONE)
        .match(/<dataField [^>]*>/g)
        ?.map((field) => field.match(/numFmtId="(\d+)"/)?.[1]),
    ).toEqual(["164", "10"]);
    expect(partText(bytes, "xl/styles.xml")).toContain(
      '<numFmt numFmtId="164" formatCode="$#,##0.00"/>',
    );
  });

  it("reads a dataField numFmtId from Excel as the value field's number format", async () => {
    const field = '<dataField name="Summe von Field2" fld="1" baseField="0" baseItem="0"';
    const snapshot = await fromXlsxWorkbook(
      await editedSample(`${field}/>`, `${field} numFmtId="3"/>`),
    );
    // Built-in format 3 is #,##0.
    expect(sheetNamed(snapshot, "Tabelle2").pivots?.[0]?.values).toEqual([
      { field: 1, aggregation: "SUM", name: "Summe von Field2", numberFormat: "#,##0" },
    ]);
  });
});
