import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";

import { createGridController, type GridControllerHandlers } from "../src/grid-controller.js";
import { initSheetwrite } from "../src/grid.js";
import { installCanvasTestStubs } from "../src/testing.js";
import type { Column, GridEvents, Workbook } from "../src/types.js";

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

/** A grid wide enough for the 4,096-cell selection a command-state snapshot is bounded to. */
function wideWorkbook(rowCount: number, columnCount: number): Workbook {
  return {
    activeSheet: "s1",
    sheets: [
      {
        id: "s1",
        name: "Sheet 1",
        rowCount,
        columns: Array.from({ length: columnCount }, (_, index): Column => ({
          key: `c${index}`,
          header: `Column ${index + 1}`,
          width: 120,
          type: "number",
        })),
      },
    ],
  };
}

describe("createGridController command-state subscriptions", () => {
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
