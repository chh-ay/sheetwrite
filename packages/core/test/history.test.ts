import { describe, expect, it } from "bun:test";

import { type HistoryAction, UndoManager } from "../src/history.js";
import type { DocumentOp } from "../src/types/document.js";

const setOperation: DocumentOp = {
  op: "set",
  addr: { sheet: "sheet", row: 0, col: 0 },
  value: { kind: "literal", value: "next" },
};

function snapshotAction(byteLength: number, onDispose: () => void): HistoryAction {
  return [
    {
      kind: "rangeSnapshot",
      range: { sheet: "sheet", start: { row: 0, col: 0 }, end: { row: 0, col: 0 } },
      byteLength,
      toPatch: (range) => ({
        op: "setBlock",
        range,
        block: { rowCount: 1, colCount: 1, values: ["before"] },
      }),
      dispose: onDispose,
    },
  ];
}

describe("UndoManager rejection recovery", () => {
  it("disposes retained range snapshots when history is cleared", () => {
    let disposals = 0;
    const history = new UndoManager();
    history.push(
      [
        {
          kind: "rangeSnapshot",
          range: {
            sheet: "sheet",
            start: { row: 0, col: 0 },
            end: { row: 0, col: 0 },
          },
          byteLength: 13,
          toPatch: (range) => ({
            op: "setBlock",
            range,
            block: { rowCount: 1, colCount: 1, values: ["before"] },
          }),
          dispose: () => {
            disposals += 1;
          },
        },
      ],
      [setOperation],
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
    const millionCellSnapshotBytes = 13_000_000;
    const historyBudgetBytes = 256 * 1024 * 1024;
    const edits = 30;
    let disposals = 0;
    const history = new UndoManager();
    for (let edit = 0; edit < edits; edit++) {
      history.push(
        snapshotAction(millionCellSnapshotBytes, () => (disposals += 1)),
        [setOperation],
      );
    }
    const kept = Math.floor(historyBudgetBytes / millionCellSnapshotBytes);
    expect(history.getResourceStats()).toEqual({
      undoEntries: kept,
      redoEntries: 0,
      retainedSnapshots: kept,
      retainedSnapshotBytes: kept * millionCellSnapshotBytes,
    });
    expect(disposals).toBe(edits - kept);

    // A single restore larger than the whole budget stays undoable.
    history.push(
      snapshotAction(historyBudgetBytes * 2, () => (disposals += 1)),
      [setOperation],
    );
    expect(history.getResourceStats().undoEntries).toBe(1);
    expect(disposals).toBe(edits);
  });
});
