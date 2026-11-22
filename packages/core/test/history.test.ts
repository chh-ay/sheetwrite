import { describe, expect, it } from "bun:test";

import { measureOperationBytes } from "../src/atomic-batch.js";
import { validateTransactionResources } from "../src/document-protocol.js";
import { type HistoryAction, UndoManager } from "../src/history.js";
import { encodeRestoreBlock } from "../src/restore-block.js";
import { preparedRestore, TransactionPreparation } from "../src/transaction-preparation.js";
import type { DocumentOp } from "../src/types/document.js";

const set_operation: DocumentOp = {
  op: "set",
  addr: { sheet: "sheet", row: 0, col: 0 },
  value: { kind: "literal", value: "next" },
};

function snapshot_action(byte_length: number, on_dispose: () => void): HistoryAction {
  return [
    {
      kind: "rangeSnapshot",
      range: { sheet: "sheet", start: { row: 0, col: 0 }, end: { row: 0, col: 0 } },
      byteLength: byte_length,
      toPatch: (range) => ({
        op: "setBlock",
        range,
        block: { rowCount: 1, colCount: 1, values: ["before"] },
      }),
      dispose: on_dispose,
    },
  ];
}

describe("UndoManager rejection recovery", () => {
  it("disposes retained range snapshots when history is cleared", () => {
    let disposals = 0;
    const history = new UndoManager();
    history.push(
      snapshot_action(13, () => (disposals += 1)),
      [set_operation],
      "Typing",
    );
    expect(history.getResourceStats()).toEqual({
      undoEntries: 1,
      redoEntries: 0,
      retainedSnapshots: 1,
      retainedSnapshotBytes: 13,
    });
    history.clear();
    expect(disposals).toBe(1);
    expect(history.getResourceStats()).toEqual({
      undoEntries: 0,
      redoEntries: 0,
      retainedSnapshots: 0,
      retainedSnapshotBytes: 0,
    });
  });

  it("drops the oldest snapshots once retained bytes pass the budget, keeping the newest", () => {
    // About the 13 MB a 1M-cell clear snapshot retains.
    const million_cell_snapshot_bytes = 13_000_000;
    const history_budget_bytes = 256 * 1024 * 1024;
    const edits = 30;
    let disposals = 0;
    const history = new UndoManager();
    for (let edit = 0; edit < edits; edit++) {
      history.push(
        snapshot_action(million_cell_snapshot_bytes, () => (disposals += 1)),
        [set_operation],
        "Typing",
      );
    }
    const kept = Math.floor(history_budget_bytes / million_cell_snapshot_bytes);
    expect(history.getResourceStats()).toEqual({
      undoEntries: kept,
      redoEntries: 0,
      retainedSnapshots: kept,
      retainedSnapshotBytes: kept * million_cell_snapshot_bytes,
    });
    expect(disposals).toBe(edits - kept);

    // A single restore larger than the whole budget stays undoable.
    history.push(
      snapshot_action(history_budget_bytes * 2, () => (disposals += 1)),
      [set_operation],
      "Typing",
    );
    expect(history.getResourceStats().undoEntries).toBe(1);
    expect(disposals).toBe(edits);
  });
});

describe("history restore measurement", () => {
  it("reports the exact JSON size that a full walk measures for every scalar kind", () => {
    const integers = [0, 7, -42, 123_456, -(2 ** 53), 2 ** 53, 1e20, 1e21, -1e21, 1e300, 0.1];
    const mixed: DocumentOp = {
      op: "setBlock",
      range: { sheet: "sheet", start: { row: 0, col: 0 }, end: { row: 1, col: 3 } },
      block: {
        rowCount: 2,
        colCount: 4,
        values: [1.5, -0, 'quote " — 😀', 'quote " — 😀', true, false, null, 1e-7],
        formulas: [[1, "=SUM(A1:B2)"]],
        refs: [[2, { sheet: "sheet", row: 0, col: 0 }]],
        styleTable: [{}, { bold: true }],
        styleIds: [0, 1, 1, 0, 0, 0, 1, 1],
      },
    };
    const scalars: DocumentOp = {
      op: "setBlock",
      range: {
        sheet: "sheet",
        start: { row: 0, col: 0 },
        end: { row: 0, col: integers.length - 1 },
      },
      block: { rowCount: 1, colCount: integers.length, values: integers },
    };
    for (const operation of [mixed, scalars]) {
      const exact = validateTransactionResources([operation]);
      if (!exact.ok) throw new Error("Expected a measurable operation");
      const preparation = new TransactionPreparation();
      try {
        preparation.seedHistory(operation, () => true);
        expect(preparation.measure([operation])).toBe(exact.encodedBytes);
        expect(measureOperationBytes([operation], Number.MAX_SAFE_INTEGER)).toEqual(
          measureOperationBytes([structuredClone(operation)], Number.MAX_SAFE_INTEGER),
        );
      } finally {
        preparation.dispose();
      }
    }
  });

  it("leaves non-finite numbers to the validating walk", () => {
    const operation: DocumentOp = {
      op: "setBlock",
      range: { sheet: "sheet", start: { row: 0, col: 0 }, end: { row: 0, col: 0 } },
      block: { rowCount: 1, colCount: 1, values: [Number.NaN] },
    };
    const preparation = new TransactionPreparation();
    try {
      preparation.seedHistory(operation, () => true);
      expect(() => preparation.measure([operation])).toThrow("finite");
    } finally {
      preparation.dispose();
    }
  });

  it("checks the shape of a seeded history restore once, and of any other restore every time", () => {
    const range = { sheet: "sheet", start: { row: 0, col: 0 }, end: { row: 0, col: 1 } };
    const block = { rowCount: 1, colCount: 2, values: [1, "text"] };
    let checks = 0;
    const counting_check = (): readonly never[] => {
      checks++;
      return [];
    };

    const seeded = encodeRestoreBlock(range, block);
    const preparation = new TransactionPreparation();
    try {
      preparation.seed(seeded, block);
      expect(preparedRestore(seeded, counting_check).errors).toEqual([]);
      expect(checks).toBe(0);
    } finally {
      preparation.dispose();
    }

    expect(preparedRestore(seeded, counting_check).errors).toEqual([]);
    expect(checks).toBe(1);
    expect(preparedRestore(encodeRestoreBlock(range, block), counting_check).errors).toEqual([]);
    expect(checks).toBe(2);
  });
});
