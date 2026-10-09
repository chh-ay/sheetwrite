import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { GridImpl, initSheetwrite } from "../src/grid.js";
import { replaceInText } from "../src/search-replace.js";
import { SheetwriteStore } from "../src/store.js";
import { installCanvasTestStubs } from "../src/testing.js";
import { makeColumnarData, makeWorkbook } from "./fixtures.js";

beforeAll(async () => {
  await initSheetwrite();
});

let restoreStubs: () => void;

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

const A = (row: number, col: number) => ({ sheet: "s1", row, col });

describe("replaceInText", () => {
  it("case-insensitive substring preserves surrounding casing", () => {
    expect(replaceInText("aXbXc", "x", "-")).toBe("a-b-c");
    expect(replaceInText("Tokyo", "tok", "Kyo")).toBe("Kyoyo");
  });
  it("matchCase only hits exact casing", () => {
    expect(replaceInText("aXbxc", "x", "-", { matchCase: true })).toBe("aXb-c");
  });
  it("wholeCell swaps entire text or nothing", () => {
    expect(replaceInText("Tokyo", "tokyo", "Kyoto", { wholeCell: true })).toBe("Kyoto");
    expect(replaceInText("Tokyo!", "tokyo", "Kyoto", { wholeCell: true })).toBeNull();
  });
  it("returns null with no match / empty query", () => {
    expect(replaceInText("abc", "z", "q")).toBeNull();
    expect(replaceInText("abc", "", "q")).toBeNull();
  });
});

describe("replaceAll", () => {
  it("skips formula cells (never rewrites source)", () => {
    const workbook = makeWorkbook(10);
    const store = new SheetwriteStore(workbook, makeColumnarData(10));
    store.applyTransaction({
      patches: [{ op: "set", addr: A(5, 1), value: { kind: "formula", src: "=21+21" } }],
    });
    const host = mountHost();
    const grid = new GridImpl(host, { workbook }, store);

    expect(store.getCell(A(5, 1)).resolved).toBe(42);
    grid.search("42");
    const { replaced } = grid.replaceAll("99");
    expect(replaced).toBe(0);
    expect(store.getFormula(A(5, 1))).toBe("=21+21");
    expect(store.getCell(A(5, 1)).resolved).toBe(42);

    grid.destroy();
  });
});
