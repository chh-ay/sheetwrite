import { describe, expect, it } from "bun:test";
import { UndoManager } from "../src/history.js";
import type { DocumentOp } from "../src/types/document.js";

const setOperation: DocumentOp = {
  op: "set",
  addr: { sheet: "sheet", row: 0, col: 0 },
  value: { kind: "literal", value: "next" },
};

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
});
