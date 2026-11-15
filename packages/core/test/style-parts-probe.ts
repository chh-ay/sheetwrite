// Each process owns the warn-once stylesheet state; earlier widgets must not
// consume the warning this probe observes.
import { spyOn } from "bun:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { GridImpl, initSheetwrite } from "../src/grid.js";
import { SheetwriteStore } from "../src/store.js";
import { installCanvasTestStubs } from "../src/testing.js";
import { elementAdded, makeColumnarData, makeWorkbook, mountHost } from "./fixtures.js";

await initSheetwrite();
const restore = installCanvasTestStubs();
const warn = spyOn(console, "warn").mockImplementation(() => undefined);
const style = document.createElement("style");
style.textContent = readFileSync(new URL("../styles/grid.css", import.meta.url), "utf8");
document.head.appendChild(style);
try {
  for (let grids = 0; grids < 2; grids += 1) {
    const workbook = makeWorkbook();
    const store = new SheetwriteStore(workbook, makeColumnarData(50));
    const host = mountHost();
    const grid = new GridImpl(host, { workbook, config: { toolbar: false, tabs: false } }, store);
    try {
      host.dispatchEvent(new KeyboardEvent("keydown", { key: "f", ctrlKey: true, bubbles: true }));
      await elementAdded(host, ".sheetwrite-find", HTMLDivElement);
    } finally {
      grid.destroy();
      host.remove();
    }
  }

  // The loaded grid part is quiet. The missing find part warns only once in
  // development, and production builds emit no stylesheet diagnostics.
  assert.equal(warn.mock.calls.length, Number(process.argv[2]));
  for (const [message] of warn.mock.calls) {
    assert.match(String(message), /"@sheetwrite\/core\/styles\/find\.css"/);
  }
} finally {
  style.remove();
  warn.mockRestore();
  restore();
}
