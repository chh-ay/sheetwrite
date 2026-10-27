import { beforeAll, describe, expect, it } from "bun:test";

import {
  fromXlsxWorkbook,
  initSheetwrite,
  type PivotDefinition,
  type SheetSnapshot,
  SheetwriteStore,
  toXlsxWorkbook,
  type WorkbookSnapshot,
  type XlsxWorkbookWarning,
} from "@sheetwrite/core";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

import { registerXlsxBackends } from "../src/index.js";

const SAMPLE = new URL("fixtures/preserve-ExcelPivotTableSample.xlsx", import.meta.url);
/** Serials of the sample's dates: 2022-01-01, 2022-01-03, 2022-11-11 and 2022-11-13. */
const JAN_1 = 44562;
const JAN_3 = 44564;
const NOV_11 = 44876;
const NOV_13 = 44878;

async function sample(): Promise<Uint8Array> {
  return new Uint8Array(await Bun.file(SAMPLE).arrayBuffer());
}

function sheetNamed(snapshot: WorkbookSnapshot, name: string): SheetSnapshot {
  const sheet = snapshot.sheets.find((candidate) => candidate.name === name);
  if (!sheet) throw new Error(`sheet ${name} is missing`);
  return sheet;
}

function cellCount(sheet: SheetSnapshot): number {
  return sheet.cells.reduce((total, block) => total + block.cells.length, 0);
}

function collect(): {
  warnings: XlsxWorkbookWarning[];
  onWarning(warning: XlsxWorkbookWarning): void;
} {
  const warnings: XlsxWorkbookWarning[] = [];
  return { warnings, onWarning: (warning) => warnings.push(warning) };
}

function text(bytes: Uint8Array, part: string): string {
  return strFromU8(unzipSync(bytes)[part] ?? new Uint8Array());
}

function literal(value: string | number | boolean | null) {
  return { kind: "literal" as const, value };
}

/** A data sheet and an empty report sheet that holds `pivots`. */
function authored(pivots: PivotDefinition[]): WorkbookSnapshot {
  const rows: (string | number | boolean | null)[][] = [
    ["Region", "Product", "Units", "Flag"],
    ["East", "Pen", 3, true],
    ["West", "Pen", 5, false],
    ["East", "Ink", 2.5, null],
    ["West", "Ink", 7, true],
    ["North", "Pen", 1, false],
  ];
  const column = (key: string) => ({ key, header: key, width: 80, type: "text" as const });
  return {
    schemaVersion: 1,
    workbook: { activeSheet: "report" },
    sheets: [
      {
        id: "data",
        name: "Data",
        order: 0,
        rowCount: rows.length,
        columns: ["a", "b", "c", "d"].map(column),
        cells: [
          {
            startRow: 0,
            startCol: 0,
            rowCount: rows.length,
            colCount: 4,
            cells: rows.flatMap((row, rowOffset) =>
              row.flatMap((value, colOffset) =>
                value === null ? [] : [{ rowOffset, colOffset, value: literal(value) }],
              ),
            ),
          },
        ],
      },
      {
        id: "report",
        name: "Report",
        order: 1,
        rowCount: 20,
        columns: ["a", "b", "c", "d"].map(column),
        pivots,
        cells: [],
      },
    ],
  };
}

const DATA_RANGE = { sheet: "data", start: { row: 0, col: 0 }, end: { row: 5, col: 3 } };

beforeAll(async () => {
  await initSheetwrite();
  registerXlsxBackends();
});

describe("XLSX pivot tables", () => {
  it("maps Excel's range and table pivots, hidden items and page fields to definitions", async () => {
    const { warnings, onWarning } = collect();
    const snapshot = await fromXlsxWorkbook(await sample(), { onWarning });
    const source = sheetNamed(snapshot, "Tabelle1");
    const table = source.tables?.[0]?.id;

    expect(sheetNamed(snapshot, "Tabelle2").pivots).toEqual([
      {
        id: "xlsx-pivot-2-1",
        name: "PivotTable1",
        source: { range: { sheet: source.id, start: { row: 0, col: 0 }, end: { row: 3, col: 2 } } },
        anchor: { row: 2, col: 0 },
        rows: [0],
        columns: [2],
        values: [{ field: 1, aggregation: "SUM", name: "Summe von Field2" }],
        filters: [
          { field: 0, values: ["a", "c"] },
          { field: 2, values: [JAN_1, JAN_3] },
        ],
        savedOutput: {
          rows: 5,
          cols: 4,
          cells: [
            "Summe von Field2",
            "Spaltenbeschriftungen",
            null,
            null,
            "Zeilenbeschriftungen",
            JAN_1,
            JAN_3,
            "Gesamtergebnis",
            "a",
            1,
            null,
            1,
            "c",
            null,
            3,
            3,
            "Gesamtergebnis",
            1,
            3,
            4,
          ],
        },
      },
    ]);
    expect(sheetNamed(snapshot, "Tabelle3").pivots).toEqual([
      {
        id: "xlsx-pivot-3-1",
        name: "PivotTable1",
        source: { table: table ?? "" },
        anchor: { row: 2, col: 0 },
        rows: [0],
        columns: [],
        values: [{ field: 1, aggregation: "SUM", name: "Summe von Field2" }],
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

  it("reads back what it writes from an Excel pivot, with a refreshable cache", async () => {
    const imported = await fromXlsxWorkbook(await sample());

    const saved = await toXlsxWorkbook(imported);
    const reopened = await fromXlsxWorkbook(saved);

    expect(reopened.sheets.map((sheet) => sheet.pivots)).toEqual(
      imported.sheets.map((sheet) => sheet.pivots),
    );
    expect(text(saved, "xl/pivotCache/pivotCacheDefinition1.xml")).toContain('refreshOnLoad="1"');
    expect(unzipSync(saved)["xl/pivotCache/pivotCacheRecords1.xml"]).toBeUndefined();
  });
  it("loads Excel output into the default engine, formulas and a saved XLSX without persisting derived cells", async () => {
    const imported = await fromXlsxWorkbook(await sample());
    const report = sheetNamed(imported, "Tabelle3");
    report.rowCount = Math.max(report.rowCount, 10);
    const store = SheetwriteStore.fromSnapshot(imported);
    try {
      expect(store.getCell({ sheet: report.id, row: 5, col: 1 }).resolved).toBe(44);
      expect(store.getPivotResult(report.id, "xlsx-pivot-3-1")?.status).toBe("saved");
      expect(
        store.applyTransaction({
          patches: [
            {
              op: "set",
              addr: { sheet: report.id, row: 8, col: 0 },
              value: { kind: "formula", src: "=SUM(B4:B5)" },
            },
          ],
        }).status,
      ).toBe("applied");
      expect(store.getCell({ sheet: report.id, row: 8, col: 0 }).resolved).toBe(44);
      const exported = store.exportSnapshot();
      expect(cellCount(sheetNamed(exported, "Tabelle3"))).toBe(1);
      const reopened = await fromXlsxWorkbook(await toXlsxWorkbook(exported));
      expect(sheetNamed(reopened, "Tabelle3").pivots).toEqual(report.pivots);
      const restored = SheetwriteStore.fromSnapshot(reopened);
      try {
        expect(restored.getCell({ sheet: report.id, row: 5, col: 1 }).resolved).toBe(44);
        expect(restored.getCell({ sheet: report.id, row: 8, col: 0 }).resolved).toBe(44);
      } finally {
        restored.dispose();
      }
    } finally {
      store.dispose();
    }
  });

  it("round-trips aggregations, totals, subtotals, sorting, layout and blank or logical filters", async () => {
    const pivot: PivotDefinition = {
      id: "units",
      name: "Units by region",
      source: { range: DATA_RANGE },
      anchor: { row: 2, col: 1 },
      rows: [0],
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
    };

    const saved = await toXlsxWorkbook(authored([pivot]));
    const reopened = await fromXlsxWorkbook(saved);

    expect(unzipSync(saved)["xl/pivotTables/pivotTable1.xml"]).toBeDefined();
    expect(sheetNamed(reopened, "Report").pivots).toEqual([pivot]);
  });

  it("keeps pivots that OOXML cannot express in Sheetwrite metadata, with a warning", async () => {
    const distinct: PivotDefinition = {
      id: "distinct",
      name: "Distinct products",
      source: { range: DATA_RANGE },
      anchor: { row: 0, col: 0 },
      rows: [0],
      columns: [],
      values: [{ field: 1, aggregation: "DISTINCTCOUNT" }],
    };
    const orphan: PivotDefinition = {
      id: "orphan",
      name: "Deleted source",
      source: {
        range: { sheet: "gone", start: { row: 0, col: 0 }, end: { row: 9, col: 1 } },
        invalid: true,
      },
      anchor: { row: 10, col: 0 },
      rows: [0],
      columns: [],
      values: [{ field: 1, aggregation: "SUM" }],
    };
    const { warnings, onWarning } = collect();

    const saved = await toXlsxWorkbook(authored([distinct, orphan]), { onWarning });
    const reopened = await fromXlsxWorkbook(saved);

    expect(Object.keys(unzipSync(saved)).some((part) => part.includes("pivot"))).toBe(false);
    expect(warnings.map((warning) => warning.message)).toEqual([
      expect.stringContaining("Distinct products was not written as a native pivot"),
      expect.stringContaining("Deleted source was not written as a native pivot"),
    ]);
    expect(sheetNamed(reopened, "Report").pivots).toEqual([distinct, orphan]);
  });

  it("restores only metadata-only pivots once another application deleted the native one", async () => {
    const native: PivotDefinition = {
      id: "units",
      name: "Units",
      source: { range: DATA_RANGE },
      anchor: { row: 0, col: 0 },
      rows: [0],
      columns: [],
      values: [{ field: 2, aggregation: "SUM" }],
    };
    const metadataOnly: PivotDefinition = {
      ...native,
      id: "distinct",
      name: "Distinct",
      anchor: { row: 10, col: 0 },
      values: [{ field: 1, aggregation: "DISTINCTCOUNT" }],
    };
    const files = unzipSync(await toXlsxWorkbook(authored([native, metadataOnly])));
    // Deleting the pivot in Excel removes its relationship but keeps the metadata sheet.
    for (const part of Object.keys(files)) {
      if (part.endsWith(".rels")) {
        files[part] = strToU8(
          strFromU8(files[part] ?? new Uint8Array()).replace(
            /<Relationship [^>]*\/pivotTable"[^>]*\/>/g,
            "",
          ),
        );
      }
    }

    const reopened = await fromXlsxWorkbook(zipSync(files));

    expect(sheetNamed(reopened, "Report").pivots).toEqual([metadataOnly]);
  });

  it("gives new pivots part names and cache ids that preserved pivots do not use", async () => {
    const files = unzipSync(await sample());
    for (const part of ["xl/pivotTables/pivotTable1.xml", "xl/pivotTables/pivotTable2.xml"]) {
      files[part] = strToU8(
        strFromU8(files[part] ?? new Uint8Array()).replace(
          'baseItem="0"/>',
          'baseItem="0" showDataAs="percentOfTotal"/>',
        ),
      );
    }
    const imported = await fromXlsxWorkbook(zipSync(files));
    const source = sheetNamed(imported, "Tabelle1");
    source.pivots = [
      {
        id: "added",
        name: "Added",
        source: { range: { sheet: source.id, start: { row: 0, col: 0 }, end: { row: 3, col: 2 } } },
        anchor: { row: 0, col: 6 },
        rows: [0],
        columns: [],
        values: [{ field: 1, aggregation: "SUM" }],
      },
    ];

    const saved = await toXlsxWorkbook(imported);
    const cacheIds = [
      ...text(saved, "xl/workbook.xml").matchAll(/<pivotCache cacheId="(\d+)"/g),
    ].map((match) => match[1]);
    const reopened = await fromXlsxWorkbook(saved);

    expect(new Set(cacheIds).size).toBe(3);
    expect(text(saved, "xl/pivotTables/pivotTable1.xml")).toContain("percentOfTotal");
    expect(sheetNamed(reopened, "Tabelle1").pivots?.map((pivot) => pivot.id)).toEqual(["added"]);
    expect(
      reopened.workbook.xlsxSource?.graphs.filter((graph) => graph.type.endsWith("/pivotTable")),
    ).toHaveLength(2);
  });

  const unsupported: [string, string, string][] = [
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
  ];
  for (const [feature, find, replace] of unsupported) {
    it(`keeps a pivot with ${feature} as an opaque part, with its rendered cells and a warning`, async () => {
      const files = unzipSync(await sample());
      const part = "xl/pivotTables/pivotTable1.xml";
      const original = strFromU8(files[part] ?? new Uint8Array());
      expect(original).toContain(find);
      files[part] = strToU8(original.replace(find, replace));
      const { warnings, onWarning } = collect();

      const snapshot = await fromXlsxWorkbook(zipSync(files), { onWarning });
      const owner = sheetNamed(snapshot, "Tabelle2");

      expect(owner.pivots).toBeUndefined();
      expect(cellCount(owner)).toBeGreaterThan(0);
      expect(warnings).toContainEqual(
        expect.objectContaining({ code: "unsupported-feature", part, sheet: "Tabelle2" }),
      );
      expect(snapshot.workbook.xlsxSource?.graphs.map((graph) => graph.target)).toContain(part);
    });
  }
  it("keeps a saved pivot and its source blocker through XLSX export", async () => {
    const pivot: PivotDefinition = {
      id: "blocked",
      name: "Blocked",
      source: { range: DATA_RANGE },
      anchor: { row: 2, col: 1 },
      rows: [0],
      columns: [],
      values: [{ field: 2, aggregation: "SUM" }],
      savedOutput: { rows: 2, cols: 2, cells: ["Excel", 10, 20, 30] },
    };
    const input = authored([pivot]);
    const report = sheetNamed(input, "Report");
    report.cells.push({
      startRow: 2,
      startCol: 1,
      rowCount: 1,
      colCount: 1,
      cells: [{ rowOffset: 0, colOffset: 0, value: literal(7) }],
    });
    const reopened = await fromXlsxWorkbook(await toXlsxWorkbook(input));
    expect(sheetNamed(reopened, "Report").pivots).toEqual([pivot]);
    const store = SheetwriteStore.fromSnapshot(reopened);
    try {
      expect(store.getCell({ sheet: "report", row: 2, col: 1 }).resolved).toBe(7);
      expect(store.getPivotResult("report", pivot.id)?.error).toBe("#SPILL!");
    } finally {
      store.dispose();
    }
  });

  it("prefers output another application rendered over saved output kept for a blocked pivot", async () => {
    const pivot: PivotDefinition = {
      id: "refreshed",
      name: "Refreshed",
      source: { range: DATA_RANGE },
      anchor: { row: 2, col: 1 },
      rows: [0],
      columns: [],
      values: [{ field: 2, aggregation: "SUM" }],
      savedOutput: { rows: 2, cols: 2, cells: ["Stale", 10, 20, 30] },
    };
    const blocked = authored([pivot]);
    sheetNamed(blocked, "Report").cells.push({
      startRow: 2,
      startCol: 1,
      rowCount: 1,
      colCount: 1,
      cells: [{ rowOffset: 0, colOffset: 0, value: literal(7) }],
    });
    const fresh = { rows: 2, cols: 2, cells: ["Fresh", 1, 2, 3] };
    const blockedFiles = unzipSync(await toXlsxWorkbook(blocked));
    const refreshedFiles = unzipSync(
      await toXlsxWorkbook(authored([{ ...pivot, savedOutput: fresh }])),
    );
    // Excel cleared the blocker and refreshed: the report sheet and the
    // pivot location change, the Sheetwrite metadata does not.
    const reportPart = "xl/worksheets/sheet2.xml";
    const tablePart = "xl/pivotTables/pivotTable1.xml";
    expect(text(zipSync(refreshedFiles), reportPart)).toContain("Fresh");
    for (const part of [reportPart, tablePart]) {
      const refreshedPart = refreshedFiles[part];
      if (!refreshedPart) throw new Error(`${part} is missing`);
      blockedFiles[part] = refreshedPart;
    }

    const reopened = sheetNamed(await fromXlsxWorkbook(zipSync(blockedFiles)), "Report");

    expect(reopened.pivots).toEqual([{ ...pivot, savedOutput: fresh }]);
    expect(cellCount(reopened)).toBe(0);
  });
});
