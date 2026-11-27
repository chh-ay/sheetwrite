import { afterEach, beforeAll, describe, expect, it } from "bun:test";

import { DocumentController } from "../src/document-controller.js";
import { validateDocumentOperationShape } from "../src/document-protocol.js";
import { initSheetwrite } from "../src/grid.js";
import { rebaseDocumentOperations } from "../src/rebase.js";
import { ROW_ORDER_ENCODING } from "../src/row-order.js";
import { SheetwriteStore } from "../src/store.js";
import type { CellScalar, DocumentOp, Range } from "../src/types.js";
import { makeWorkbook } from "./fixtures.js";

beforeAll(async () => {
  await initSheetwrite();
});

const ROWS = 6;

const address = (row: number, col = 0) => ({ sheet: "s1", row, col });

const block = (first_row: number, last_row: number, last_col = 2): Range => ({
  sheet: "s1",
  start: { row: first_row, col: 0 },
  end: { row: last_row, col: last_col },
});

const BYTES_PER_ROW = 4;

/** A `permuteRows` operation; the order is little-endian `u32` values in base64. */
function permutation(range: Range, order: number[]): DocumentOp {
  const bytes = new Uint8Array(order.length * BYTES_PER_ROW);
  const view = new DataView(bytes.buffer);
  for (const [index, row] of order.entries()) view.setUint32(index * BYTES_PER_ROW, row, true);

  return {
    op: "permuteRows",
    range,
    encoding: ROW_ORDER_ENCODING,
    order: Buffer.from(bytes).toString("base64"),
  };
}

function literal(row: number, col: number, value: CellScalar): DocumentOp {
  return { op: "set", addr: address(row, col), value: { kind: "literal", value } };
}

function formula(row: number, col: number, src: string): DocumentOp {
  return { op: "set", addr: address(row, col), value: { kind: "formula", src } };
}

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
});

function setup(patches: DocumentOp[]) {
  const store = new SheetwriteStore(makeWorkbook(ROWS));
  store.applyTransaction({ patches });
  const controller = new DocumentController({
    store,
    loadable: store,
    readOnly: () => false,
    epoch: () => 0,
    materializeVirtualColumns: (operations) => operations,
    onMutationRejected: () => {},
    onHistoryApplied: () => {},
  });
  cleanups.push(() => {
    controller.destroy();
    store.dispose();
  });
  return { store, controller };
}

/** Merge the cells of `merges` on sheet `s1`. */
function merge(store: SheetwriteStore, ...merges: [number, number, number, number][]): void {
  store.applyTransaction({
    patches: merges.map(([r0, c0, r1, c1]) => ({
      op: "addMerge",
      sheet: "s1",
      merge: { r0, c0, r1, c1 },
    })),
  });
}

function column(store: SheetwriteStore, col: number, rows = 3): CellScalar[] {
  return Array.from({ length: rows }, (_, row) => store.getCell(address(row, col)).resolved);
}

describe("in-place sort", () => {
  it("moves the cells so that formulas outside the range read the sorted values", () => {
    const { store } = setup([
      literal(0, 1, 30),
      literal(1, 1, 10),
      literal(2, 1, 20),
      formula(5, 2, "=B1*2"),
    ]);
    expect(store.sortRange(block(0, 2, 1), [{ col: 1, ascending: true }]).status).toBe("applied");

    expect(column(store, 1)).toEqual([10, 20, 30]);
    expect(store.getCell(address(5, 2)).resolved).toBe(20);
    expect(store.getFormula(address(5, 2))).toBe("=B1*2");
  });

  it("keeps a header row and hidden rows in place", () => {
    const { store } = setup([
      literal(0, 0, "Header"),
      literal(1, 0, "c"),
      literal(2, 0, "hidden"),
      literal(3, 0, "a"),
      literal(4, 0, "b"),
    ]);
    store.hideRows("s1", [2]);

    store.sortRange(block(0, 4, 0), [{ col: 0, ascending: true }], { hasHeader: true });

    expect(column(store, 0, 5)).toEqual(["Header", "a", "hidden", "b", "c"]);
  });

  it("adjusts formulas in moved rows by the move of their own row", () => {
    const { store } = setup([
      literal(0, 0, 3),
      literal(1, 0, 1),
      literal(2, 0, 2),
      formula(0, 1, "=A1*10"),
      formula(1, 1, "=$A$1+'Sheet 1'!A2"),
      formula(2, 1, "=A2+1"),
    ]);
    store.sortRange(block(0, 2, 1), [{ col: 0, ascending: true }]);

    expect([0, 1, 2].map((row) => store.getFormula(address(row, 1)))).toEqual([
      "=$A$1+'Sheet 1'!A2",
      "=A1+1",
      "=A3*10",
    ]);
    expect(column(store, 1)).toEqual([3, 2, 30]);
  });

  it("is one history step, and undo restores formulas that lost a reference", () => {
    const { store, controller } = setup([
      literal(0, 0, 3),
      formula(1, 0, "=A1"),
      literal(2, 0, 1),
      literal(0, 2, "first"),
    ]);
    const before = [column(store, 0), [0, 1, 2].map((row) => store.getFormula(address(row)))];
    expect(controller.commit([permutation(block(0, 2), [1, 2, 0])], "sort").status).toBe("applied");
    expect(store.getFormula(address(0))).toBe("=#REF!");
    expect(store.getCell(address(2, 2)).resolved).toBe("first");

    controller.undo();

    expect([column(store, 0), [0, 1, 2].map((row) => store.getFormula(address(row)))]).toEqual(
      before,
    );
    expect(controller.canUndo).toBe(false);
  });

  it("reaches a collaborator as one transaction", () => {
    const sender = setup([literal(0, 0, "b"), literal(1, 0, "a")]);
    const receiver = setup([literal(0, 0, "b"), literal(1, 0, "a")]);
    const transactions: DocumentOp[][] = [];
    cleanups.push(
      sender.store.on("change", (event) => {
        transactions.push(event.transaction.patches);
        receiver.controller.applyRemoteOperations(event.transaction.patches);
      }),
    );

    sender.controller.commit([permutation(block(0, 1, 0), [1, 0])], "sort");

    expect(transactions).toHaveLength(1);
    expect(column(receiver.store, 0, 2)).toEqual(["a", "b"]);
  });

  /** Microsoft Learn: Excel sorts only identically sized merged cells. */
  it("refuses a sort that would split a merged cell", () => {
    const { store, controller } = setup([literal(0, 0, 2), literal(1, 0, 1)]);
    merge(store, [0, 1, 1, 1]);

    // The engine drops the operation, so nothing changes.
    expect(controller.commit([permutation(block(0, 1, 1), [1, 0])], "sort")).toMatchObject({
      status: "noop",
      reason: "out-of-bounds",
    });
    expect(column(store, 0, 2)).toEqual([2, 1]);
  });

  /** As Excel does (Microsoft Learn). */
  it("sorts records of identically sized merged cells as units", () => {
    const { store } = setup([
      literal(0, 0, "b"),
      literal(1, 1, "b second"),
      literal(2, 0, "a"),
      literal(3, 1, "a second"),
    ]);
    merge(store, [0, 0, 1, 0], [2, 0, 3, 0]);

    expect(store.sortRange(block(0, 3, 1), [{ col: 0, ascending: true }]).status).toBe("applied");

    expect(column(store, 0, 4)).toEqual(["a", null, "b", null]);
    expect(column(store, 1, 4)).toEqual([null, "a second", null, "b second"]);
  });

  /** As Excel does (Microsoft Learn). */
  it("refuses merged cells that are not all the same size", () => {
    const { store } = setup([literal(0, 0, 2), literal(1, 0, 1), literal(2, 0, 3)]);
    merge(store, [0, 1, 1, 1]);

    expect(store.sortRange(block(0, 2, 1), [{ col: 0, ascending: true }]).status).toBe("rejected");
    expect(column(store, 0)).toEqual([2, 1, 3]);
  });

  /** Microsoft Support: a sort in a table covers the whole table body. */
  it("sorts a table body and refuses a range that crosses the table edge", () => {
    const { store, controller } = setup([literal(1, 0, 2), literal(2, 0, 1)]);
    store.applyTransaction({
      patches: [
        {
          op: "addTable",
          table: {
            id: "table-1",
            name: "Table1",
            range: block(0, 2, 1),
            columns: [
              { id: "a", name: "A" },
              { id: "b", name: "B" },
            ],
            headerRow: true,
            totalsRow: false,
          },
        },
      ],
    });

    expect(controller.commit([permutation(block(1, 2, 0), [1, 0])], "sort")).toMatchObject({
      status: "noop",
      reason: "out-of-bounds",
    });
    expect(controller.commit([permutation(block(1, 2, 1), [1, 0])], "sort").status).toBe("applied");
    expect(column(store, 0, 3).slice(1)).toEqual([1, 2]);
  });

  it("moves notes with their row", () => {
    const { store } = setup([literal(0, 0, 2), literal(1, 0, 1)]);
    store.applyTransaction({ patches: [{ op: "setNote", addr: address(0, 1), text: "two" }] });

    store.sortRange(block(0, 1, 1), [{ col: 0, ascending: true }]);

    expect(store.getWorkbook().sheets[0]?.notes).toEqual([{ addr: address(1, 1), text: "two" }]);
  });
});

describe("permuteRows operation", () => {
  it("validates the operation shape", () => {
    const valid = permutation(block(0, 1), [1, 0]);

    expect(validateDocumentOperationShape(valid)).toEqual([]);
    expect(validateDocumentOperationShape({ ...valid, encoding: "u16" })).not.toEqual([]);
  });

  it("conflicts with a concurrent edit inside the sorted range", () => {
    const result = rebaseDocumentOperations(
      [literal(1, 0, "local")],
      [permutation(block(0, 2), [2, 0, 1])],
    );

    expect(result.status).toBe("conflict");
  });
});
