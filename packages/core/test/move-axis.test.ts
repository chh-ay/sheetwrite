import { beforeAll, describe, expect, it } from "bun:test";

import { DocumentController } from "../src/document-controller.js";
import { initSheetwrite } from "../src/grid.js";
import { SheetwriteStore } from "../src/store.js";
import type { CellAddress, CellScalar, DocumentOp, Workbook } from "../src/types.js";

beforeAll(async () => {
  await initSheetwrite();
});

const ROWS = 6;

function workbook(): Workbook {
  return {
    activeSheet: "data",
    sheets: [
      {
        id: "data",
        name: "Data",
        rowCount: ROWS,
        columns: [
          { key: "a", header: "A", width: 100, type: "number" },
          { key: "b", header: "B", width: 100, type: "number" },
          { key: "c", header: "C", width: 100, type: "number" },
        ],
      },
      {
        id: "summary",
        name: "Summary",
        rowCount: ROWS,
        columns: [{ key: "a", header: "A", width: 100, type: "number" }],
      },
    ],
  };
}

const at = (sheet: string, row: number, col = 0): CellAddress => ({ sheet, row, col });

function literal(sheet: string, row: number, col: number, value: CellScalar): DocumentOp {
  return { op: "set", addr: at(sheet, row, col), value: { kind: "literal", value } };
}

function formula(sheet: string, row: number, col: number, src: string): DocumentOp {
  return { op: "set", addr: at(sheet, row, col), value: { kind: "formula", src } };
}

/** `Data` holds 1..6 in A1:A6, then `patches` apply. */
function setup(patches: DocumentOp[]) {
  const store = new SheetwriteStore(workbook());
  store.applyTransaction({
    patches: [
      ...Array.from({ length: ROWS }, (_, row) => literal("data", row, 0, row + 1)),
      ...patches,
    ],
  });
  const controller = new DocumentController({
    store,
    loadable: store,
    readOnly: () => false,
    epoch: () => 0,
    materializeVirtualColumns: (operations) => operations,
    onMutationRejected: () => {},
    onHistoryApplied: () => {},
  });
  return { store, controller };
}

function formulas(store: SheetwriteStore, cells: CellAddress[]): (string | null)[] {
  return cells.map((cell) => store.getFormula(cell));
}

describe("row and column moves", () => {
  // Excel moves the cells: a reference follows the cell it names
  // (https://support.microsoft.com/en-us/excel/move-or-copy-cells-rows-and-columns).
  it("keeps every reference on the cell it named", () => {
    const { store, controller } = setup([
      formula("data", 1, 1, "=A2*2"),
      formula("summary", 0, 0, "=Data!A2*2"),
      formula("summary", 1, 0, "=(Data!A3 + 1) * 2"),
    ]);
    try {
      const move: DocumentOp = { op: "moveRows", sheet: "data", from: 1, count: 1, to: 3 };
      expect(controller.commit([move], "structure").status).toBe("applied");

      expect(
        formulas(store, [at("summary", 0), at("summary", 1), at("data", 3, 1), at("data", 1, 1)]),
      ).toEqual(["=Data!A4*2", "=(Data!A2 + 1) * 2", "=A4*2", null]);
      expect(store.getCell(at("summary", 0)).resolved).toBe(4);
      expect(store.getCell(at("summary", 1)).resolved).toBe(8);
      expect(store.getCell(at("data", 3, 1)).resolved).toBe(4);
    } finally {
      controller.destroy();
      store.dispose();
    }
  });

  it("moves columns the same way", () => {
    const { store, controller } = setup([
      literal("data", 0, 1, 20),
      formula("summary", 0, 0, "=Data!B1+Data!A1"),
    ]);
    try {
      const move: DocumentOp = { op: "moveColumns", sheet: "data", from: 0, count: 1, to: 2 };
      expect(controller.commit([move], "structure").status).toBe("applied");

      expect(store.getFormula(at("summary", 0))).toBe("=Data!A1+Data!C1");
      expect(store.getCell(at("summary", 0)).resolved).toBe(21);
      expect(store.getWorkbook().sheets[0]?.columns.map((column) => column.key)).toEqual([
        "b",
        "c",
        "a",
      ]);
    } finally {
      controller.destroy();
      store.dispose();
    }
  });

  it("is one history step, and undo restores a range that lost a moved row", () => {
    const { store, controller } = setup([
      formula("summary", 0, 0, "=SUM(Data!A1:A4)"),
      formula("summary", 1, 0, "=Data!A4"),
    ]);
    try {
      const move: DocumentOp = { op: "moveRows", sheet: "data", from: 3, count: 1, to: 5 };
      expect(controller.commit([move], "structure").status).toBe("applied");
      // The last row of the range moved out of it, so the range lost it.
      expect(formulas(store, [at("summary", 0), at("summary", 1)])).toEqual([
        "=SUM(Data!A1:A3)",
        "=Data!A6",
      ]);

      controller.undo();

      expect(formulas(store, [at("summary", 0), at("summary", 1)])).toEqual([
        "=SUM(Data!A1:A4)",
        "=Data!A4",
      ]);
      expect(store.getCell(at("summary", 0)).resolved).toBe(10);
      expect(store.getCell(at("data", 3)).resolved).toBe(4);
      expect(controller.canUndo).toBe(false);
    } finally {
      controller.destroy();
      store.dispose();
    }
  });

  it("moves a named range with the rows", () => {
    const { store, controller } = setup([
      {
        op: "setNamedRange",
        namedRange: {
          name: "Second",
          range: { sheet: "data", start: { row: 1, col: 0 }, end: { row: 1, col: 0 } },
        },
      },
      formula("summary", 0, 0, "=Second*10"),
    ]);
    try {
      const move: DocumentOp = { op: "moveRows", sheet: "data", from: 1, count: 1, to: 4 };
      expect(controller.commit([move], "structure").status).toBe("applied");

      expect(store.getWorkbook().namedRanges?.[0]?.range?.start.row).toBe(4);
      expect(store.getCell(at("summary", 0)).resolved).toBe(20);
    } finally {
      controller.destroy();
      store.dispose();
    }
  });
});
