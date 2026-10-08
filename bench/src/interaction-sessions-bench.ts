import "./dom-setup.js";
import { createGrid, DEFAULT_THEME, initSheetwrite, type Workbook } from "@sheetwrite/core";
import { installCanvasTestStubs } from "@sheetwrite/core/testing";

const ROWS = 100;
const ITERATIONS = 100;
const SAMPLES = 9;
const DRAG_STEPS = 20;
await initSheetwrite();
const restoreCanvas = installCanvasTestStubs();
const workbook: Workbook = {
  activeSheet: "s1",
  sheets: [
    {
      id: "s1",
      name: "Timing",
      rowCount: ROWS,
      columns: [
        { key: "name", header: "Name", type: "text", width: 160 },
        { key: "amount", header: "Amount", type: "number", width: 120 },
      ],
    },
  ],
};
const host = document.createElement("div");
Object.defineProperties(host, { clientWidth: { value: 800 }, clientHeight: { value: 400 } });
document.body.appendChild(host);
const grid = createGrid(host, {
  workbook,
  data: {
    rowCount: ROWS,
    columns: {
      name: Array.from({ length: ROWS }, (_, row) => `Row ${row}`),
      amount: Float64Array.from({ length: ROWS }, (_, row) => row),
    },
  },
  config: { toolbar: false, tabs: false, find: false, contextMenu: false },
});
const scroller = host.querySelector(".sheetwrite-scroller");
if (!(scroller instanceof HTMLElement)) throw new Error("Timing grid scroller missing");
const pointer = (type: string, x: number, y: number) =>
  scroller.dispatchEvent(
    new PointerEvent(type, { clientX: x, clientY: y, pointerId: 1, button: 0, bubbles: true }),
  );
const samples: Record<string, number[]> = {};
try {
  for (const workload of [
    "column-resize",
    "row-resize",
    "edit",
    "selection",
    "get-cell",
    "aggregate",
  ] as const) {
    const timings: number[] = [];
    for (let sample = -1; sample < SAMPLES; sample++) {
      let elapsed = 0;
      for (let iteration = 0; iteration < ITERATIONS; iteration++) {
        const started = performance.now();
        if (workload === "column-resize" || workload === "row-resize") {
          const isColumn = workload === "column-resize";
          const x = isColumn ? DEFAULT_THEME.rowHeaderWidth + 160 : 10;
          const y = isColumn ? 10 : DEFAULT_THEME.headerHeight + DEFAULT_THEME.rowHeight;
          pointer("pointerdown", x, y);
          for (let step = 1; step <= DRAG_STEPS; step++)
            pointer("pointermove", x + (isColumn ? step : 0), y + (isColumn ? 0 : step));
          pointer("pointerup", x + (isColumn ? DRAG_STEPS : 0), y + (isColumn ? 0 : DRAG_STEPS));
        } else if (workload === "edit") {
          grid.beginEdit(0, 0, "Timing edit");
          const editor = host.querySelector("textarea.sheetwrite-editor");
          if (!(editor instanceof HTMLTextAreaElement)) throw new Error("Timing editor missing");
          editor.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        } else if (workload === "selection") {
          pointer(
            "pointerdown",
            DEFAULT_THEME.rowHeaderWidth + 40,
            DEFAULT_THEME.headerHeight + 10,
          );
          pointer(
            "pointermove",
            DEFAULT_THEME.rowHeaderWidth + 200,
            DEFAULT_THEME.headerHeight + 60,
          );
          pointer("pointerup", DEFAULT_THEME.rowHeaderWidth + 200, DEFAULT_THEME.headerHeight + 60);
        } else if (workload === "get-cell") {
          for (let row = 0; row < ROWS; row++) grid.getCellInput(row, 1);
        } else {
          grid.aggregate(1, "sum");
        }
        elapsed += performance.now() - started;
        // Reset outside timing: baseline row drags have multiple history entries
        // and baseline column undo does not restore its pre-preview width.
        if (workload === "column-resize") grid.setColumnWidth(0, 160);
        else if (workload === "row-resize") grid.setRowHeight(0, DEFAULT_THEME.rowHeight);
        else if (workload === "edit") grid.undo();
      }
      if (sample >= 0) timings.push(elapsed / ITERATIONS);
    }
    samples[workload] = timings;
  }
  process.stdout.write(`${JSON.stringify({ unit: "ms/operation", samples })}\n`);
} finally {
  grid.destroy();
  host.remove();
  restoreCanvas();
}
