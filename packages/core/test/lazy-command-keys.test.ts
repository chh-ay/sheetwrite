import { afterEach, beforeAll, beforeEach, expect, it } from "bun:test";

import { GridImpl, initSheetwrite } from "../src/grid.js";
import { SheetwriteStore } from "../src/store.js";
import { installCanvasTestStubs } from "../src/testing.js";

// Keys pressed while a command's code loads on first use act after the
// command, where it left the focus. The AutoFilter's case is in
// autofilter-ui.test.ts; here the find bar takes the focus.

let restoreStubs: () => void;
const disposers: (() => void)[] = [];

beforeAll(async () => {
  await initSheetwrite();
});

beforeEach(() => {
  restoreStubs = installCanvasTestStubs();
});

afterEach(() => {
  for (const dispose of disposers.splice(0).reverse()) dispose();
  restoreStubs();
  document.body.replaceChildren();
});

it("types the keys pressed while the find bar loads into its field", async () => {
  const store = SheetwriteStore.fromSnapshot({
    schemaVersion: 1,
    workbook: { activeSheet: "s1" },
    sheets: [
      {
        id: "s1",
        name: "Sheet1",
        order: 0,
        rowCount: 5,
        columns: [{ key: "a", header: "A", width: 100, type: "text" }],
        cells: [
          {
            startRow: 0,
            startCol: 0,
            rowCount: 1,
            colCount: 1,
            cells: [{ rowOffset: 0, colOffset: 0, value: { kind: "literal", value: "apple" } }],
          },
        ],
      },
    ],
  });
  const host = document.createElement("div");
  Object.defineProperty(host, "clientWidth", { value: 640, configurable: true });
  Object.defineProperty(host, "clientHeight", { value: 320, configurable: true });
  document.body.appendChild(host);
  const grid = new GridImpl(host, { workbook: store.getWorkbook() }, store);
  disposers.push(
    () => store.dispose(),
    () => grid.destroy(),
  );
  grid.setSelection({ kind: "cell", addr: { sheet: "s1", row: 0, col: 0 } });

  // Ctrl+F, then "a" and "p" before the find bar's chunk has loaded.
  for (const init of [{ key: "f", ctrlKey: true }, { key: "a" }, { key: "p" }]) {
    host.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));
  }
  let input: HTMLInputElement | null = null;
  for (let tick = 0; tick < 10 && !input?.value; tick++) {
    await import("../src/find-bar.js");
    await Promise.resolve();
    input = host.querySelector<HTMLInputElement>(".sheetwrite-find-input");
  }

  expect(input?.value).toBe("ap");
  expect(document.activeElement).toBe(input);
  // The keys went to the find bar, not into A1.
  expect(store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe("apple");
});
