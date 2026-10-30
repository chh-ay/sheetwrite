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

  it("preserves original offsets when Unicode lowercase expands", () => {
    expect(replaceInText("İabc abc", "abc", "x")).toBe("İx x");
    expect(replaceInText("İx", "İ", "Y")).toBe("Yx");
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
  it("does not let a spill-child rejection prevent another matched cell replacement", () => {
    const workbook = makeWorkbook(6);
    const store = new SheetwriteStore(workbook);
    store.applyTransaction({
      patches: [
        { op: "set", addr: A(0, 1), value: { kind: "formula", src: "=SEQUENCE(3)" } },
        { op: "set", addr: A(5, 1), value: { kind: "literal", value: 2 } },
      ],
    });
    const grid = new GridImpl(mountHost(), { workbook }, store);
    grid.search("2", { wholeCell: true });

    expect(grid.replaceAll("9").replaced).toBe(2);
    expect(store.getCell(A(1, 1)).resolved).toBe(2);
    expect(store.getCell(A(5, 1)).resolved).toBe(9);
    grid.actions.undo();
    expect(store.getCell(A(5, 1)).resolved).toBe(2);
    expect(store.getFormula(A(0, 1))).toBe("=SEQUENCE(3)");
    grid.destroy();
    store.dispose();
  });

  it("retains per-match validation issues and partial application", () => {
    const workbook = makeWorkbook(4);
    const store = new SheetwriteStore(workbook);
    store.applyTransaction({
      patches: [
        { op: "set", addr: A(0, 0), value: { kind: "literal", value: "match" } },
        { op: "set", addr: A(3, 0), value: { kind: "literal", value: "match" } },
        {
          op: "setValidationRule",
          sheet: "s1",
          rule: {
            id: "keep-match",
            range: { sheet: "s1", start: { row: 3, col: 0 }, end: { row: 3, col: 0 } },
            condition: { kind: "list", values: ["match"] },
            policy: "reject",
          },
        },
      ],
    });
    const grid = new GridImpl(mountHost(), { workbook, mutationPolicy: "partial" }, store);
    const rejected: number[] = [];
    grid.on("mutation-rejected", ({ issues }) => {
      for (const issue of issues)
        if ("operationIndex" in issue) rejected.push(issue.operationIndex);
    });
    grid.search("match");

    expect(grid.replaceAll("changed").replaced).toBe(2);
    expect(store.getCell(A(0, 0)).resolved).toBe("changed");
    expect(store.getCell(A(3, 0)).resolved).toBe("match");
    expect(rejected).toEqual([1]);
    grid.actions.undo();
    expect(store.getCell(A(0, 0)).resolved).toBe("match");
    grid.destroy();
    store.dispose();
  });

  it("replaces sparse styled matches, preserving gaps and references across undo/redo", () => {
    const workbook = makeWorkbook(10);
    const store = new SheetwriteStore(workbook);
    store.applyTransaction({
      patches: [
        {
          op: "set",
          addr: A(1, 0),
          value: { kind: "literal", value: "match" },
          style: { bold: true },
        },
        {
          op: "set",
          addr: A(8, 2),
          value: { kind: "literal", value: "match" },
          style: { italic: true },
        },
        { op: "set", addr: A(4, 1), value: { kind: "formula", src: "=10+2" } },
        { op: "set", addr: A(9, 0), value: { kind: "ref", target: A(4, 1) } },
      ],
    });
    const grid = new GridImpl(mountHost(), { workbook }, store);
    grid.search("match");

    expect(grid.replaceAll("changed").replaced).toBe(2);
    expect(store.getCell(A(1, 0))).toMatchObject({ resolved: "changed", style: { bold: true } });
    expect(store.getCell(A(8, 2))).toMatchObject({ resolved: "changed", style: { italic: true } });
    grid.actions.undo();
    expect(store.getCell(A(1, 0)).resolved).toBe("match");
    expect(store.getCell(A(8, 2)).resolved).toBe("match");
    expect(store.getFormula(A(4, 1))).toBe("=10+2");
    expect(store.getRefTarget(A(9, 0))).toEqual(A(4, 1));

    grid.actions.redo();
    expect(store.getCell(A(8, 2)).resolved).toBe("changed");
    expect(store.getRefTarget(A(9, 0))).toEqual(A(4, 1));
    grid.destroy();
    store.dispose();
  });

  it("keeps matching reference cells linked during replace all", () => {
    const workbook = makeWorkbook(3);
    const store = new SheetwriteStore(workbook);
    store.applyTransaction({
      patches: [
        { op: "set", addr: A(0, 0), value: { kind: "literal", value: "match" } },
        { op: "set", addr: A(1, 0), value: { kind: "ref", target: A(0, 0) } },
      ],
    });
    const grid = new GridImpl(mountHost(), { workbook }, store);
    grid.search("match");

    expect(grid.replaceAll("changed").replaced).toBe(1);
    expect(store.getRefTarget(A(1, 0))).toEqual(A(0, 0));
    expect(store.getCell(A(1, 0)).resolved).toBe("changed");
    grid.destroy();
    store.dispose();
  });

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
