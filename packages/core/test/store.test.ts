import { beforeAll, describe, expect, it } from "bun:test";
import {
  resolveTransactionResourceLimits,
  validateTransactionResources,
  validateWorkbookSnapshot,
} from "../src/document-protocol.js";
import { initSheetwrite } from "../src/grid.js";
import { SheetwriteStore } from "../src/store.js";
import type {
  ChangeEvent,
  DocumentOp,
  Transaction,
  Workbook,
  WorkbookSnapshot,
} from "../src/types.js";
import { makeColumnarData, makeWorkbook } from "./fixtures.js";

const addr = (row: number, col: number) => ({ sheet: "s1", row, col });

const ALL_SOURCE_COLUMN_BANDS = [{ start: 0, end: 3, keys: ["name", "amount", "city"] }] as const;
const NAME_SOURCE_COLUMN_BAND = [{ start: 0, end: 1, keys: ["name"] }] as const;

beforeAll(async () => {
  await initSheetwrite();
});

describe("SheetwriteStore", () => {
  it("applies literal set patches and resolves them through the WASM boundary", () => {
    const store = new SheetwriteStore(makeWorkbook(10));
    store.applyTransaction({
      patches: [
        { op: "set", addr: addr(2, 0), value: { kind: "literal", value: "Acme" } },
        { op: "set", addr: addr(2, 1), value: { kind: "literal", value: 1234.5 } },
      ],
    });
    expect(store.getCell(addr(2, 0)).resolved).toBe("Acme");
    expect(store.getCell(addr(2, 1)).resolved).toBe(1234.5);
    expect(store.getCell(addr(2, 2)).resolved).toBeNull();
  });

  it("loads formula CellValues from columnar data through the calc engine", async () => {
    const workbook = makeWorkbook(3);
    const store = new SheetwriteStore(workbook, {
      rowCount: 3,
      columns: {
        name: ["a", "b", "c"],
        // Numeric column mixing literals and formulas, per the ColumnarData contract.
        amount: [10, { kind: "formula", src: "=B1*2" }, { kind: "formula", src: "=SUM(B1:B2)" }],
      },
    });

    expect(store.getCell(addr(1, 1)).resolved).toBe(20);
    expect(store.getCell(addr(2, 1)).resolved).toBe(30);
    expect(store.getFormula(addr(1, 1))).toBe("=B1*2");

    store.dispose();
  });

  it("returns a row-major bulk window without per-cell reads", () => {
    const store = new SheetwriteStore(makeWorkbook(50), makeColumnarData(50));
    const view = store.getVisibleWindow("s1", { start: 3, end: 6 }, [0, 1, 2]);
    expect(view.rows).toEqual({ start: 3, end: 6 });
    expect(view.values.length).toBe(3 * 3); // 3 rows x 3 cols, row-major
    // row 3 -> [name, amount, city]
    expect(view.values[0]).toBe("Customer 3");
    expect(view.values[1]).toBe(30.5); // row 3 amount = 3 * 10 + 0.5
    expect(view.values[2]).toBe("Phnom Penh"); // row 3 city = cities[3 % 3]
    // row 4 begins at index 3
    expect(view.values[3]).toBe("Customer 4");
    expect(view.styleIds.length).toBe(9);
    expect(view.ffiOutputBytes).toBeGreaterThan(0);
    expect(Reflect.get(view, "ffiOutputAllocationEvents")).toBe(1);
  });

  it("keeps ref shadows live in windows, queries, and formulas", () => {
    const store = new SheetwriteStore(makeWorkbook(5));
    store.applyTransaction({
      patches: [
        { op: "set", addr: addr(0, 0), value: { kind: "literal", value: 41 } },
        { op: "set", addr: addr(1, 0), value: { kind: "ref", target: addr(0, 0) } },
        { op: "set", addr: addr(2, 0), value: { kind: "formula", src: "=A2+1" } },
      ],
    });

    // The window reads the ref's shadow without a JS overlay, so the raw
    // typed-array fields stay attached (worker zero-copy path).
    const view = store.getVisibleWindow("s1", { start: 0, end: 3 }, [0]);
    expect(view.values[1]).toBe(41);
    expect(view.valueKinds).toBeDefined();

    // Formulas now see the ref cell's displayed value (was empty pre-port).
    expect(store.getCell(addr(2, 0)).resolved).toBe(42);

    // Editing the target refreshes the shadow and dependents.
    store.applyTransaction({
      patches: [{ op: "set", addr: addr(0, 0), value: { kind: "literal", value: 10 } }],
    });
    expect(store.getVisibleWindow("s1", { start: 1, end: 2 }, [0]).values[0]).toBe(10);
    expect(store.getCell(addr(2, 0)).resolved).toBe(11);
  });

  it("resolves plain references and propagates target edits across sheets", () => {
    const workbook: Workbook = {
      activeSheet: "A",
      sheets: [
        {
          id: "A",
          name: "A",
          rowCount: 5,
          columns: [{ key: "v", header: "V", width: 80, type: "text" }],
        },
        {
          id: "B",
          name: "B",
          rowCount: 5,
          columns: [{ key: "v", header: "V", width: 80, type: "text" }],
        },
      ],
    };
    const store = new SheetwriteStore(workbook);
    store.applyTransaction({
      patches: [
        {
          op: "set",
          addr: { sheet: "A", row: 0, col: 0 },
          value: { kind: "literal", value: "hello" },
        },
      ],
    });
    store.applyTransaction({
      patches: [
        {
          op: "set",
          addr: { sheet: "B", row: 0, col: 0 },
          value: { kind: "ref", target: { sheet: "A", row: 0, col: 0 } },
        },
      ],
    });
    expect(store.getCell({ sheet: "B", row: 0, col: 0 }).resolved).toBe("hello");

    store.applyTransaction({
      patches: [
        {
          op: "set",
          addr: { sheet: "A", row: 0, col: 0 },
          value: { kind: "literal", value: "world" },
        },
      ],
    });
    expect(store.getCell({ sheet: "B", row: 0, col: 0 }).resolved).toBe("world");
    expect(store.getVisibleWindow("B", { start: 0, end: 1 }, [0]).values[0]).toBe("world");
  });

  it("applies conditional formatting in the visible-window style dictionary", () => {
    const workbook = makeWorkbook(5);
    workbook.sheets[0]!.conditionalFormats = [
      {
        range: { sheet: "s1", start: { row: 0, col: 1 }, end: { row: 4, col: 1 } },
        when: { kind: "greaterThan", value: 25 },
        style: { backgroundColor: "#fef3c7", bold: true },
      },
    ];
    const store = new SheetwriteStore(workbook, makeColumnarData(5));

    const view = store.getVisibleWindow("s1", { start: 0, end: 5 }, [1]);

    const lowStyle = view.styles[view.styleIds[1]!] ?? {};
    const highStyle = view.styles[view.styleIds[3]!] ?? {};
    expect(lowStyle.backgroundColor).toBeUndefined();
    expect(highStyle.backgroundColor).toBe("#fef3c7");
    expect(highStyle.bold).toBe(true);

    workbook.sheets[0]!.conditionalFormats![0]!.when = { kind: "greaterThan", value: 35 };
    const updated = store.getVisibleWindow("s1", { start: 0, end: 5 }, [1]);
    const previousHighStyle = updated.styles[updated.styleIds[3]!] ?? {};
    const stillHighStyle = updated.styles[updated.styleIds[4]!] ?? {};
    expect(previousHighStyle.backgroundColor).toBeUndefined();
    expect(stillHighStyle.backgroundColor).toBe("#fef3c7");
  });

  it("returns exhaustive outcomes and emits only applied transactions", () => {
    const store = new SheetwriteStore(makeWorkbook(5));
    const events: ChangeEvent[] = [];
    store.on("change", (event) => events.push(event));

    const firstTransaction: Transaction = {
      epoch: 0,
      patches: [{ op: "set", addr: addr(0, 0), value: { kind: "literal", value: "a" } }],
    };
    expect(store.applyTransaction(firstTransaction)).toEqual({
      status: "applied",
      epoch: 1,
      transaction: firstTransaction,
    });
    expect(events).toHaveLength(1);

    expect(
      store.applyTransaction({
        epoch: 0,
        patches: [{ op: "set", addr: addr(0, 0), value: { kind: "literal", value: "b" } }],
      }),
    ).toEqual({ status: "conflict", expectedEpoch: 0, actualEpoch: 1 });
    expect(store.getCell(addr(0, 0)).resolved).toBe("a");
    expect(events).toHaveLength(1);

    expect(store.applyTransaction({ patches: [] })).toEqual({
      status: "noop",
      epoch: 1,
      reason: "empty",
    });
    expect(events).toHaveLength(1);

    expect(
      store.applyTransaction({
        patches: [{ op: "set", addr: addr(10, 0), value: { kind: "literal", value: "outside" } }],
      }),
    ).toEqual({ status: "noop", epoch: 1, reason: "out-of-bounds" });
    expect(events).toHaveLength(1);

    const validPatch = {
      op: "set",
      addr: addr(1, 0),
      value: { kind: "literal", value: "valid" },
    } as const;
    const mixedResult = store.applyTransaction({
      patches: [
        { op: "set", addr: addr(10, 0), value: { kind: "literal", value: "outside" } },
        validPatch,
      ],
    });
    expect(mixedResult).toEqual({
      status: "applied",
      epoch: 2,
      transaction: { patches: [validPatch] },
    });
    expect(events).toHaveLength(2);
    expect(events[1]?.transaction).toEqual({ patches: [validPatch] });
  });

  it("keeps local change payloads bounded to their own transaction", () => {
    const store = new SheetwriteStore(makeWorkbook(5));
    store.applyTransaction({
      patches: [
        {
          op: "set",
          addr: addr(0, 0),
          value: { kind: "literal", value: 0 },
        },
      ],
    });
    const events: ChangeEvent[] = [];
    store.on("change", (event) => events.push(event));

    for (let index = 0; index < 128; index++) {
      store.applyTransaction({
        patches: [
          {
            op: "set",
            addr: addr(0, 0),
            value: { kind: "literal", value: index % 2 },
          },
        ],
      });
    }

    expect(events).toHaveLength(128);
    expect(events.every((event) => event.transaction.patches.length === 1)).toBe(true);
    expect(events[0]?.transaction.patches[0]).toMatchObject({
      op: "set",
      value: { kind: "literal", value: 0 },
    });
    expect(events[1]?.transaction.patches[0]).toMatchObject({
      op: "set",
      value: { kind: "literal", value: 1 },
    });
    expect(
      new Set(events.map(({ epoch: _epoch, ...event }) => JSON.stringify(event).length)).size,
    ).toBe(1);
    expect(events.every((event) => !("dirty" in event))).toBe(true);
    store.dispose();
  });

  it("emits a change event carrying old and new values for rollback", () => {
    const store = new SheetwriteStore(makeWorkbook(5));
    store.applyTransaction({
      patches: [{ op: "set", addr: addr(0, 0), value: { kind: "literal", value: "old" } }],
    });
    let captured: ChangeEvent | null = null;
    store.on("change", (e) => {
      captured = e;
    });
    store.applyTransaction({
      patches: [{ op: "set", addr: addr(0, 0), value: { kind: "literal", value: "new" } }],
    });
    expect(captured).not.toBeNull();
    const change = captured!.changes[0]!;
    expect(change.oldValue).toEqual({ kind: "literal", value: "old" });
    expect(change.newValue).toEqual({ kind: "literal", value: "new" });
  });

  for (const operation of ["setBlock", "setRange"] as const) {
    it(`preserves resolved before-values and styles in ${operation} rollback events`, () => {
      const store = new SheetwriteStore(makeWorkbook(3));
      const initialValues = ["雪😀", true, null, 7, null, null] as const;
      const boldStyle = { bold: true };
      store.applyTransaction({
        patches: [
          {
            op: "setBlock",
            range: { sheet: "s1", start: { row: 0, col: 0 }, end: { row: 1, col: 2 } },
            block: {
              rowCount: 2,
              colCount: 3,
              values: [...initialValues],
              styleTable: [boldStyle],
              styleIds: [0, 0, 0, 0, 0, 0],
              formulas: [
                [2, "=1/0"],
                [4, "=A2*2"],
              ],
              refs: [[5, addr(0, 0)]],
            },
          },
        ],
      });
      store.setDetailedChangeCapture(true);
      const events: ChangeEvent[] = [];
      store.on("change", (event) => events.push(event));
      const range = { sheet: "s1", start: { row: 0, col: 0 }, end: { row: 1, col: 2 } };
      const replacement: DocumentOp =
        operation === "setBlock"
          ? {
              op: "setBlock",
              range,
              block: { rowCount: 2, colCount: 3, values: [null, null, null, null, null, null] },
            }
          : {
              op: "setRange",
              range,
              cells: Array.from({ length: initialValues.length }, (_, offset) => ({
                rowOffset: Math.floor(offset / 3),
                colOffset: offset % 3,
                value: { kind: "literal" as const, value: null },
              })),
            };
      expect(store.applyTransaction({ patches: [replacement] }).status).toBe("applied");
      expect(
        events.map((event) =>
          event.changes.map((change) => ({
            addr: change.addr,
            oldValue: change.oldValue,
            newValue: change.newValue,
            oldStyle: change.oldStyle,
          })),
        ),
      ).toEqual([
        ["雪😀", true, "#DIV/0!", 7, 14, "雪😀"].map((value, offset) => ({
          addr: addr(Math.floor(offset / 3), offset % 3),
          oldValue: { kind: "literal", value },
          newValue: { kind: "literal", value: null },
          oldStyle: boldStyle,
        })),
      ]);
      store.dispose();
    });
  }

  it("evaluates arithmetic formulas and recomputes on dependency edits", () => {
    const store = new SheetwriteStore(makeWorkbook(5));
    store.applyTransaction({
      patches: [
        { op: "set", addr: addr(0, 1), value: { kind: "literal", value: 10 } },
        { op: "set", addr: addr(1, 1), value: { kind: "literal", value: 20 } },
      ],
    });
    store.applyTransaction({
      patches: [{ op: "set", addr: addr(2, 1), value: { kind: "formula", src: "=B1+B2*2" } }],
    });
    expect(store.getCell(addr(2, 1)).resolved).toBe(50);

    store.applyTransaction({
      patches: [{ op: "set", addr: addr(0, 1), value: { kind: "literal", value: 100 } }],
    });
    expect(store.getCell(addr(2, 1)).resolved).toBe(140);
  });

  it("keeps rewritten formula source authoritative across row and column deletes", () => {
    const rowStore = new SheetwriteStore(makeWorkbook(8));
    rowStore.applyTransaction({
      patches: [
        { op: "set", addr: addr(0, 0), value: { kind: "literal", value: 1 } },
        { op: "set", addr: addr(1, 0), value: { kind: "literal", value: 2 } },
        { op: "set", addr: addr(2, 0), value: { kind: "literal", value: 3 } },
        { op: "set", addr: addr(3, 0), value: { kind: "literal", value: 4 } },
        { op: "set", addr: addr(5, 1), value: { kind: "formula", src: "=$A$2" } },
        { op: "set", addr: addr(6, 1), value: { kind: "formula", src: "=SUM(A1:A4)" } },
      ],
    });
    rowStore.applyTransaction({
      patches: [{ op: "removeRows", sheet: "s1", at: 1, count: 2 }],
    });

    expect(rowStore.getCell(addr(3, 1)).resolved).toBe("#REF!");
    expect(rowStore.getFormula(addr(3, 1))).toBe("=#REF!");
    expect(rowStore.getCell(addr(4, 1)).resolved).toBe(5);
    expect(rowStore.getFormula(addr(4, 1))).toBe("=SUM(A1:A2)");

    const invalidSource = rowStore.getFormula(addr(3, 1));
    expect(invalidSource).not.toBeNull();
    rowStore.applyTransaction({
      patches: [
        {
          op: "set",
          addr: addr(0, 2),
          value: { kind: "formula", src: invalidSource! },
        },
      ],
    });
    expect(rowStore.getCell(addr(0, 2)).resolved).toBe("#REF!");

    const columnWorkbook: Workbook = {
      activeSheet: "s1",
      sheets: [
        {
          id: "s1",
          name: "Sheet 1",
          rowCount: 3,
          columns: Array.from({ length: 7 }, (_, index) => ({
            key: `c${index}`,
            header: `C${index}`,
            width: 80,
            type: "number" as const,
          })),
        },
      ],
    };
    const columnStore = new SheetwriteStore(columnWorkbook);
    columnStore.applyTransaction({
      patches: [
        { op: "set", addr: addr(0, 0), value: { kind: "literal", value: 1 } },
        { op: "set", addr: addr(0, 1), value: { kind: "literal", value: 2 } },
        { op: "set", addr: addr(0, 2), value: { kind: "literal", value: 3 } },
        { op: "set", addr: addr(0, 3), value: { kind: "literal", value: 4 } },
        { op: "set", addr: addr(1, 4), value: { kind: "formula", src: "=B1" } },
        { op: "set", addr: addr(1, 5), value: { kind: "formula", src: "=SUM(A1:D1)" } },
      ],
    });
    columnStore.applyTransaction({
      patches: [{ op: "removeColumns", sheet: "s1", at: 1, count: 2 }],
    });

    expect(columnStore.getCell(addr(1, 2)).resolved).toBe("#REF!");
    expect(columnStore.getFormula(addr(1, 2))).toBe("=#REF!");
    expect(columnStore.getCell(addr(1, 3)).resolved).toBe(5);
    expect(columnStore.getFormula(addr(1, 3))).toBe("=SUM(A1:B1)");
  });

  it("rewrites cross-sheet formulas without shifting unrelated absolute targets", () => {
    const workbook: Workbook = {
      activeSheet: "source",
      sheets: [
        {
          id: "source",
          name: "Source Data",
          rowCount: 5,
          columns: [{ key: "v", header: "V", width: 80, type: "number" }],
        },
        {
          id: "other",
          name: "Other",
          rowCount: 5,
          columns: [{ key: "v", header: "V", width: 80, type: "number" }],
        },
        {
          id: "summary",
          name: "Summary",
          rowCount: 5,
          columns: [{ key: "v", header: "V", width: 80, type: "number" }],
        },
      ],
    };
    const store = new SheetwriteStore(workbook);
    store.applyTransaction({
      patches: [
        {
          op: "set",
          addr: { sheet: "source", row: 1, col: 0 },
          value: { kind: "literal", value: 9 },
        },
        {
          op: "set",
          addr: { sheet: "other", row: 0, col: 0 },
          value: { kind: "literal", value: 7 },
        },
        {
          op: "set",
          addr: { sheet: "summary", row: 0, col: 0 },
          value: { kind: "formula", src: "='Source Data'!$A$2" },
        },
        {
          op: "set",
          addr: { sheet: "summary", row: 1, col: 0 },
          value: { kind: "formula", src: "=Other!A1" },
        },
      ],
    });
    store.applyTransaction({
      patches: [{ op: "addRows", sheet: "source", at: 1, count: 1 }],
    });

    expect(store.getCell({ sheet: "summary", row: 0, col: 0 }).resolved).toBe(9);
    expect(store.getFormula({ sheet: "summary", row: 0, col: 0 })).toBe("='Source Data'!$A$3");
    expect(store.getCell({ sheet: "summary", row: 1, col: 0 }).resolved).toBe(7);
    expect(store.getFormula({ sheet: "summary", row: 1, col: 0 })).toBe("=Other!A1");

    store.applyTransaction({
      patches: [{ op: "removeRows", sheet: "source", at: 2, count: 1 }],
    });
    expect(store.getCell({ sheet: "summary", row: 0, col: 0 }).resolved).toBe("#REF!");
    expect(store.getFormula({ sheet: "summary", row: 0, col: 0 })).toBe("=#REF!");
    expect(store.getCell({ sheet: "summary", row: 1, col: 0 }).resolved).toBe(7);
  });

  it("frees disposed stores so a fresh store still reads correctly after churn", () => {
    for (let i = 0; i < 20; i++) {
      const churn = new SheetwriteStore(makeWorkbook(1000), makeColumnarData(1000));
      expect(churn.getCell(addr(500, 0)).resolved).toBe("Customer 500");
      churn.dispose();
    }

    const store = new SheetwriteStore(makeWorkbook(1000), makeColumnarData(1000));
    expect(store.getCell(addr(500, 1)).resolved).toBe(5000.5);
    // sum of amount column: sum(r*10 + 0.5) for r in [0, 1000)
    expect(store.aggregate("s1", 1, "sum")).toBe(4995500);
    store.dispose();
  });

  it("keeps an outsized window intact after subsequent small reads", () => {
    const rowCount = 70_000;
    const store = new SheetwriteStore(makeWorkbook(rowCount), makeColumnarData(rowCount));

    const big = store.getVisibleWindow("s1", { start: 0, end: rowCount }, [1]);
    expect(big.values.length).toBe(rowCount);
    expect(big.values[0]).toBe(0.5);
    expect(big.values[rowCount - 1]).toBe((rowCount - 1) * 10 + 0.5);

    const small = store.getVisibleWindow("s1", { start: 0, end: 3 }, [0, 1, 2]);
    expect(Array.from(small.values)).toEqual([
      "Customer 0",
      0.5,
      "Phnom Penh",
      "Customer 1",
      10.5,
      "Tokyo",
      "Customer 2",
      20.5,
      "Berlin",
    ]);
    expect(big.values[rowCount - 1]).toBe((rowCount - 1) * 10 + 0.5);

    store.dispose();
  });

  it("composes a values filter, hidden rows, and a multi-key sort into one view", () => {
    const store = new SheetwriteStore(makeWorkbook(6), makeColumnarData(6));

    // Keep only Phnom Penh + Tokyo cities → data rows [0, 1, 3, 4].
    store.setColumnFilter("s1", 2, { kind: "values", values: ["Phnom Penh", "Tokyo"] });
    expect(store.viewRowCount("s1")).toBe(4);
    expect(store.columnFilters("s1").get(2)).toEqual({
      kind: "values",
      values: ["Phnom Penh", "Tokyo"],
    });

    // Hide one survivor → [0, 1, 3].
    store.hideRows("s1", [4]);
    expect(store.viewRowCount("s1")).toBe(3);

    // Sort city ascending, then amount descending: Phnom Penh {3 (30.5), 0 (0.5)}, Tokyo {1}.
    store.sortByMulti("s1", [
      { col: 2, ascending: true },
      { col: 1, ascending: false },
    ]);
    expect(store.viewRowCount("s1")).toBe(3);
    expect(store.dataRowAt("s1", 0)).toBe(3);
    expect(store.getVisibleWindow("s1", { start: 0, end: 3 }, [0]).values).toEqual([
      "Customer 3",
      "Customer 0",
      "Customer 1",
    ]);
  });

  it("preserves boolean literals and formulas through windows, queries, and snapshots", () => {
    const store = new SheetwriteStore(makeWorkbook(6));
    store.applyTransaction({
      patches: [
        { op: "set", addr: addr(0, 0), value: { kind: "literal", value: false } },
        { op: "set", addr: addr(1, 0), value: { kind: "literal", value: true } },
        { op: "set", addr: addr(2, 0), value: { kind: "formula", src: "=1=1" } },
        { op: "set", addr: addr(3, 0), value: { kind: "formula", src: "=1=2" } },
        { op: "set", addr: addr(4, 0), value: { kind: "literal", value: 7 } },
      ],
    });

    expect(store.getCell(addr(0, 0)).resolved).toBe(false);
    expect(store.getCell(addr(2, 0)).resolved).toBe(true);
    expect(store.getVisibleWindow("s1", { start: 0, end: 6 }, [0]).values).toEqual([
      false,
      true,
      true,
      false,
      7,
      null,
    ]);
    expect(store.distinctValues("s1", 0)).toEqual([false, true, 7, null]);

    store.setColumnFilter("s1", 0, { kind: "values", values: [true] });
    expect(store.getVisibleWindow("s1", { start: 0, end: 2 }, [0]).values).toEqual([true, true]);
    store.setColumnFilter("s1", 0, null);
    store.sortBy("s1", 0, true);
    expect(store.getVisibleWindow("s1", { start: 0, end: 6 }, [0]).values).toEqual([
      7,
      false,
      false,
      true,
      true,
      null,
    ]);

    expect(
      store
        .exportSnapshot()
        .sheets[0]!.cells.flatMap((block) => block.cells)
        .find((cell) => cell.rowOffset === 0 && cell.colOffset === 0)?.value,
    ).toEqual({ kind: "literal", value: false });
    store.dispose();
  });

  it("resolves scoped named ranges and recalculates volatile formulas from one instant", () => {
    const columns = Array.from({ length: 4 }, (_, col) => ({
      key: `c${col}`,
      header: `C${col}`,
      width: 80,
      type: "number" as const,
    }));
    const workbook: Workbook = {
      activeSheet: "summary",
      sheets: [
        { id: "data", name: "Data", rowCount: 4, columns },
        { id: "summary", name: "Summary", rowCount: 2, columns },
        { id: "other", name: "Other", rowCount: 1, columns },
      ],
    };
    const store = new SheetwriteStore(workbook);
    store.applyTransaction({
      patches: [
        {
          op: "set",
          addr: { sheet: "data", row: 0, col: 0 },
          value: { kind: "literal", value: 1 },
        },
        {
          op: "set",
          addr: { sheet: "data", row: 1, col: 0 },
          value: { kind: "literal", value: 2 },
        },
        {
          op: "set",
          addr: { sheet: "data", row: 2, col: 0 },
          value: { kind: "literal", value: 3 },
        },
        {
          op: "set",
          addr: { sheet: "data", row: 0, col: 1 },
          value: { kind: "literal", value: 10 },
        },
        {
          op: "set",
          addr: { sheet: "data", row: 1, col: 1 },
          value: { kind: "literal", value: 20 },
        },
        {
          op: "set",
          addr: { sheet: "data", row: 2, col: 1 },
          value: { kind: "literal", value: 30 },
        },
        {
          op: "set",
          addr: { sheet: "summary", row: 0, col: 0 },
          value: { kind: "formula", src: "=SUM(Values)" },
        },
        {
          op: "set",
          addr: { sheet: "other", row: 0, col: 0 },
          value: { kind: "formula", src: "=SUM(Values)" },
        },
        {
          op: "setNamedRange",
          namedRange: {
            name: "Values",
            range: {
              sheet: "data",
              start: { row: 0, col: 0 },
              end: { row: 2, col: 0 },
            },
          },
        },
        {
          op: "setNamedRange",
          namedRange: {
            name: "Values",
            scope: "summary",
            range: {
              sheet: "data",
              start: { row: 0, col: 1 },
              end: { row: 2, col: 1 },
            },
          },
        },
        {
          op: "set",
          addr: { sheet: "summary", row: 0, col: 2 },
          value: { kind: "formula", src: "=TODAY()" },
        },
        {
          op: "set",
          addr: { sheet: "summary", row: 0, col: 3 },
          value: { kind: "formula", src: "=NOW()" },
        },
      ],
    });

    expect(store.getCell({ sheet: "summary", row: 0, col: 0 }).resolved).toBe(60);
    expect(store.getCell({ sheet: "other", row: 0, col: 0 }).resolved).toBe(6);
    let volatileEvents = 0;
    store.on("change", (event) => {
      if (event.transaction.patches.length === 0) volatileEvents += 1;
    });
    const now = new Date("2026-07-13T18:00:00.000Z");
    const serial = now.getTime() / 86_400_000 + 25_569;
    store.recalculateVolatile(now);
    expect(store.getCell({ sheet: "summary", row: 0, col: 2 }).resolved).toBe(Math.floor(serial));
    expect(store.getCell({ sheet: "summary", row: 0, col: 3 }).resolved).toBe(serial);
    expect(volatileEvents).toBe(1);

    store.applyTransaction({
      patches: [{ op: "addRows", sheet: "data", at: 1, count: 1 }],
    });
    expect(store.getCell({ sheet: "other", row: 0, col: 0 }).resolved).toBe(6);
    expect(store.exportSnapshot().workbook.namedRanges).toEqual([
      {
        name: "Values",
        range: {
          sheet: "data",
          start: { row: 0, col: 0 },
          end: { row: 3, col: 0 },
        },
      },
      {
        name: "Values",
        scope: "summary",
        range: {
          sheet: "data",
          start: { row: 0, col: 1 },
          end: { row: 3, col: 1 },
        },
      },
    ]);
    const hydrated = SheetwriteStore.fromSnapshot(store.exportSnapshot());
    expect(hydrated.getCell({ sheet: "summary", row: 0, col: 0 }).resolved).toBe(60);
    expect(hydrated.getCell({ sheet: "other", row: 0, col: 0 }).resolved).toBe(6);
    hydrated.dispose();
    store.applyTransaction({
      patches: [{ op: "moveRows", sheet: "data", from: 0, count: 4, to: 1 }],
    });
    expect(store.getCell({ sheet: "summary", row: 0, col: 0 }).resolved).toBe(60);
    expect(store.getCell({ sheet: "other", row: 0, col: 0 }).resolved).toBe(6);
    expect(store.exportSnapshot().workbook.namedRanges?.map((range) => range.range)).toEqual([
      {
        sheet: "data",
        start: { row: 1, col: 0 },
        end: { row: 4, col: 0 },
      },
      {
        sheet: "data",
        start: { row: 1, col: 1 },
        end: { row: 4, col: 1 },
      },
    ]);
    store.applyTransaction({
      patches: [{ op: "moveColumns", sheet: "data", from: 0, count: 2, to: 2 }],
    });
    expect(store.getCell({ sheet: "summary", row: 0, col: 0 }).resolved).toBe(60);
    expect(store.getCell({ sheet: "other", row: 0, col: 0 }).resolved).toBe(6);
    expect(store.exportSnapshot().workbook.namedRanges?.map((range) => range.range)).toEqual([
      {
        sheet: "data",
        start: { row: 1, col: 2 },
        end: { row: 4, col: 2 },
      },
      {
        sheet: "data",
        start: { row: 1, col: 3 },
        end: { row: 4, col: 3 },
      },
    ]);

    store.applyTransaction({
      patches: [{ op: "removeNamedRange", name: "Values", scope: "summary" }],
    });
    expect(store.getCell({ sheet: "summary", row: 0, col: 0 }).resolved).toBe(6);
    store.dispose();
  });
});

describe("datasource row hydration", () => {
  it("preserves rich cells without producing dirty changes", () => {
    const store = new SheetwriteStore(makeWorkbook(5));
    let changes = 0;
    store.on("change", () => {
      changes += 1;
    });

    store.loadPage("s1", 0, ALL_SOURCE_COLUMN_BANDS, [
      {
        name: { kind: "literal", value: "rich" },
        amount: {
          value: { kind: "formula", src: "=1+2" },
          style: { bold: true, fontSize: 18 },
        },
        city: { kind: "ref", target: addr(1, 0) },
      },
    ]);

    expect(store.getCell(addr(0, 0)).resolved).toBe("rich");
    expect(store.getFormula(addr(0, 1))).toBe("=1+2");
    expect(store.getCell(addr(0, 1))).toMatchObject({
      resolved: 3,
      style: { bold: true, fontSize: 18 },
    });
    expect(store.getRefTarget(addr(0, 2))).toEqual(addr(1, 0));
    expect(store.getCell(addr(0, 2)).resolved).toBeNull();
    store.loadPage("s1", 1, NAME_SOURCE_COLUMN_BAND, [{ name: "later source" }]);
    expect(store.getCell(addr(0, 2)).resolved).toBe("later source");
    expect(changes).toBe(0);
    store.dispose();
  });
});

describe("stable formula sheet identity", () => {
  function lifecycleWorkbook(): Workbook {
    return {
      activeSheet: "summary",
      sheets: [
        {
          id: "source",
          name: "Sales",
          rowCount: 2,
          columns: [{ key: "value", header: "Value", width: 100, type: "number" }],
        },
        {
          id: "summary",
          name: "Summary",
          rowCount: 2,
          columns: [
            { key: "result", header: "Result", width: 100, type: "number" },
            { key: "next", header: "Next", width: 100, type: "number" },
          ],
        },
      ],
    };
  }

  it("renames resolved references canonically and supports inverse rename", () => {
    const workbook = lifecycleWorkbook();
    const store = new SheetwriteStore(workbook);
    store.applyTransaction({
      patches: [
        {
          op: "set",
          addr: { sheet: "source", row: 0, col: 0 },
          value: { kind: "literal", value: 4 },
        },
        {
          op: "set",
          addr: { sheet: "summary", row: 0, col: 0 },
          value: { kind: "formula", src: "=Sales!A1+1" },
        },
      ],
    });

    expect(store.renameSheetFormulaIdentity("source", "Sales Data")).toBe(true);
    expect(store.getFormula({ sheet: "summary", row: 0, col: 0 })).toBe("=('Sales Data'!A1+1)");
    expect(store.getCell({ sheet: "summary", row: 0, col: 0 }).resolved).toBe(5);

    expect(store.renameSheetFormulaIdentity("source", "O'Brien")).toBe(true);
    expect(store.getFormula({ sheet: "summary", row: 0, col: 0 })).toBe("=('O''Brien'!A1+1)");
    workbook.sheets[0]!.name = "O'Brien";
    const snapshot: WorkbookSnapshot = {
      schemaVersion: 1,
      workbook: { activeSheet: "summary" },
      sheets: workbook.sheets.map((sheet, order) => ({
        ...sheet,
        order,
        rowMeta: sheet.rowHeights
          ? [...sheet.rowHeights].map(([row, height]) => [row, { height }])
          : [],
        cells:
          sheet.id === "summary"
            ? [
                {
                  startRow: 0,
                  startCol: 0,
                  rowCount: 1,
                  colCount: 1,
                  cells: [
                    {
                      rowOffset: 0,
                      colOffset: 0,
                      value: {
                        kind: "formula",
                        src: store.getFormula({ sheet: "summary", row: 0, col: 0 })!,
                      },
                    },
                  ],
                },
              ]
            : [],
      })),
    };
    const roundTrip = validateWorkbookSnapshot(JSON.parse(JSON.stringify(snapshot)));
    expect(roundTrip.ok).toBe(true);
    if (!roundTrip.ok) throw new Error("renamed snapshot did not validate");
    expect(roundTrip.value.sheets[1]?.cells[0]?.cells[0]?.value).toEqual({
      kind: "formula",
      src: "=('O''Brien'!A1+1)",
    });
    expect(store.renameSheetFormulaIdentity("source", "Sales")).toBe(true);
    expect(store.getFormula({ sheet: "summary", row: 0, col: 0 })).toBe("=(Sales!A1+1)");
    store.dispose();
  });

  it("tombstones removed handles and repairs transitive dependencies", () => {
    const workbook = lifecycleWorkbook();
    const store = new SheetwriteStore(workbook);
    store.applyTransaction({
      patches: [
        {
          op: "set",
          addr: { sheet: "source", row: 0, col: 0 },
          value: { kind: "literal", value: 4 },
        },
        {
          op: "set",
          addr: { sheet: "summary", row: 0, col: 0 },
          value: { kind: "formula", src: "=Sales!A1+1" },
        },
        {
          op: "set",
          addr: { sheet: "summary", row: 0, col: 1 },
          value: { kind: "formula", src: "=A1+1" },
        },
      ],
    });
    expect(store.getCell({ sheet: "summary", row: 0, col: 1 }).resolved).toBe(6);

    expect(store.removeSheetFormulaIdentity("source")).toBe(true);

    expect(store.getFormula({ sheet: "summary", row: 0, col: 0 })).toBe("=(#REF!+1)");
    expect(store.getCell({ sheet: "summary", row: 0, col: 0 }).resolved).toBe("#REF!");
    expect(store.getCell({ sheet: "summary", row: 0, col: 1 }).resolved).toBe("#REF!");
    expect(store.removeSheetFormulaIdentity("source")).toBe(false);
    store.dispose();
  });
});

describe("range-native mutations", () => {
  it("applies a typed block with formula, reference, and interned style exceptions", () => {
    const store = new SheetwriteStore(makeWorkbook(4));
    const events: ChangeEvent[] = [];
    store.on("change", (event) => events.push(event));

    const outcome = store.applyTransaction({
      patches: [
        {
          op: "setBlock",
          range: {
            sheet: "s1",
            start: { row: 0, col: 0 },
            end: { row: 1, col: 1 },
          },
          block: {
            rowCount: 2,
            colCount: 2,
            values: [3, null, "label", null],
            formulas: [[1, "=A1*2"]],
            refs: [[3, addr(0, 0)]],
            styleTable: [{ bold: true }, { italic: true }],
            styleIds: [0, 1, 1, 0],
          },
        },
      ],
    });

    expect(outcome.status).toBe("applied");
    expect(store.getCell(addr(0, 0))).toMatchObject({ resolved: 3, style: { bold: true } });
    expect(store.getFormula(addr(0, 1))).toBe("=A1*2");
    expect(store.getCell(addr(0, 1))).toMatchObject({ resolved: 6, style: { italic: true } });
    expect(store.getCell(addr(1, 0))).toMatchObject({
      resolved: "label",
      style: { italic: true },
    });
    expect(store.getRefTarget(addr(1, 1))).toEqual(addr(0, 0));
    expect(store.getCell(addr(1, 1))).toMatchObject({ resolved: 3, style: { bold: true } });
    expect(events).toHaveLength(1);
    expect(events[0]!.transaction.patches).toHaveLength(1);
    store.dispose();
  });

  it("materializes an opaque history snapshot only as a JSON-safe setBlock operation", () => {
    const store = new SheetwriteStore(makeWorkbook(3));
    store.applyTransaction({
      patches: [
        {
          op: "setBlock",
          range: { sheet: "s1", start: { row: 0, col: 0 }, end: { row: 1, col: 0 } },
          block: {
            rowCount: 2,
            colCount: 1,
            values: [5, null],
            formulas: [[1, "=A1+1"]],
            styleTable: [{ underline: true }],
            styleIds: [0, 0],
          },
        },
      ],
    });
    const range = { sheet: "s1", start: { row: 0, col: 0 }, end: { row: 1, col: 0 } };
    const history = store.captureRangeHistory(range);
    expect(history).not.toBeNull();
    store.applyTransaction({ patches: [{ op: "clearRange", range }] });

    const restore = history!.toDocumentOp(range);
    expect(JSON.parse(JSON.stringify(restore))).toEqual(restore);
    expect("resource" in restore).toBe(false);
    store.applyTransaction({ patches: [restore] });
    expect(store.getCell(addr(0, 0)).resolved).toBe(5);
    expect(store.getFormula(addr(1, 0))).toBe("=A1+1");
    expect(store.getCell(addr(1, 0)).resolved).toBe(6);

    history!.dispose();
    history!.dispose();
    store.dispose();
  });
});

describe("paged datasource storage", () => {
  it("hydrates pages without overwriting dirty or revision-protected rich cells", () => {
    const store = new SheetwriteStore(makeWorkbook(4), undefined, {
      storage: "paged",
      chunkRows: 4,
      cacheBytes: 1_000_000,
    });
    store.loadPage("s1", 0, ALL_SOURCE_COLUMN_BANDS, [
      { name: "source zero", amount: 1, city: "A" },
      { name: "source target", amount: 2, city: "B" },
    ]);
    const literal: DocumentOp = {
      op: "set",
      addr: addr(0, 0),
      value: { kind: "literal", value: "local literal" },
      style: { bold: true },
    };
    const formula: DocumentOp = {
      op: "set",
      addr: addr(0, 1),
      value: { kind: "formula", src: "=40+2" },
      style: { italic: true },
    };
    const reference: DocumentOp = {
      op: "set",
      addr: addr(0, 2),
      value: { kind: "ref", target: addr(1, 0) },
      style: { underline: true },
    };
    store.applyTransaction({ patches: [literal, formula, reference] });
    store.acknowledgeOperations([literal]);

    const revisionAddresses = new Set<object>();
    store.loadPage(
      "s1",
      0,
      ALL_SOURCE_COLUMN_BANDS,
      [
        { name: "stale literal", amount: 3, city: "stale ref" },
        { name: "server target", amount: 4, city: "server" },
      ],
      (address) => {
        revisionAddresses.add(address);
        return address.row === 0 && address.col === 0;
      },
    );

    expect(revisionAddresses.size).toBe(1);
    expect(store.getCell(addr(0, 0))).toMatchObject({
      resolved: "local literal",
      style: { bold: true },
    });
    expect(store.getFormula(addr(0, 1))).toBe("=40+2");
    expect(store.getCell(addr(0, 1))).toMatchObject({
      resolved: 42,
      style: { italic: true },
    });
    expect(store.getRefTarget(addr(0, 2))).toEqual(addr(1, 0));
    expect(store.getCell(addr(0, 2))).toMatchObject({
      resolved: "server target",
      style: { underline: true },
    });
    store.dispose();
  });

  it("hydrates disjoint bands without marking the physical holes in their bounding rectangle", () => {
    const store = new SheetwriteStore(makeWorkbook(4), undefined, {
      storage: "paged",
      chunkRows: 2,
      cacheBytes: 1_000_000,
    });
    store.loadPage(
      "s1",
      0,
      [
        { start: 0, end: 1, keys: ["name"] },
        { start: 2, end: 3, keys: ["city"] },
      ],
      [
        { name: "alpha", city: "A" },
        { name: "beta", city: null },
      ],
    );

    expect(store.areColumnsFullyLoaded("s1", 0, 2, [0])).toBe(true);
    expect(store.areColumnsFullyLoaded("s1", 0, 2, [2])).toBe(true);
    expect(store.areColumnsFullyLoaded("s1", 0, 2, [2, 0])).toBe(true);
    expect(store.areColumnsFullyLoaded("s1", 0, 2, [1])).toBe(false);
    expect(store.areColumnsFullyLoaded("s1", 0, 2, [0, 1, 2])).toBe(false);
    expect(
      store.isRangeFullyLoaded({
        sheet: "s1",
        start: { row: 0, col: 0 },
        end: { row: 1, col: 2 },
      }),
    ).toBe(false);
    expect(store.getVisibleWindow("s1", { start: 0, end: 2 }, [2, 0]).values).toEqual([
      "A",
      "alpha",
      "",
      "beta",
    ]);
    expect(store.getCellLoadState(addr(0, 1))).toBe("unloaded");
    expect(store.getCellLoadState(addr(1, 1))).toBe("unloaded");
    expect(store.getPagedStats("s1")).toMatchObject({
      chunks: 2,
      loadedCells: 4,
      dirtyCells: 0,
    });
    store.dispose();
  });

  it("rejects malformed rectangular pages atomically without marking any target cell loaded", () => {
    const store = new SheetwriteStore(makeWorkbook(4), undefined, {
      storage: "paged",
      chunkRows: 4,
      cacheBytes: 1_000_000,
    });
    const expectRowUnloaded = (row: number) => {
      for (const col of [0, 1, 2]) {
        expect(store.getCellLoadState(addr(row, col))).toBe("unloaded");
      }
    };

    expect(() =>
      store.loadPage("s1", 0, ALL_SOURCE_COLUMN_BANDS, [{ name: "missing", amount: 1 }]),
    ).toThrow(/omits declared cell data/);
    expectRowUnloaded(0);

    expect(() =>
      store.loadPage("s1", 1, NAME_SOURCE_COLUMN_BAND, [{ name: "extra", amount: null }]),
    ).toThrow(/undeclared cell data/);
    expectRowUnloaded(1);

    expect(() =>
      store.loadPage(
        "s1",
        2,
        [
          { start: 2, end: 3, keys: ["city"] },
          { start: 0, end: 1, keys: ["name"] },
        ],
        [{ name: "reordered", city: "C" }],
      ),
    ).toThrow(/invalid column bounds/);
    expectRowUnloaded(2);

    expect(() =>
      store.loadPage("s1", 2, [{ start: 0, end: 1, keys: ["city"] }], [{ city: "wrong-position" }]),
    ).toThrow(/invalid column keys/);
    expectRowUnloaded(2);

    expect(() =>
      store.loadPage(
        "s1",
        3,
        [
          { start: 0, end: 2, keys: ["name", "amount"] },
          { start: 1, end: 3, keys: ["amount", "city"] },
        ],
        [{ name: "overlap", amount: 3, city: "D" }],
      ),
    ).toThrow(/invalid column bounds/);
    expectRowUnloaded(3);
    expect(store.queryCapability("s1")).toEqual({
      status: "incomplete",
      loadedCells: 0,
      totalCells: 12,
    });
    store.dispose();
  });

  it("keeps whole-sheet reads and unloaded formula dependencies incomplete after a partial page", () => {
    const store = new SheetwriteStore(makeWorkbook(2), undefined, {
      storage: "paged",
      chunkRows: 2,
      cacheBytes: 1_000_000,
    });
    store.loadPage(
      "s1",
      0,
      [{ start: 1, end: 2, keys: ["amount"] }],
      [{ amount: 10 }, { amount: null }],
    );

    expect(store.areColumnsFullyLoaded("s1", 0, 2, [1])).toBe(true);
    expect(store.areColumnsFullyLoaded("s1", 0, 2, [0, 1, 2])).toBe(false);
    expect(store.queryCapability("s1")).toEqual({
      status: "incomplete",
      loadedCells: 2,
      totalCells: 6,
    });
    expect(() => store.aggregate("s1", 1, "sum")).toThrow(/has unloaded datasource cells/);
    expect(() => store.exportSnapshot()).toThrow(/has unloaded datasource cells/);

    store.applyTransaction({
      patches: [{ op: "set", addr: addr(0, 2), value: { kind: "formula", src: "=A1" } }],
    });
    expect(store.getCell(addr(0, 2)).resolved).toBe("#LOADING!");
    expect(store.queryCapability("s1").status).toBe("incomplete");
    expect(() => store.exportSnapshot()).toThrow(/has unloaded datasource cells/);
    store.dispose();
  });

  it("rejects style remapping across loading cells before crossing the WASM boundary", () => {
    const store = new SheetwriteStore(makeWorkbook(4), undefined, {
      storage: "paged",
      chunkRows: 2,
      cacheBytes: 1_000_000,
    });
    const range = {
      sheet: "s1",
      start: { row: 0, col: 0 },
      end: { row: 3, col: 2 },
    };
    store.resetRangeMutationAllocationStats();
    expect(
      store.applyTransaction({
        patches: [{ op: "setRangeStyle", range, style: { bold: true } }],
      }),
    ).toMatchObject({ status: "noop", reason: "incomplete-data" });
    expect(store.getRangeMutationAllocationStats()).toMatchObject({
      documentOperations: 0,
      ffiCalls: 0,
      maxTransferredArrayLength: 0,
    });

    store.loadPage("s1", 0, ALL_SOURCE_COLUMN_BANDS, [
      { name: "a", amount: 1, city: "A" },
      { name: "b", amount: 2, city: "B" },
      { name: "c", amount: 3, city: "C" },
      { name: "d", amount: 4, city: "D" },
    ]);
    store.resetRangeMutationAllocationStats();
    expect(
      store.applyTransaction({
        patches: [{ op: "setRangeStyle", range, style: { bold: true } }],
      }).status,
    ).toBe("applied");
    expect(store.getRangeMutationAllocationStats()).toMatchObject({
      distinctStyleIds: 1,
      maxTransferredArrayLength: 1,
    });
    store.dispose();
  });

  it("allocates no cell buffers up front and keeps dirty chunks resident", () => {
    const store = new SheetwriteStore(makeWorkbook(1_000_000), undefined, {
      storage: "paged",
      chunkRows: 4,
      cacheBytes: 150,
    });
    expect(store.getPagedStats("s1")).toEqual({
      chunks: 0,
      loadedCells: 0,
      dirtyCells: 0,
      allocatedBytes: 0,
      dirtyAllocatedBytes: 0,
      fullyLoaded: false,
    });
    expect(store.getCellLoadState(addr(0, 0))).toBe("unloaded");
    expect(store.getCell(addr(0, 0)).resolved).toBe("#LOADING!");
    const loadingWindow = store.getVisibleWindow("s1", { start: 0, end: 1 }, [0]);
    expect(loadingWindow.values).toEqual(["#LOADING!"]);
    expect(Reflect.get(loadingWindow, "ffiOutputAllocationEvents")).toBe(2);
    expect(store.queryCapability("s1")).toEqual({
      status: "incomplete",
      loadedCells: 0,
      totalCells: 3_000_000,
    });
    expect(() => store.aggregate("s1", 1, "sum")).toThrow(/has unloaded datasource cells/);
    expect(() => store.exportSnapshot()).toThrow(/has unloaded datasource cells/);

    store.loadPage("s1", 0, ALL_SOURCE_COLUMN_BANDS, [{ name: "zero", amount: 1, city: "A" }]);
    store.applyTransaction({
      patches: [{ op: "set", addr: addr(0, 1), value: { kind: "literal", value: 99 } }],
    });
    store.loadPage("s1", 0, ALL_SOURCE_COLUMN_BANDS, [{ name: "stale", amount: 2, city: "stale" }]);
    for (const row of [4, 8, 12]) {
      store.loadPage("s1", row, ALL_SOURCE_COLUMN_BANDS, [
        { name: `row-${row}`, amount: row, city: "B" },
      ]);
    }

    expect(store.getCell(addr(0, 1)).resolved).toBe(99);
    expect(store.getCellLoadState(addr(0, 1))).toBe("local-edit");
    expect(store.getPagedStats("s1").dirtyCells).toBe(1);
    // One viewport-pinned chunk, one dirty chunk, and at most one clean victim.
    expect(store.getPagedStats("s1").chunks).toBeLessThanOrEqual(3);
    expect(store.getCellLoadState(addr(4, 0))).toBe("unloaded");

    store.acknowledgeOperations([
      { op: "set", addr: addr(0, 1), value: { kind: "literal", value: 99 } },
    ]);
    expect(store.getPagedStats("s1").dirtyCells).toBe(0);
    store.dispose();
  });

  it("keeps paged edits pinned until their operations are acknowledged", () => {
    const store = new SheetwriteStore(makeWorkbook(1_000_000), undefined, {
      storage: "paged",
      chunkRows: 4,
      cacheBytes: 150,
    });
    const operation: DocumentOp = {
      op: "set",
      addr: addr(100, 1),
      value: { kind: "literal", value: 77 },
    };

    store.applyTransaction({ patches: [operation] });
    for (const row of [0, 4, 8, 12, 16]) {
      store.loadPage("s1", row, ALL_SOURCE_COLUMN_BANDS, [
        { name: `row-${row}`, amount: row, city: "B" },
      ]);
    }
    expect(store.getCellLoadState(operation.addr)).toBe("local-edit");
    expect(store.getPagedStats("s1").dirtyCells).toBe(1);

    store.acknowledgeOperations([operation]);
    expect(store.getPagedStats("s1").dirtyCells).toBe(0);
    for (const row of [20, 24, 28, 32, 36]) {
      store.loadPage("s1", row, ALL_SOURCE_COLUMN_BANDS, [
        { name: `row-${row}`, amount: row, city: "C" },
      ]);
    }
    expect(store.getCellLoadState(operation.addr)).toBe("unloaded");
    store.dispose();
  });

  it("recomputes formulas and references after unloaded dependencies arrive", () => {
    const store = new SheetwriteStore(makeWorkbook(6000), undefined, {
      storage: "paged",
      cacheBytes: 2_000_000,
    });
    store.applyTransaction({
      patches: [
        { op: "set", addr: addr(0, 2), value: { kind: "formula", src: "=B5001+1" } },
        { op: "set", addr: addr(1, 2), value: { kind: "ref", target: addr(5000, 1) } },
      ],
    });
    expect(store.getCell(addr(0, 2)).resolved).toBe("#LOADING!");
    expect(store.getCell(addr(1, 2)).resolved).toBe("#LOADING!");
    expect(store.getCellLoadState(addr(0, 2))).toBe("local-edit");
    expect(store.getCellLoadState(addr(1, 2))).toBe("local-edit");

    store.loadPage("s1", 5000, ALL_SOURCE_COLUMN_BANDS, [{ name: null, amount: 41, city: null }]);
    expect(store.getCell(addr(0, 2)).resolved).toBe(42);
    expect(store.getCell(addr(1, 2)).resolved).toBe(41);
    expect(store.getCellLoadState(addr(0, 2))).toBe("local-edit");
    expect(store.getCellLoadState(addr(1, 2))).toBe("local-edit");
    store.dispose();
  });

  it("rejects dirty-capacity overflow atomically before formula/ref bookkeeping or events", () => {
    const store = new SheetwriteStore(makeWorkbook(4), undefined, {
      storage: "paged",
      chunkRows: 4,
      cacheBytes: 1024,
      dirtyCellLimit: 1,
    });
    let events = 0;
    store.on("change", () => {
      events += 1;
    });

    const rejected = store.applyTransaction({
      patches: [
        { op: "set", addr: addr(0, 0), value: { kind: "formula", src: "=1+1" } },
        { op: "set", addr: addr(1, 0), value: { kind: "ref", target: addr(2, 0) } },
      ],
    });
    expect(rejected).toMatchObject({
      status: "rejected",
      epoch: 0,
      issues: [{ kind: "resource-limit", resource: "paged-dirty-cells", actual: 2, max: 1 }],
    });
    expect(store.getFormula(addr(0, 0))).toBeNull();
    expect(store.getRefTarget(addr(1, 0))).toBeNull();
    expect(store.getPagedStats("s1").dirtyCells).toBe(0);
    expect(events).toBe(0);

    const applied = store.applyTransaction({
      patches: [{ op: "set", addr: addr(0, 0), value: { kind: "formula", src: "=1+1" } }],
    });
    expect(applied).toMatchObject({ status: "applied", epoch: 1 });
    const secondRejected = store.applyTransaction({
      patches: [{ op: "set", addr: addr(1, 0), value: { kind: "ref", target: addr(2, 0) } }],
    });
    expect(secondRejected).toMatchObject({ status: "rejected", epoch: 1 });
    expect(store.getFormula(addr(0, 0))).toBe("=1+1");
    expect(store.getRefTarget(addr(1, 0))).toBeNull();
    expect(store.getPagedStats("s1").dirtyCells).toBe(1);
    expect(events).toBe(1);
    store.dispose();
  });
});
it("bounds hostile bulk ranges before enumeration or WASM mutation", () => {
  const store = new SheetwriteStore(makeWorkbook(1_000_000), undefined, {
    storage: "paged",
    dirtyCellLimit: 1,
  });
  const cyclic: Record<string, unknown> = { op: "set" };
  cyclic.self = cyclic;
  const throwingAccessor = Object.defineProperty({}, "op", {
    enumerable: true,
    get: () => {
      throw new Error("hostile getter");
    },
  });
  const throwingAddr = Object.defineProperty(
    { op: "set", value: { kind: "literal", value: 1 } },
    "addr",
    {
      enumerable: true,
      get: () => {
        throw new Error("hostile addr getter");
      },
    },
  );
  const throwingRow = Object.defineProperty({ sheet: "s1", col: 0 }, "row", {
    enumerable: true,
    get: () => {
      throw new Error("hostile row getter");
    },
  });
  const throwingStartRow = Object.defineProperty({ col: 0 }, "row", {
    enumerable: true,
    get: () => {
      throw new Error("hostile range row getter");
    },
  });
  const throwingRangeRow = {
    op: "setRangeStyle",
    range: {
      sheet: "s1",
      start: throwingStartRow,
      end: { row: 0, col: 0 },
    },
    style: { bold: true },
  };

  for (const patch of [
    1,
    { op: "setRangeStyle", range: {}, style: { bold: true } },
    { op: "set", addr: addr(0, 0), value: { kind: "literal", value: Number.NaN } },
    cyclic,
    throwingAccessor,
    throwingAddr,
    { op: "set", addr: throwingRow, value: { kind: "literal", value: 1 } },
    throwingRangeRow,
  ] as const) {
    expect(
      store.applyTransaction({
        patches: [patch as unknown as DocumentOp],
      }),
    ).toMatchObject({
      status: "rejected",
      epoch: 0,
      issues: [{ kind: "invalid-operation", operationIndex: 0 }],
    });
  }

  const malformed = store.applyTransaction({
    patches: [
      {
        op: "setBlock",
        range: { sheet: "s1", start: { row: 0, col: 0 }, end: { row: 0, col: 0 } },
        block: { rowCount: 0xffff_ffff, colCount: 1, values: [] },
      } as DocumentOp,
    ],
  });
  expect(malformed).toMatchObject({
    status: "rejected",
    epoch: 0,
    issues: [{ kind: "invalid-operation", operationIndex: 0 }],
  });

  const started = performance.now();
  const huge = store.applyTransaction({
    patches: [
      {
        op: "clearRange",
        range: {
          sheet: "s1",
          start: { row: 0, col: 0 },
          end: { row: 0xffff_ffff, col: 0 },
        },
      },
    ],
  });
  expect(performance.now() - started).toBeLessThan(100);
  expect(huge).toMatchObject({
    status: "rejected",
    epoch: 0,
    issues: [{ kind: "resource-limit", resource: "paged-dirty-cells", max: 1 }],
  });
  expect(store.getRangeMutationAllocationStats()).toMatchObject({
    documentOperations: 0,
    ffiCalls: 0,
  });
  store.dispose();
});

it("rejects unknown operation and reference sheets before policy or engine access", () => {
  const store = new SheetwriteStore(makeWorkbook(4), undefined, { storage: "paged" });
  const missing = "missing";
  const range = {
    sheet: missing,
    start: { row: 0, col: 0 },
    end: { row: 0, col: 0 },
  };
  const operations: DocumentOp[] = [
    {
      op: "setRange",
      range,
      cells: [{ rowOffset: 0, colOffset: 0, value: { kind: "literal", value: 1 } }],
    },
    {
      op: "setBlock",
      range,
      block: { rowCount: 1, colCount: 1, values: [1] },
    },
    { op: "setRangeStyle", range, style: { bold: true } },
    { op: "clearRange", range },
    { op: "addRows", sheet: missing, at: 0, count: 1 },
    {
      op: "set",
      addr: { sheet: missing, row: 0, col: 0 },
      value: { kind: "formula", src: "=1+1" },
    },
    {
      op: "set",
      addr: addr(0, 0),
      value: { kind: "ref", target: { sheet: missing, row: 0, col: 0 } },
    },
    {
      op: "setRange",
      range: { ...range, sheet: "s1" },
      cells: [
        {
          rowOffset: 0,
          colOffset: 0,
          value: { kind: "ref", target: { sheet: missing, row: 0, col: 0 } },
        },
      ],
    },
    {
      op: "setBlock",
      range: { ...range, sheet: "s1" },
      block: {
        rowCount: 1,
        colCount: 1,
        values: [null],
        refs: [[0, { sheet: missing, row: 0, col: 0 }]],
      },
    },
  ];
  for (const operation of operations) {
    expect(store.applyTransaction({ patches: [operation] })).toMatchObject({
      status: "rejected",
      epoch: 0,
      issues: [{ kind: "invalid-operation", operationIndex: 0 }],
    });
  }
  expect(store.getCellLoadState(addr(0, 0))).toBe("unloaded");
  store.dispose();
});

it("fails closed before retaining an oversized ref graph for later removal", () => {
  const workbook = makeWorkbook(4);
  const second = structuredClone(workbook.sheets[0]!);
  second.id = "s2";
  second.name = "Second";
  workbook.sheets.push(second);
  const store = new SheetwriteStore(workbook, undefined, {
    storage: "paged",
    referenceSimulationLimit: 1,
  });
  expect(
    store.applyTransaction(
      {
        patches: [0, 1].map((row) => ({
          op: "set" as const,
          addr: addr(row, 0),
          value: { kind: "ref" as const, target: addr(2, 1) },
        })),
      },
      { source: "remote" },
    ),
  ).toMatchObject({ status: "applied" });
  store.resetRangeMutationAllocationStats();

  const outcome = store.applyTransaction({
    patches: [
      { op: "set", addr: addr(3, 0), value: { kind: "literal", value: "local" } },
      { op: "removeSheet", sheet: "s2" },
    ],
  });
  expect(outcome).toMatchObject({
    status: "rejected",
    epoch: 1,
    issues: [
      {
        kind: "resource-limit",
        resource: "paged-reference-simulation",
        actual: 2,
        max: 1,
      },
    ],
  });
  expect(store.getRangeMutationAllocationStats()).toMatchObject({
    admissionReferenceEntriesScanned: 0,
    admissionReferenceMapsMaterialized: 0,
  });
  store.dispose();
});

it("caps transaction-created refs before virtual retention grows past its limit", () => {
  const workbook = makeWorkbook(4);
  const second = structuredClone(workbook.sheets[0]!);
  second.id = "s2";
  second.name = "Second";
  workbook.sheets.push(second);
  const store = new SheetwriteStore(workbook, undefined, {
    storage: "paged",
    referenceSimulationLimit: 1,
  });
  const outcome = store.applyTransaction({
    patches: [
      {
        op: "set",
        addr: addr(0, 0),
        value: { kind: "ref", target: addr(2, 1) },
      },
      {
        op: "set",
        addr: addr(1, 0),
        value: { kind: "ref", target: addr(2, 1) },
      },
      { op: "removeSheet", sheet: "s2" },
    ],
  });
  expect(outcome).toMatchObject({
    status: "rejected",
    epoch: 0,
    issues: [
      {
        kind: "resource-limit",
        resource: "paged-reference-simulation",
        actual: 2,
        max: 1,
      },
    ],
  });
  expect(store.getRangeMutationAllocationStats()).toMatchObject({
    admissionReferenceEntriesScanned: 0,
    admissionReferenceMapsMaterialized: 1,
  });
  expect(store.getPagedStats("s1").dirtyCells).toBe(0);
  store.dispose();
});

it("keeps virtual sheet membership aligned when addSheet snapshots are semantically invalid", () => {
  const baseSheet = {
    id: "s2",
    name: "Second",
    order: 1,
    rowCount: 2,
    columns: [{ key: "value", header: "Value", width: 100, type: "text" as const }],
    cells: [],
  };
  const invalidSheets = [
    {
      ...baseSheet,
      columns: [
        ...baseSheet.columns,
        { key: "value", header: "Duplicate", width: 100, type: "text" as const },
      ],
    },
    { ...baseSheet, order: 2 },
    { ...baseSheet, frozenRows: 3 },
  ];
  const expectedCodes = ["invalid-sheet", "invalid-position", "invalid-sheet"] as const;
  for (const [index, sheet] of invalidSheets.entries()) {
    const store = new SheetwriteStore(makeWorkbook(4), undefined, { storage: "paged" });
    const outcome = store.applyTransaction({
      patches: [
        { op: "addSheet", sheet },
        {
          op: "setRange",
          range: { sheet: "s2", start: { row: 0, col: 0 }, end: { row: 0, col: 0 } },
          cells: [{ rowOffset: 0, colOffset: 0, value: { kind: "literal", value: "unsafe" } }],
        },
      ],
    });
    expect(outcome).toMatchObject({
      status: "rejected",
      epoch: 0,
      issues: [{ kind: "sheet-lifecycle", code: expectedCodes[index], operationIndex: 0 }],
    });
    expect(store.getWorkbook().sheets.map((candidate) => candidate.id)).toEqual(["s1"]);
    store.dispose();
  }
});

it("keeps lifecycle names aligned when rename collides with another sheet id", () => {
  const workbook = makeWorkbook(4);
  const second = structuredClone(workbook.sheets[0]!);
  second.id = "s2";
  second.name = "Second";
  workbook.sheets.push(second);
  const store = new SheetwriteStore(workbook, undefined, { storage: "paged" });
  const outcome = store.applyTransaction({
    patches: [
      { op: "renameSheet", sheet: "s1", name: "s2" },
      {
        op: "addSheet",
        sheet: {
          id: "s3",
          name: "Sheet 1",
          order: 2,
          rowCount: 1,
          columns: [{ key: "value", header: "Value", width: 100, type: "text" }],
          cells: [],
        },
      },
      {
        op: "set",
        addr: { sheet: "s3", row: 0, col: 0 },
        value: { kind: "literal", value: "unsafe" },
      },
    ],
  });
  expect(outcome).toMatchObject({ status: "applied", epoch: 1 });
  expect(store.getWorkbook().sheets.map((sheet) => [sheet.id, sheet.name])).toEqual([
    ["s1", "s2"],
    ["s2", "Second"],
    ["s3", "Sheet 1"],
  ]);
  expect(store.getCell({ sheet: "s3", row: 0, col: 0 }).resolved).toBe("unsafe");
  store.dispose();
});

describe("validation, protection, and notes metadata", () => {
  it("applies reject, warn, and partial validation policy at the transaction boundary", () => {
    const workbook = makeWorkbook(4);
    workbook.sheets[0]!.validationRules = [
      {
        id: "amount-limit",
        range: { sheet: "s1", start: { row: 0, col: 1 }, end: { row: 3, col: 1 } },
        condition: { kind: "number", min: 0, max: 10 },
        policy: "reject",
        allowBlank: false,
      },
    ];
    const atomic = new SheetwriteStore(workbook);
    const rejected = atomic.applyTransaction({
      patches: [
        { op: "set", addr: addr(0, 1), value: { kind: "literal", value: 20 } },
        { op: "set", addr: addr(0, 0), value: { kind: "literal", value: "kept out" } },
      ],
    });
    expect(rejected.status).toBe("rejected");
    expect(rejected.status === "rejected" ? rejected.issues : []).toMatchObject([
      { kind: "validation", ruleId: "amount-limit", operationIndex: 0 },
    ]);
    expect(atomic.getCell(addr(0, 0)).resolved).toBeNull();

    atomic.applyTransaction({
      patches: [
        {
          op: "setValidationRule",
          sheet: "s1",
          rule: { ...workbook.sheets[0]!.validationRules![0]!, policy: "warn" },
        },
      ],
    });
    const warned = atomic.applyTransaction({
      patches: [{ op: "set", addr: addr(0, 1), value: { kind: "literal", value: 20 } }],
    });
    expect(warned.status).toBe("applied");
    expect(warned.status === "applied" ? warned.warnings : []).toMatchObject([
      { kind: "validation", ruleId: "amount-limit" },
    ]);
    expect(atomic.getCell(addr(0, 1)).resolved).toBe(20);
    atomic.dispose();
    workbook.sheets[0]!.validationRules![0]!.policy = "reject";

    const partial = new SheetwriteStore(workbook, undefined, { mutationPolicy: "partial" });
    const outcome = partial.applyTransaction({
      patches: [
        { op: "set", addr: addr(1, 1), value: { kind: "literal", value: -1 } },
        { op: "set", addr: addr(1, 0), value: { kind: "literal", value: "applied" } },
      ],
    });
    expect(outcome.status).toBe("applied");
    expect(outcome.status === "applied" ? outcome.transaction.patches : []).toHaveLength(1);
    expect(outcome.status === "applied" ? outcome.rejections : []).toHaveLength(1);
    expect(partial.getCell(addr(1, 1)).resolved).toBeNull();
    expect(partial.getCell(addr(1, 0)).resolved).toBe("applied");

    const clear = partial.applyTransaction({
      patches: [
        {
          op: "clearRange",
          range: { sheet: "s1", start: { row: 0, col: 1 }, end: { row: 3, col: 1 } },
        },
      ],
    });
    const clearIssues =
      clear.status === "rejected"
        ? clear.issues
        : clear.status === "applied"
          ? (clear.rejections ?? [])
          : [];
    expect(clearIssues).toMatchObject([{ ruleId: "amount-limit" }]);
    partial.dispose();
  });

  it("denies protected local mutations by default and delegates permission to the host", () => {
    const workbook = makeWorkbook(3);
    workbook.sheets[0]!.protectedRanges = [
      {
        id: "locked",
        label: "Locked cells",
        range: { sheet: "s1", start: { row: 0, col: 0 }, end: { row: 1, col: 1 } },
      },
    ];
    const store = new SheetwriteStore(workbook);
    const denied = store.applyTransaction({
      patches: [{ op: "set", addr: addr(0, 0), value: { kind: "literal", value: "blocked" } }],
    });
    expect(denied.status).toBe("rejected");
    expect(denied.status === "rejected" ? denied.issues : []).toMatchObject([
      { kind: "protection", protectedRangeId: "locked", operationIndex: 0 },
    ]);

    const requests: string[] = [];
    store.setProtectionResolver((request) => {
      requests.push(`${request.commitReason}:${request.protectedRange.id}`);
      return "allow";
    });
    expect(
      store.applyTransaction(
        {
          patches: [{ op: "set", addr: addr(0, 0), value: { kind: "literal", value: "allowed" } }],
        },
        { commitReason: "edit-enter" },
      ).status,
    ).toBe("applied");
    expect(requests).toEqual(["edit-enter:locked"]);

    store.setProtectionResolver(() => "deny");
    expect(
      store.applyTransaction(
        {
          patches: [{ op: "set", addr: addr(0, 1), value: { kind: "literal", value: "server" } }],
        },
        { source: "remote" },
      ).status,
    ).toBe("applied");
    store.dispose();
  });

  it("serializes and structurally rebases validation, protection, and note metadata", () => {
    const workbook = makeWorkbook(4);
    workbook.sheets[0]!.validationRules = [
      {
        id: "choices",
        range: { sheet: "s1", start: { row: 1, col: 0 }, end: { row: 2, col: 0 } },
        condition: { kind: "list", values: ["A", "B"] },
        policy: "reject",
      },
    ];
    workbook.sheets[0]!.protectedRanges = [
      {
        id: "protected",
        range: { sheet: "s1", start: { row: 1, col: 1 }, end: { row: 2, col: 1 } },
      },
    ];
    workbook.sheets[0]!.notes = [{ addr: addr(2, 2), text: "Review this value" }];
    const store = new SheetwriteStore(workbook);
    store.setProtectionResolver(() => "allow");

    store.applyTransaction({
      patches: [{ op: "addRows", sheet: "s1", at: 1, count: 1 }],
    });
    const sheet = store.getWorkbook().sheets[0]!;
    expect(sheet.validationRules![0]!.range).toMatchObject({
      start: { row: 2, col: 0 },
      end: { row: 3, col: 0 },
    });
    expect(sheet.protectedRanges![0]!.range).toMatchObject({
      start: { row: 2, col: 1 },
      end: { row: 3, col: 1 },
    });
    expect(sheet.notes).toEqual([{ addr: addr(3, 2), text: "Review this value" }]);

    const snapshot = store.exportSnapshot();
    expect(validateWorkbookSnapshot(snapshot).ok).toBe(true);
    const restored = SheetwriteStore.fromSnapshot(JSON.parse(JSON.stringify(snapshot)));
    expect(restored.getWorkbook().sheets[0]!.validationRules).toEqual(sheet.validationRules);
    expect(restored.getWorkbook().sheets[0]!.protectedRanges).toEqual(sheet.protectedRanges);
    expect(restored.getWorkbook().sheets[0]!.notes).toEqual(sheet.notes);
    restored.dispose();
    store.dispose();
  });
});

describe("transaction resource ingress", () => {
  const literalSet = (row: number, text: string): DocumentOp => ({
    op: "set",
    addr: addr(row, 0),
    value: { kind: "literal", value: text },
  });
  it("rejects local and remote count overflow before policy, state, epoch, or events", () => {
    const workbook = makeWorkbook(4);
    workbook.sheets[0]!.protectedRanges = [
      {
        id: "all",
        range: { sheet: "s1", start: { row: 0, col: 0 }, end: { row: 3, col: 2 } },
      },
    ];
    let policyCalls = 0;
    const limits = resolveTransactionResourceLimits({ maxOperations: 1 });
    const store = new SheetwriteStore(workbook, undefined, {
      transactionResourceLimits: limits,
      protectionResolver: () => {
        policyCalls += 1;
        return "allow";
      },
    });
    const events: ChangeEvent[] = [];
    store.on("change", (event) => events.push(event));

    const accepted = store.applyTransaction({ patches: [literalSet(0, "accepted")] });
    expect(accepted.status).toBe("applied");
    if (accepted.status !== "applied") throw new Error("count-limit transaction rejected");
    expect(validateTransactionResources(accepted.transaction.patches, limits).ok).toBe(true);
    expect(policyCalls).toBe(1);
    policyCalls = 0;

    const oversizedPatches = [literalSet(1, "blocked"), literalSet(2, "also blocked")];
    const local = store.applyTransaction({ patches: oversizedPatches });
    expect(local).toEqual({
      status: "rejected",
      epoch: 1,
      issues: [
        {
          kind: "resource-limit",
          severity: "error",
          resource: "operations",
          actual: 2,
          max: 1,
          message: "Transaction operation count 2 exceeds maximum 1",
        },
      ],
    });
    expect(policyCalls).toBe(0);
    expect(events).toHaveLength(1);
    expect(store.getCell(addr(1, 0)).resolved).toBeNull();
    expect(store.getCell(addr(2, 0)).resolved).toBeNull();

    const remote = store.applyTransaction({ patches: oversizedPatches }, { source: "remote" });
    expect(remote).toMatchObject({ status: "rejected", epoch: 1 });
    expect(events).toHaveLength(1);
    expect(store.getCell(addr(1, 0)).resolved).toBeNull();

    const acceptedRemote = store.applyTransaction(
      { patches: [literalSet(1, "remote")] },
      { source: "remote" },
    );
    expect(acceptedRemote.status).toBe("applied");
    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({ epoch: 2, source: "remote" });
    expect(store.getCell(addr(1, 0)).resolved).toBe("remote");
    store.dispose();
  });
});
