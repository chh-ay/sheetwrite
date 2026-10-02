import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { initSheetwrite } from "../src/grid.js";
import { createGridController, type GridControllerHandlers } from "../src/grid-controller.js";
import { installCanvasTestStubs } from "../src/testing.js";
import type { Column, GridEvents, Selection, Workbook } from "../src/types.js";
import { makeColumnarData, makeWorkbook } from "./fixtures.js";

let restoreStubs: () => void;

beforeAll(async () => {
  await initSheetwrite();
});

beforeEach(() => {
  restoreStubs = installCanvasTestStubs();
});

afterEach(() => {
  restoreStubs();
});

function mountHost(): HTMLDivElement {
  const host = document.createElement("div");
  Object.defineProperty(host, "clientWidth", { value: 800, configurable: true });
  Object.defineProperty(host, "clientHeight", { value: 400, configurable: true });
  document.body.appendChild(host);
  return host;
}

function multiSheetWorkbook(): Workbook {
  const base = makeWorkbook(10);
  base.sheets.push({
    id: "sheet2",
    name: "Summary",
    rowCount: 5,
    columns: [{ key: "note", header: "Note", width: 200, type: "text" }],
  });
  return base;
}

describe("createGridController active-sheet forwarding", () => {
  it("forwards active-sheet with the sheet id payload", () => {
    const host = mountHost();
    const seen: Array<GridEvents["active-sheet"]> = [];

    const controller = createGridController(
      host,
      { workbook: multiSheetWorkbook(), data: makeColumnarData(10) },
      { onActiveSheetChange: (event) => seen.push(event) },
    );

    controller.grid.setActiveSheet("sheet2");
    expect(seen).toEqual([{ sheet: "sheet2" }]);

    controller.destroy();
  });

  it("stops forwarding handlers and removes mounted DOM when destroyed", () => {
    const host = mountHost();
    const activeSheets: string[] = [];
    const selections: string[] = [];
    const controller = createGridController(
      host,
      { workbook: multiSheetWorkbook(), data: makeColumnarData(10) },
      {
        onActiveSheetChange: (event) => activeSheets.push(event.sheet),
        onSelectionChange: (selection) => selections.push(selection?.kind ?? "none"),
      },
    );

    controller.grid.setActiveSheet("sheet2");
    controller.grid.setSelection({
      kind: "cell",
      addr: { sheet: "sheet2", row: 1, col: 0 },
    });
    expect(activeSheets).toEqual(["sheet2"]);
    expect(selections.at(-1)).toBe("cell");
    const forwardedSelections = [...selections];
    expect(host.childElementCount).toBeGreaterThan(0);

    controller.destroy();
    expect(host.childElementCount).toBe(0);

    controller.grid.setActiveSheet("s1");
    controller.grid.setSelection({
      kind: "cell",
      addr: { sheet: "s1", row: 0, col: 0 },
    });
    expect(activeSheets).toEqual(["sheet2"]);
    expect(selections).toEqual(forwardedSelections);

    // Teardown remains safe for framework cleanup paths that may run twice.
    controller.destroy();
    expect(host.childElementCount).toBe(0);
  });
});

/** A grid wide enough for the 4,096-cell selection a command-state snapshot is bounded to. */
function wideWorkbook(rowCount: number, columnCount: number): Workbook {
  return {
    activeSheet: "s1",
    sheets: [
      {
        id: "s1",
        name: "Sheet 1",
        rowCount,
        columns: Array.from(
          { length: columnCount },
          (_, index): Column => ({
            key: `c${index}`,
            header: `Column ${index + 1}`,
            width: 120,
            type: "number",
          }),
        ),
      },
    ],
  };
}

describe("createGridController command-state subscriptions", () => {
  it("reads selected cells only while a command-state handler is attached", () => {
    const host = mountHost();
    const handlers: GridControllerHandlers = {};
    const controller = createGridController(host, { workbook: wideWorkbook(128, 64) }, handlers);
    const store = controller.grid.store;
    const readCell = store.getCell.bind(store);
    let cellReads = 0;
    store.getCell = (addr) => {
      cellReads += 1;
      return readCell(addr);
    };
    const selectRows = (startRow: number): void => {
      const selection: Selection = {
        kind: "range",
        range: {
          sheet: "s1",
          start: { row: startRow, col: 0 },
          end: { row: startRow + 63, col: 63 },
        },
      };
      controller.grid.setSelection(selection);
    };

    selectRows(0);
    expect(cellReads).toBe(0);

    const events: Array<GridEvents["command-state-change"]> = [];
    handlers.onCommandStateChange = (event) => events.push(event);
    selectRows(64);
    expect(cellReads).toBeGreaterThan(0);
    const readsWithHandler = cellReads;
    expect(events).toHaveLength(1);
    expect(events[0]?.states.undo.disabled).toBe(true);

    handlers.onCommandStateChange = undefined;
    selectRows(0);
    expect(cellReads).toBe(readsWithHandler);
    expect(events).toHaveLength(1);

    controller.destroy();
  });

  it("picks up a live handler before a direct grid emission", async () => {
    const host = mountHost();
    const handlers: GridControllerHandlers = {};
    const controller = createGridController(host, { workbook: wideWorkbook(4, 2) }, handlers);
    const events: Array<GridEvents["command-state-change"]> = [];

    controller.grid.setReadOnly(true);
    expect(events).toHaveLength(0);

    handlers.onCommandStateChange = (event) => events.push(event);
    // An empty-history undo queues an emission without any store change first.
    controller.grid.undo();
    // The grid queues that emission on the microtask queue; one turn flushes it.
    await Promise.resolve();
    expect(events).toHaveLength(1);

    controller.grid.setReadOnly(false);
    expect(events).toHaveLength(2);

    controller.destroy();
  });
});
