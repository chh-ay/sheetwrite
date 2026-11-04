import { beforeAll, describe, expect, it } from "bun:test";

import { DocumentController } from "../src/document-controller.js";
import { initSheetwrite } from "../src/grid.js";
import { SheetwriteStore } from "../src/store.js";
import type { CellScalar, CommitReason, DocumentOp, Range } from "../src/types.js";
import { makeWorkbook } from "./fixtures.js";

beforeAll(async () => {
  await initSheetwrite();
});

const address = (row: number, col = 1) => ({ sheet: "s1", row, col });
const range = (first: number, last = first, firstCol = 1, lastCol = firstCol): Range => ({
  sheet: "s1",
  start: { row: first, col: firstCol },
  end: { row: last, col: lastCol },
});
const sequence = "=SEQUENCE(3,2)";
const original: CellScalar[][] = [
  [1, 2],
  [3, 4],
  [5, 6],
  [null, null],
];
const blocked: CellScalar[][] = [
  ["#SPILL!", null],
  [99, null],
  [null, null],
  [null, null],
];
const cleared: CellScalar[][] = [
  [null, null],
  [null, null],
  [null, null],
  [null, null],
];

interface EditingCase {
  name: string;
  patches: DocumentOp[];
  expected: CellScalar[][];
  reason?: CommitReason;
  status?: "noop";
  view?: CellScalar[];
}

const cases: EditingCase[] = [
  {
    name: "typing into a spill child keeps the value and blocks the anchor",
    patches: [{ op: "set", addr: address(2), value: { kind: "literal", value: 99 } }],
    expected: blocked,
    reason: "edit-enter",
  },
  {
    name: "filling into spill children keeps all fill values",
    patches: [
      {
        op: "setRange",
        range: range(2, 3),
        cells: [
          { rowOffset: 0, colOffset: 0, value: { kind: "literal", value: 99 } },
          { rowOffset: 1, colOffset: 0, value: { kind: "literal", value: 100 } },
        ],
      },
    ],
    expected: [
      ["#SPILL!", null],
      [99, null],
      [100, null],
      [null, null],
    ],
    reason: "fill",
  },
  {
    name: "pasting into a spill child keeps the pasted value",
    patches: [
      { op: "setBlock", range: range(2), block: { rowCount: 1, colCount: 1, values: [99] } },
    ],
    expected: blocked,
    reason: "paste",
  },
  {
    name: "pasting across children and outside a spill keeps the complete block",
    patches: [
      {
        op: "setBlock",
        range: range(2, 4),
        block: { rowCount: 3, colCount: 1, values: [99, 100, 101] },
      },
    ],
    expected: [
      ["#SPILL!", null],
      [99, null],
      [100, null],
      [101, null],
    ],
    reason: "paste",
  },
  {
    name: "pasting across the anchor replaces the formula and removes former children",
    patches: [
      {
        op: "setBlock",
        range: range(1, 2),
        block: { rowCount: 2, colCount: 1, values: [99, 100] },
      },
    ],
    expected: [
      [99, null],
      [100, null],
      [null, null],
      [null, null],
    ],
    reason: "paste",
  },
  {
    name: "filling across the anchor replaces the formula and removes former children",
    patches: [
      {
        op: "setRange",
        range: range(1, 2),
        cells: [
          { rowOffset: 0, colOffset: 0, value: { kind: "literal", value: 99 } },
          { rowOffset: 1, colOffset: 0, value: { kind: "literal", value: 100 } },
        ],
      },
    ],
    expected: [
      [99, null],
      [100, null],
      [null, null],
      [null, null],
    ],
    reason: "fill",
  },
  {
    name: "deleting one projected child does not change the array",
    patches: [{ op: "clearRange", range: range(2), style: false }],
    expected: original,
    status: "noop",
  },
  {
    name: "deleting part of a spill without its anchor does not change the array",
    patches: [{ op: "clearRange", range: range(2, 3, 1, 2), style: false }],
    expected: original,
    status: "noop",
  },
  {
    name: "clearing the anchor removes all projected children",
    patches: [{ op: "clearRange", range: range(1), style: false }],
    expected: cleared,
  },
  {
    name: "selection plus Delete across a complete spill removes its anchor and children",
    patches: [{ op: "clearRange", range: range(0, 4, 0, 2), style: false }],
    expected: cleared,
  },
  {
    name: "selection plus Delete including the anchor and only some children removes the spill",
    patches: [{ op: "clearRange", range: range(1, 2), style: false }],
    expected: cleared,
  },
  {
    name: "cutting and moving the anchor respills at the destination",
    patches: [
      { op: "clearRange", range: range(1), style: false },
      { op: "set", addr: address(4), value: { kind: "formula", src: sequence } },
    ],
    expected: [
      [null, null],
      [null, null],
      [null, null],
      [1, 2],
    ],
    reason: "cut",
  },
  {
    name: "inserting a row through a spill recomputes the projection without moving children",
    patches: [{ op: "addRows", sheet: "s1", at: 2, count: 1 }],
    expected: original,
  },
  {
    name: "deleting a child row recomputes the projection",
    patches: [{ op: "removeRows", sheet: "s1", at: 2, count: 1 }],
    expected: original,
  },
  {
    name: "deleting the anchor row removes the formula and its projection",
    patches: [{ op: "removeRows", sheet: "s1", at: 1, count: 1 }],
    expected: cleared,
  },
  {
    name: "inserting a column through a spill recomputes the projection",
    patches: [
      {
        op: "addColumns",
        sheet: "s1",
        at: 2,
        columns: [{ key: "inserted", header: "Inserted", type: "number", width: 100 }],
      },
    ],
    expected: original,
  },
  {
    name: "deleting a child column leaves a boundary-blocked anchor",
    patches: [{ op: "removeColumns", sheet: "s1", at: 2, count: 1 }],
    expected: [
      ["#SPILL!", null],
      [null, null],
      [null, null],
      [null, null],
    ],
  },
  {
    name: "deleting the anchor column removes the formula and its projection",
    patches: [{ op: "removeColumns", sheet: "s1", at: 1, count: 1 }],
    expected: cleared,
  },
  {
    name: "clearing the anchor with a blank edit removes the spill",
    patches: [{ op: "set", addr: address(1), value: { kind: "literal", value: null } }],
    expected: cleared,
    reason: "edit-enter",
  },
  {
    name: "sorting orders spill rows by their displayed values without changing ownership",
    patches: [
      { op: "setSheetMeta", sheet: "s1", patch: { sortKeys: [{ col: 1, ascending: true }] } },
    ],
    expected: original,
    view: [1, 3, 5],
  },
  {
    name: "filtering a spill hides rows without changing ownership",
    patches: [
      {
        op: "setSheetMeta",
        sheet: "s1",
        patch: { filters: [[1, { kind: "values", values: [3] }]] },
      },
    ],
    expected: original,
    view: [3],
  },
];

function projection(store: SheetwriteStore): CellScalar[][] {
  const columnCount = store.getWorkbook().sheets[0]?.columns.length ?? 0;
  return [1, 2, 3, 4].map((row) =>
    [1, 2].map((col) => (col < columnCount ? store.getCell(address(row, col)).resolved : null)),
  );
}

function setup() {
  const store = new SheetwriteStore(makeWorkbook(10));
  store.applyTransaction({
    patches: [{ op: "set", addr: address(1), value: { kind: "formula", src: sequence } }],
  });
  const controller = new DocumentController({
    store,
    loadable: store,
    readOnly: () => false,
    epoch: () => 0,
    materializeVirtualColumns: (patches) => patches,
    onMutationRejected: () => {},
    onHistoryApplied: () => {},
  });
  return { store, controller };
}

describe("spill editing and command history", () => {
  for (const scenario of cases) {
    it(`${scenario.name}; undo and redo restore the same spill state`, () => {
      const { store, controller } = setup();
      try {
        const outcome = controller.commit(scenario.patches, scenario.reason ?? "api");
        expect(outcome.status).toBe(scenario.status ?? "applied");
        expect(projection(store)).toEqual(scenario.expected);
        if (scenario.view) {
          expect(
            store.getVisibleWindow("s1", { start: 0, end: scenario.view.length }, [1]).values,
          ).toEqual(scenario.view);
          expect(store.getSpillAnchor(address(2))).toEqual(address(1));
        }
        if (scenario.status === "noop") {
          expect(controller.canUndo).toBe(false);
          return;
        }
        controller.undo();
        expect(projection(store)).toEqual(original);
        expect(store.getFormula(address(1))).toBe(sequence);
        controller.redo();
        expect(projection(store)).toEqual(scenario.expected);
        if (scenario.view) {
          expect(
            store.getVisibleWindow("s1", { start: 0, end: scenario.view.length }, [1]).values,
          ).toEqual(scenario.view);
        }
      } finally {
        controller.destroy();
        store.dispose();
      }
    });
  }

  it("clearing a typed blocker respills, and undo and redo restore the obstruction", () => {
    const { store, controller } = setup();
    try {
      expect(
        controller.commit(
          [{ op: "set", addr: address(2), value: { kind: "literal", value: 99 } }],
          "edit-enter",
        ).status,
      ).toBe("applied");
      expect(projection(store)).toEqual(blocked);
      expect(
        controller.commit([{ op: "clearRange", range: range(2), style: false }], "api").status,
      ).toBe("applied");
      expect(projection(store)).toEqual(original);
      controller.undo();
      expect(projection(store)).toEqual(blocked);
      controller.redo();
      expect(projection(store)).toEqual(original);
    } finally {
      controller.destroy();
      store.dispose();
    }
  });

  it("remote spill edits and their originator's undo and redo converge without adding receiver history", () => {
    const sender = setup();
    const receiver = setup();
    const unsubscribe = sender.store.on("change", (event) => {
      expect(receiver.controller.applyRemoteOperations(event.transaction.patches).status).toBe(
        "applied",
      );
    });
    try {
      expect(
        sender.controller.commit(
          [{ op: "set", addr: address(2), value: { kind: "literal", value: 99 } }],
          "edit-enter",
        ).status,
      ).toBe("applied");
      expect(projection(receiver.store)).toEqual(blocked);
      expect(receiver.controller.canUndo).toBe(false);
      sender.controller.undo();
      expect(projection(receiver.store)).toEqual(original);
      sender.controller.redo();
      expect(projection(receiver.store)).toEqual(blocked);
      expect(receiver.controller.canUndo).toBe(false);
    } finally {
      unsubscribe();
      sender.controller.destroy();
      sender.store.dispose();
      receiver.controller.destroy();
      receiver.store.dispose();
    }
  });
});
