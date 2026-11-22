import { beforeAll, describe, expect, it } from "bun:test";

import { initSheetwrite } from "../src/grid.js";
import { encodeRestoreBlock } from "../src/restore-block.js";
import { SheetwriteStore } from "../src/store.js";
import type { ChangeEvent, DocumentOp, PackedCellBlock } from "../src/types.js";
import { makeWorkbook } from "./fixtures.js";

beforeAll(async () => {
  await initSheetwrite();
});

function run_facade_contract(restore_block: boolean): void {
  const workbook = makeWorkbook(4);
  workbook.sheets[0]!.protectedRanges = [
    {
      id: "locked-tail",
      range: { sheet: "s1", start: { row: 3, col: 0 }, end: { row: 3, col: 2 } },
    },
  ];
  const store = new SheetwriteStore(workbook, undefined, {
    storage: "paged",
    chunkRows: 4,
    cacheBytes: 1_000_000,
  });
  expect(store.queryCapability("s1").status).toBe("incomplete");
  store.loadPage(
    "s1",
    0,
    [{ start: 0, end: 3, keys: ["name", "amount", "city"] }],
    Array.from({ length: 4 }, () => ({ name: null, amount: 0, city: null })),
  );
  expect(store.queryCapability("s1")).toEqual({ status: "complete" });

  const range = { sheet: "s1", start: { row: 1, col: 0 }, end: { row: 1, col: 1 } };
  const block_range = { sheet: "s1", start: { row: 2, col: 0 }, end: { row: 2, col: 2 } };
  const block: PackedCellBlock = {
    rowCount: 1,
    colCount: 3,
    values: [4, null, null],
    formulas: [[1, "=A3*2"]],
    refs: [[2, { sheet: "s1", row: 2, col: 1 }]],
    styleTable: [{ bold: true }],
    styleIds: [0, 0, 0],
  };
  const patches: DocumentOp[] = [
    {
      op: "set",
      addr: { sheet: "s1", row: 0, col: 0 },
      value: { kind: "literal", value: 2 },
      style: { bold: true },
    },
    {
      op: "setRange",
      range,
      cells: [
        { rowOffset: 0, colOffset: 0, value: { kind: "literal", value: 3 } },
        { rowOffset: 0, colOffset: 1, value: { kind: "literal", value: "range" } },
      ],
    },
    restore_block
      ? encodeRestoreBlock(block_range, block)
      : { op: "setBlock", range: block_range, block },
    {
      op: "setRangeStyle",
      range: { sheet: "s1", start: { row: 0, col: 0 }, end: { row: 2, col: 2 } },
      style: { italic: true },
    },
  ];
  const transaction = { epoch: 0, patches };
  const events: ChangeEvent[] = [];
  store.on("change", (event) => events.push(event));

  const applied = store.applyTransaction(transaction);
  expect(applied).toMatchObject({ status: "applied", epoch: 1 });
  const applied_patches = applied.status === "applied" ? applied.transaction.patches : [];
  expect(events).toHaveLength(1);
  expect(events[0]?.transaction.patches).toBe(applied_patches);
  if (restore_block) {
    // Without a setBlock, the caller's operations are applied and emitted as they are.
    expect(applied_patches).toBe(patches);
  } else {
    // The setBlock's cell arrays were read once into a copy: that copy is what
    // is stored and emitted, and the caller's array no longer reaches the store.
    expect(applied_patches).not.toBe(patches);
    applied_patches.forEach((operation, index) => {
      if (operation.op !== "setBlock") expect(patches[index]).toBe(operation);
    });
    const emitted_block = applied_patches.find((operation) => operation.op === "setBlock");
    if (emitted_block?.op !== "setBlock") throw new Error("expected the copied setBlock");
    expect(emitted_block.block.values).toEqual([4, null, null]);
    expect(emitted_block.block.values).not.toBe(block.values);
    block.values[0] = 99;
    expect(emitted_block.block.values[0]).toBe(4);
    expect(store.getCell({ sheet: "s1", row: 2, col: 0 }).resolved).toBe(4);
  }
  expect(store.getCell({ sheet: "s1", row: 2, col: 1 }).resolved).toBe(8);
  expect(store.getCell({ sheet: "s1", row: 2, col: 2 }).resolved).toBe(8);
  expect(store.getFormula({ sheet: "s1", row: 2, col: 1 })).toBe("=A3*2");
  expect(store.getRefTarget({ sheet: "s1", row: 2, col: 2 })).toEqual({
    sheet: "s1",
    row: 2,
    col: 1,
  });
  expect(store.getCell({ sheet: "s1", row: 0, col: 0 }).style).toMatchObject({
    bold: true,
    italic: true,
  });
  expect(store.getCell({ sheet: "s1", row: 2, col: 0 }).style).toMatchObject({
    bold: true,
    italic: true,
  });

  // A denied edit and an empty transaction reach no listener.
  const before_rejected = events.length;
  expect(
    store.applyTransaction({
      patches: [
        {
          op: "set",
          addr: { sheet: "s1", row: 3, col: 0 },
          value: { kind: "literal", value: "denied" },
        },
      ],
    }),
  ).toMatchObject({ status: "rejected" });
  expect(store.applyTransaction({ patches: [] })).toMatchObject({ status: "noop" });
  expect(events).toHaveLength(before_rejected);

  const snapshot = store.exportSnapshot();
  const restored = SheetwriteStore.fromSnapshot(JSON.parse(JSON.stringify(snapshot)));
  expect(restored.exportSnapshot()).toEqual(snapshot);
  restored.dispose();

  expect(store.getPagedStats("s1").dirtyCells).toBeGreaterThan(0);
  store.acknowledgeOperations(patches);
  expect(store.getPagedStats("s1").dirtyCells).toBe(0);
  store.dispose();
}

describe("SheetwriteStore facade contract", () => {
  it("applies a copied setBlock to paged cells and acknowledges them", () => {
    run_facade_contract(false);
  });

  it("preserves compressed restore payloads while applying and acknowledging paged cells", () => {
    run_facade_contract(true);
  });
});
