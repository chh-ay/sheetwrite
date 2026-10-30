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

  it.each([
    [
      "markup attribute names",
      {
        name: "autoFilter",
        attributes: { ref: "A1:B4", 'ref" injected="1': "A1:B4" },
        text: "",
        children: [],
      },
    ],
    [
      "foreign elements",
      {
        name: "autoFilter",
        attributes: { ref: "A1:B4" },
        text: "",
        children: [{ name: "script", attributes: {}, text: "", children: [] }],
      },
    ],
    [
      "raw differential-style indices",
      {
        name: "autoFilter",
        attributes: { ref: "A1:B4" },
        text: "",
        children: [
          {
            name: "filterColumn",
            attributes: { colId: "0" },
            text: "",
            children: [
              {
                name: "colorFilter",
                attributes: { dxfId: "0" },
                text: "",
                children: [],
              },
            ],
          },
        ],
      },
    ],
    [
      "XML control characters",
      {
        name: "autoFilter",
        attributes: { ref: "A1:B4" },
        text: "\u0000",
        children: [],
      },
    ],
    [
      "oversized text",
      {
        name: "autoFilter",
        attributes: { ref: "A1:B4" },
        text: "x".repeat(1_048_577),
        children: [],
      },
    ],
  ])("rejects unsafe table-rule %s before snapshot allocation", (_name, autoFilter) => {
    const candidate = { ...table(), autoFilter };
    expect(validateWorkbookSnapshot(snapshot([candidate])).ok).toBe(false);
    expect(() => assertWorkbookTables(workbook([candidate]).sheets)).toThrow(SheetwriteError);
  });

  it("bounds table rule metadata in aggregate, not just each individual formula", () => {
    const candidate = table();
    const column = candidate.columns[0];
    if (!column) throw new Error("table fixture has no first column");
    column.calculatedColumnFormula = {
      name: "calculatedColumnFormula",
      attributes: {},
      text: "x".repeat(600_000),
      children: [],
    };
    column.totalsRowFormula = {
      name: "totalsRowFormula",
      attributes: {},
      text: "y".repeat(600_000),
      children: [],
    };
    column.totalsRowFunction = "custom";
    expect(validateWorkbookSnapshot(snapshot([candidate])).ok).toBe(false);
    expect(() => assertWorkbookTables(workbook([candidate]).sheets)).toThrow(SheetwriteError);
  });

  it("updates and explicitly removes persisted table rules without losing column formulas", () => {
    const candidate = table();
    const column = candidate.columns[0];
    if (!column) throw new Error("table fixture has no first column");
    column.calculatedColumnFormula = {
      name: "calculatedColumnFormula",
      attributes: { array: "0" },
      text: "[@Quantity]*2",
      children: [],
    };
    const autoFilter = {
      name: "autoFilter",
      attributes: { ref: "A1:B4" },
      text: "",
      children: [],
    };
    const sortState = {
      name: "sortState",
      attributes: { ref: "A2:B4", caseSensitive: "1" },
      text: "",
      children: [
        {
          name: "sortCondition",
          attributes: { ref: "A2:A4", descending: "1" },
          text: "",
          children: [],
        },
      ],
    };
    const store = new SheetwriteStore(workbook([candidate]));
    expect(
      store.applyTransaction({
        patches: [
          {
            op: "updateTable",
            sheet: "data",
            tableId: candidate.id,
            patch: { autoFilter, sortState },
          },
        ],
      }).status,
    ).toBe("applied");
    expect(store.getWorkbook().sheets[0]?.tables?.[0]).toMatchObject({ autoFilter, sortState });
    expect(
      store.applyTransaction({
        patches: [
          {
            op: "updateTable",
            sheet: "data",
            tableId: candidate.id,
            patch: { autoFilter: null, sortState: null },
          },
        ],
      }).status,
    ).toBe("applied");
    const updated = store.getWorkbook().sheets[0]?.tables?.[0];
    expect(updated?.autoFilter).toBeUndefined();
    expect(updated?.sortState).toBeUndefined();
    expect(updated?.columns[0]?.calculatedColumnFormula).toEqual(column.calculatedColumnFormula);
    store.dispose();
  });

  it("moves filter and sort rules with their columns and drops rules on deleted columns", () => {
    const candidate: WorkbookTable = {
      ...table(),
      autoFilter: {
        name: "autoFilter",
        attributes: { ref: "A1:B4" },
        text: "",
        children: [
          { name: "filterColumn", attributes: { colId: "0" }, text: "", children: [] },
          { name: "filterColumn", attributes: { colId: "1" }, text: "", children: [] },
        ],
      },
      sortState: {
        name: "sortState",
        attributes: { ref: "A2:B4" },
        text: "",
        children: [{ name: "sortCondition", attributes: { ref: "B2:B4" }, text: "", children: [] }],
      },
    };
    const store = new SheetwriteStore(workbook([candidate]));
    const current = (): WorkbookTable | undefined => store.getWorkbook().sheets[0]?.tables?.[0];
    const filterColumns = (): (string | undefined)[] | undefined =>
      current()?.autoFilter?.children.map((child) => child.attributes.colId);

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
    expect(filterColumns()).toEqual(["0", "2"]);
    expect(current()?.autoFilter?.attributes.ref).toBe("A1:C4");
    expect(current()?.sortState?.attributes.ref).toBe("A2:C4");
    expect(current()?.sortState?.children[0]?.attributes.ref).toBe("C2:C4");

    store.applyTransaction({ patches: [{ op: "removeColumns", sheet: "data", at: 0, count: 1 }] });
    expect(filterColumns()).toEqual(["1"]);
    expect(current()?.sortState?.children[0]?.attributes.ref).toBe("B2:B4");

    store.applyTransaction({ patches: [{ op: "removeColumns", sheet: "data", at: 1, count: 1 }] });
    expect(filterColumns()).toEqual([]);
    expect(current()?.sortState).toBeUndefined();
    store.dispose();
  });

  it("keeps a moved table column's metadata and its filter rule", () => {
    const candidate = table();
    const amount = candidate.columns[0];
    if (!amount) throw new Error("table fixture has no first column");
    amount.totalsRowLabel = "Total";
    amount.calculatedColumnFormula = {
      name: "calculatedColumnFormula",
      attributes: {},
      text: "[@Quantity]*2",
      children: [],
    };
    candidate.autoFilter = {
      name: "autoFilter",
      attributes: { ref: "A1:B4" },
      text: "",
      children: [{ name: "filterColumn", attributes: { colId: "0" }, text: "", children: [] }],
    };
    const store = new SheetwriteStore(workbook([candidate]));
    expect(
      store.applyTransaction({
        patches: [{ op: "moveColumns", sheet: "data", from: 0, count: 1, to: 1 }],
      }).status,
    ).toBe("applied");
    const moved = store.getWorkbook().sheets[0]?.tables?.[0];
    expect(moved?.columns.map((column) => column.id)).toEqual(["quantity-id", "amount-id"]);
    expect(moved?.columns[1]).toEqual(amount);
    expect(moved?.autoFilter?.children.map((child) => child.attributes.colId)).toEqual(["1"]);
    store.dispose();
  });

  it("does not restore a moved table on top of another table", () => {
    const single: WorkbookTable = {
      id: "table-single",
      name: "Single",
      range: { sheet: "data", start: { row: 0, col: 0 }, end: { row: 3, col: 0 } },
      columns: [{ id: "single-id", name: "Single" }],
      headerRow: true,
      totalsRow: false,
    };
    const wide: WorkbookTable = {
      id: "table-wide",
      name: "Wide",
      range: { sheet: "data", start: { row: 0, col: 1 }, end: { row: 3, col: 2 } },
      columns: [
        { id: "left-id", name: "Left" },
        { id: "right-id", name: "Right" },
      ],
      headerRow: true,
      totalsRow: false,
    };
    const store = new SheetwriteStore(workbook([single, wide]));
    expect(
      store.applyTransaction({
        patches: [{ op: "moveColumns", sheet: "data", from: 0, count: 1, to: 1 }],
      }).status,
    ).toBe("applied");
    const sheet = store.getWorkbook().sheets[0];
    if (!sheet) throw new Error("data sheet is missing");
    expect(() => assertWorkbookTables([sheet])).not.toThrow();
    expect(sheet.tables?.map((candidate) => candidate.id)).toEqual(["table-wide"]);
    store.dispose();
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
