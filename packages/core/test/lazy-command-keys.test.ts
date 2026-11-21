import { afterEach, beforeAll, beforeEach, expect, it } from "bun:test";

import { initSheetwrite } from "../src/grid.js";
import { installCanvasTestStubs } from "../src/testing.js";
import { expectSameNode, mountGridWithData } from "./fixtures.js";

// Keys pressed while a command's code loads on first use act after the
// command, where it left the focus. The AutoFilter's case is in
// autofilter-ui.test.ts; here the find bar takes the focus.

let restoreStubs: () => void;

beforeAll(async () => {
  await initSheetwrite();
});

beforeEach(() => {
  restoreStubs = installCanvasTestStubs();
});

afterEach(() => {
  restoreStubs();
  document.body.replaceChildren();
});

it("types the keys pressed while the find bar loads into its field", async () => {
  const { grid, store, host } = mountGridWithData(5);
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
  expectSameNode(document.activeElement, input);
  // The keys went to the find bar, not into A1.
  expect(store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe("Customer 0");
  grid.destroy();
  store.dispose();
});
