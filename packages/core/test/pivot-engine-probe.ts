// Engine providers are selected once per process; this probe owns the full provider.
import assert from "node:assert/strict";

import * as formulas from "@sheetwrite/formulas";

import {
  createGrid,
  initSheetwrite,
  releaseEngineMemory,
  SheetwriteStore,
  validateWorkbookSnapshot,
} from "../src/index.js";
import type { DocumentOp, PivotDefinition } from "../src/index.js";
import { installCanvasTestStubs } from "../src/testing.js";

await initSheetwrite(undefined, formulas);
const restore = installCanvasTestStubs();
const host = document.createElement("div");
document.body.appendChild(host);
const pivot: PivotDefinition = {
  id: "sales",
  name: "Sales",
  source: { range: { sheet: "data", start: { row: 0, col: 0 }, end: { row: 3, col: 1 } } },
  anchor: { row: 2, col: 1 },
  rows: [0],
  columns: [],
  values: [{ field: 1, aggregation: "SUM" }],
  rowTotals: true,
  columnTotals: false,
};
const columns = Array.from({ length: 8 }, (_, index) => ({
  key: `c${index}`,
  header: `C${index}`,
  width: 80,
  type: "text" as const,
}));
const grid = createGrid(host, {
  workbook: {
    activeSheet: "report",
    sheets: [
      { id: "report", name: "Report", rowCount: 20, columns, pivots: [pivot] },
      { id: "data", name: "Data", rowCount: 10, columns },
    ],
  },
});
try {
  const data = [
    ["Region", "Amount"],
    ["East", 10],
    ["West", 20],
    ["East", 5],
  ];
  assert.equal(
    grid.applyTransaction({
      patches: data.flatMap((row, r) =>
        row.map((value, col): DocumentOp => ({
          op: "set",
          addr: { sheet: "data", row: r, col },
          value: { kind: "literal", value },
        })),
      ),
    }).status,
    "applied",
  );
  const before = grid.getPivotResult("report", "sales");
  assert.equal(before?.status, "ok");
  assert.ok(
    before && before.cells.includes(15) && before.cells.includes(20) && before.cells.includes(35),
    "bulk result includes group sums and bottom total",
  );
  assert.deepEqual(grid.getPivotFields("report", "sales"), [
    { index: 0, header: "Region", type: "text" },
    { index: 1, header: "Amount", type: "number" },
  ]);
  const savedPivot = { ...pivot, savedOutput: { rows: 1, cols: 1, cells: [999] } };
  const savedStore = new SheetwriteStore({
    activeSheet: "report",
    sheets: [
      { id: "report", name: "Report", rowCount: 20, columns, pivots: [savedPivot] },
      { id: "data", name: "Data", rowCount: 10, columns },
    ],
  });
  try {
    assert.equal(savedStore.getPivotResult("report", "sales")?.status, "ok");
    assert.ok(!savedStore.getPivotResult("report", "sales")?.cells.includes(999));
    assert.deepEqual(savedStore.getPivots()[0]?.savedOutput, savedPivot.savedOutput);
  } finally {
    savedStore.dispose();
  }
  for (const operation of [
    { op: "removeRows", sheet: "report", at: 1, count: 3 },
    { op: "removeColumns", sheet: "report", at: 0, count: 2 },
  ] satisfies DocumentOp[]) {
    assert.equal(grid.applyTransaction({ patches: [operation] }).status, "applied");
    assert.equal(grid.getPivots().length, 1);
    assert.equal(grid.getPivotResult("report", "sales")?.status, "ok");
    grid.undo();
    assert.deepEqual(grid.getPivots(), [pivot], "undo restores exact definition");
    assert.deepEqual(
      grid.getPivotResult("report", "sales"),
      before,
      "undo restores exact engine output",
    );
  }
  for (const operation of [
    { op: "moveRows", sheet: "report", from: 2, count: 4, to: 8 },
    { op: "moveColumns", sheet: "report", from: 1, count: 2, to: 4 },
  ] satisfies DocumentOp[]) {
    assert.equal(grid.applyTransaction({ patches: [operation] }).status, "applied");
    assert.equal(
      grid.getPivotResult("report", "sales")?.status,
      "ok",
      "moving output must not persist derived cells",
    );
    grid.undo();
    assert.deepEqual(grid.getPivots(), [pivot]);
    assert.deepEqual(grid.getPivotResult("report", "sales"), before);
  }
  assert.equal(
    grid.applyTransaction({ patches: [{ op: "addRows", sheet: "data", at: 2, count: 1 }] }).status,
    "applied",
  );
  assert.deepEqual(
    grid.getPivotResult("report", "sales")?.cells,
    ["Region", "Sum of Amount", null, 0, "East", 15, "West", 20, "Total", 35],
    "inserted blank rows form a blank group without changing existing aggregates",
  );
  grid.undo();
  assert.deepEqual(grid.getPivots(), [pivot]);
  assert.deepEqual(grid.getPivotResult("report", "sales"), before);
  assert.equal(
    grid.applyTransaction({ patches: [{ op: "removeRows", sheet: "data", at: 1, count: 1 }] })
      .status,
    "applied",
  );
  const deleted = grid.getPivotResult("report", "sales");
  assert.equal(deleted?.status, "ok");
  assert.ok(
    deleted && deleted.cells.includes(5) && deleted.cells.includes(25),
    "source deletion removes its contribution",
  );
  grid.undo();
  assert.deepEqual(grid.getPivots(), [pivot]);
  assert.deepEqual(grid.getPivotResult("report", "sales"), before);
  const write = grid.applyTransaction({
    patches: [
      {
        op: "set",
        addr: { sheet: "report", row: 3, col: 2 },
        value: { kind: "literal", value: 999 },
      },
    ],
  });
  assert.equal(write.status, "rejected", "local output writes must be refused");
  assert.deepEqual(grid.getPivotResult("report", "sales"), before);
  const blocker: DocumentOp = {
    op: "set",
    addr: { sheet: "report", row: 3, col: 2 },
    value: { kind: "literal", value: 999 },
  };
  assert.equal(grid.applyRemoteOperations([blocker]).status, "applied");
  assert.equal(grid.getPivotResult("report", "sales")?.error, "#SPILL!");
  assert.equal(
    grid.applyTransaction({
      patches: [
        {
          op: "clearRange",
          range: { sheet: "report", start: { row: 3, col: 2 }, end: { row: 3, col: 2 } },
        },
      ],
    }).status,
    "applied",
  );
  assert.deepEqual(grid.getPivotResult("report", "sales"), before);
  grid.undo();
  assert.equal(
    grid.getPivotResult("report", "sales")?.error,
    "#SPILL!",
    "undo may restore an output blocker",
  );
  grid.redo();
  assert.deepEqual(grid.getPivotResult("report", "sales"), before);
  await releaseEngineMemory();
  assert.deepEqual(grid.getPivots(), [pivot]);
  assert.deepEqual(
    grid.getPivotResult("report", "sales"),
    before,
    "transfer rebuilds exact output",
  );
  assert.equal(grid.removePivot("sales").status, "applied");
  assert.equal(grid.getPivotResult("report", "sales"), null);
  grid.undo();
  assert.deepEqual(grid.getPivotResult("report", "sales"), before);
  const second = { ...pivot, id: "second", anchor: { row: 8, col: 1 } };
  assert.equal(grid.setPivot(second).status, "applied");
  assert.equal(
    grid.applyTransaction({
      patches: [{ op: "removeRows", sheet: "report", at: 2, count: 7 }],
    }).status,
    "applied",
  );
  assert.deepEqual(
    grid.getPivots().map((definition) => definition.anchor),
    [
      { row: 2, col: 1 },
      { row: 2, col: 1 },
    ],
  );
  for (const id of ["sales", "second"]) {
    assert.equal(
      grid.getPivotResult("report", id)?.error,
      "#SPILL!",
      "all colliding anchors must report the collision",
    );
  }
  const collided = grid.exportSnapshot();
  assert.equal(validateWorkbookSnapshot(collided).ok, true);
  const restored = SheetwriteStore.fromSnapshot(collided);
  try {
    assert.deepEqual(restored.getPivots(), grid.getPivots());
    for (const id of ["sales", "second"])
      assert.equal(restored.getPivotResult("report", id)?.error, "#SPILL!");
  } finally {
    restored.dispose();
  }
  grid.undo();
  assert.deepEqual(grid.getPivots(), [pivot, second]);
  assert.deepEqual(grid.getPivotResult("report", "sales"), before);
  assert.equal(grid.getPivotResult("report", "second")?.status, "ok");
  assert.equal(
    grid.setPivot({ ...pivot, source: { ...pivot.source, invalid: true } }).status,
    "applied",
  );
  assert.equal(grid.getPivotResult("report", "sales")?.error, "#REF!");
  assert.equal(
    grid.applyTransaction({
      patches: [
        {
          op: "set",
          addr: { sheet: "report", ...pivot.anchor },
          value: { kind: "literal", value: 123 },
        },
      ],
    }).status,
    "rejected",
    "an error anchor is still derived output",
  );
  assert.equal(
    grid.applyTransaction({
      patches: [
        {
          op: "moveRows",
          sheet: "report",
          from: 2,
          count: 1,
          to: 12,
        },
      ],
    }).status,
    "applied",
  );
  assert.deepEqual(
    grid.exportSnapshot().sheets.find((sheet) => sheet.id === "report")?.cells,
    [],
    "moving an error anchor does not persist its rendered error",
  );

  // An anchor on user data shows #SPILL! but the data stays user-owned.
  const literalAnchor = { sheet: "report", row: 15, col: 4 };
  assert.equal(
    grid.applyTransaction({
      patches: [{ op: "set", addr: literalAnchor, value: { kind: "literal", value: 7 } }],
    }).status,
    "applied",
  );
  const third = { ...pivot, id: "third", anchor: { row: 15, col: 4 } };
  assert.equal(grid.setPivot(third).status, "applied");
  assert.equal(grid.getPivotResult("report", "third")?.error, "#SPILL!");
  assert.equal(
    grid.applyTransaction({
      patches: [{ op: "moveRows", sheet: "report", from: 15, count: 1, to: 16 }],
    }).status,
    "applied",
  );
  const movedAnchor = { ...literalAnchor, row: 16 };
  assert.equal(
    grid.store.getCell(movedAnchor).resolved,
    7,
    "moving a blocked anchor keeps its user value",
  );
  assert.equal(
    grid.applyTransaction({
      patches: [
        { op: "clearRange", range: { sheet: "report", start: movedAnchor, end: movedAnchor } },
      ],
    }).status,
    "applied",
    "the user can clear a value that blocks a pivot anchor",
  );
  assert.equal(grid.getPivotResult("report", "third")?.status, "ok");
} finally {
  grid.destroy();
  host.remove();
  restore();
}
