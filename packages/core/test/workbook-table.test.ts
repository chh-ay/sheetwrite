import { beforeAll, describe, expect, it } from "bun:test";
import {
  assertWorkbookTables,
  type Column,
  type DocumentOp,
  initSheetwrite,
  rebaseDocumentOperations,
  SheetwriteError,
  SheetwriteStore,
  validateWorkbookSnapshot,
  type Workbook,
  type WorkbookSnapshot,
  type WorkbookTable,
} from "../src/index.js";

const columns = (count: number): Column[] =>
  Array.from({ length: count }, (_, index) => ({
    key: `column-${index}`,
    header: `Column ${index}`,
    width: 100,
    type: "number" as const,
  }));

const table = (name = "Sales"): WorkbookTable => ({
  id: "table-sales",
  name,
  range: {
    sheet: "data",
    start: { row: 0, col: 0 },
    end: { row: 3, col: 1 },
  },
  columns: [
    { id: "amount-id", name: "Amount" },
    { id: "quantity-id", name: "Quantity" },
  ],
  headerRow: true,
  totalsRow: false,
  style: { name: "TableStyleMedium2", showRowStripes: true },
});

const workbook = (tables: WorkbookTable[] = []): Workbook => ({
  activeSheet: "data",
  sheets: [
    {
      id: "data",
      name: "Data",
      rowCount: 8,
      columns: columns(3),
      ...(tables.length > 0 ? { tables } : {}),
    },
    { id: "summary", name: "Summary", rowCount: 4, columns: columns(2) },
  ],
});

const snapshot = (tables: WorkbookTable[] = []): WorkbookSnapshot => ({
  schemaVersion: 1,
  workbook: { activeSheet: "data" },
  sheets: workbook(tables).sheets.map((sheet, order) => ({
    id: sheet.id,
    name: sheet.name,
    order,
    rowCount: sheet.rowCount,
    columns: sheet.columns,
    ...(sheet.tables ? { tables: sheet.tables } : {}),
    cells: [],
  })),
});

beforeAll(async () => {
  await initSheetwrite();
});

describe("canonical workbook tables", () => {
  it("rejects case-insensitive table/defined-name collisions in both creation orders", () => {
    const namedFirst = workbook();
    namedFirst.namedRanges = [
      {
        name: "sales",
        range: { sheet: "data", start: { row: 1, col: 0 }, end: { row: 2, col: 0 } },
      },
    ];
    const firstStore = new SheetwriteStore(namedFirst);
    expect(
      firstStore.applyTransaction({ patches: [{ op: "addTable", table: table("Sales") }] }).status,
    ).not.toBe("applied");
    firstStore.dispose();

    const secondStore = new SheetwriteStore(workbook([table("CAFÉ")]));
    expect(
      secondStore.applyTransaction({
        patches: [
          {
            op: "setNamedRange",
            namedRange: {
              name: "café",
              range: { sheet: "data", start: { row: 1, col: 0 }, end: { row: 2, col: 0 } },
            },
          },
        ],
      }).status,
    ).not.toBe("applied");
    secondStore.dispose();
  });

  it("requires NFC names and rejects namespace-conflicting snapshots before allocation", () => {
    const nonCanonical = snapshot([table("Cafe\u0301")]);
    expect(validateWorkbookSnapshot(nonCanonical).ok).toBe(false);

    const duplicateColumnIds = snapshot([table()]);
    duplicateColumnIds.sheets[0]!.tables![0]!.columns[1]!.id = "AMOUNT-ID";
    expect(validateWorkbookSnapshot(duplicateColumnIds).ok).toBe(false);

    const collision = snapshot([table("Sales")]);
    collision.workbook.namedRanges = [
      {
        name: "sales",
        range: { sheet: "data", start: { row: 1, col: 0 }, end: { row: 2, col: 0 } },
      },
    ];
    const checked = validateWorkbookSnapshot(collision);
    expect(checked.ok).toBe(false);
    if (checked.ok) throw new Error("expected collision rejection");
    expect(checked.errors).toContainEqual(
      expect.objectContaining({ path: "workbook.namedRanges[0].name", code: "duplicate-id" }),
    );

    expect(() =>
      assertWorkbookTables(workbook([table()]).sheets, {
        maxTables: 0,
        maxColumnsPerTable: 2,
        maxIdLength: 128,
        maxNameLength: 255,
        maxStyleNameLength: 128,
        maxUnsupportedFeaturesPerTable: 16,
      }),
    ).toThrow(SheetwriteError);
  });

  it("preserves stable identities across row and column structure changes", () => {
    const store = new SheetwriteStore(workbook([table()]));
    store.applyTransaction({ patches: [{ op: "addRows", sheet: "data", at: 2, count: 1 }] });
    expect(store.getWorkbook().sheets[0]!.tables![0]!.range.end.row).toBe(4);
    store.applyTransaction({ patches: [{ op: "removeRows", sheet: "data", at: 2, count: 1 }] });
    expect(store.getWorkbook().sheets[0]!.tables![0]!.range.end.row).toBe(3);

    store.applyTransaction({
      patches: [
        {
          op: "addColumns",
          sheet: "data",
          at: 1,
          columns: [{ key: "inserted", header: "Inserted", width: 100, type: "number" }],
        },
      ],
    });
    const inserted = store.getWorkbook().sheets[0]!.tables![0]!;
    expect(inserted.columns.map((column) => column.id)).toEqual([
      "amount-id",
      "inserted",
      "quantity-id",
    ]);
    expect(inserted.range.end.col).toBe(2);

    store.applyTransaction({
      patches: [{ op: "removeColumns", sheet: "data", at: 1, count: 1 }],
    });
    expect(store.getWorkbook().sheets[0]!.tables![0]!.columns.map((column) => column.id)).toEqual([
      "amount-id",
      "quantity-id",
    ]);

    store.applyTransaction({
      patches: [{ op: "renameSheet", sheet: "data", name: "Renamed Data" }],
    });
    expect(store.getWorkbook().sheets[0]!.tables![0]!.range.sheet).toBe("data");
    store.applyTransaction({ patches: [{ op: "removeSheet", sheet: "data" }] });
    expect(store.getWorkbook().sheets.map((sheet) => sheet.id)).toEqual(["summary"]);
    store.dispose();
  });

  it("rebases table ranges through structure and conflicts on one stable identity", () => {
    const rebasedTable = table();
    rebasedTable.range = {
      sheet: "data",
      start: { row: 2, col: 0 },
      end: { row: 5, col: 1 },
    };
    const local: DocumentOp[] = [{ op: "addTable", table: rebasedTable }];
    expect(
      rebaseDocumentOperations(local, [{ op: "addRows", sheet: "data", at: 0, count: 2 }]),
    ).toEqual({
      status: "rebased",
      operations: [
        {
          op: "addTable",
          table: {
            ...table(),
            ...rebasedTable,
            range: {
              sheet: "data",
              start: { row: 4, col: 0 },
              end: { row: 7, col: 1 },
            },
          },
        },
      ],
    });

    const conflict = rebaseDocumentOperations(
      [{ op: "removeTable", sheet: "data", tableId: "table-sales" }],
      [
        {
          op: "updateTable",
          sheet: "data",
          tableId: "table-sales",
          patch: { name: "Revenue" },
        },
      ],
    );
    expect(conflict.status).toBe("conflict");
  });
});
