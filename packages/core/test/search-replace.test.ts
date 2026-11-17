import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";

import { GridImpl, initSheetwrite } from "../src/grid.js";
import { replaceInText } from "../src/search-replace.js";
import { SheetwriteStore } from "../src/store.js";
import { installCanvasTestStubs } from "../src/testing.js";
import { makeColumnarData, makeWorkbook, mountHost } from "./fixtures.js";

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

const A = (row: number, col: number) => ({ sheet: "s1", row, col });

describe("replaceInText", () => {
  it("preserves original offsets when Unicode lowercase expands", () => {
    expect(replaceInText("İabc abc", "abc", "x")).toBe("İx x");
    expect(replaceInText("İx", "İ", "Y")).toBe("Yx");
  });
  it("matchCase only hits exact casing", () => {
    expect(replaceInText("aXbxc", "x", "-", { matchCase: true })).toBe("aXb-c");
  });
  it("replaces what Excel's wildcards match", () => {
    // `?` is one character: "ple" in "Apple" and "pie".
    expect(replaceInText("Apple pie", "p?e", "X")).toBe("ApX X");
    expect(replaceInText("a*e", "a~*e", "ok")).toBe("ok");
    expect(replaceInText("abc", "*", "X")).toBe("X");
    expect(replaceInText("abc", "a?", "X", { wholeCell: true })).toBeNull();
  });
});

describe("replaceAll", () => {
  it("keeps replacements in spill children and ordinary cells through undo", () => {
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
    expect(store.getCell(A(1, 1)).resolved).toBe(9);
    expect(store.getCell(A(0, 1)).resolved).toBe("#SPILL!");
    expect(store.getCell(A(5, 1)).resolved).toBe(9);
    grid.actions.undo();
    expect(store.getCell(A(5, 1)).resolved).toBe(2);
    expect(store.getFormula(A(0, 1))).toBe("=SEQUENCE(3)");
    expect(store.getCell(A(1, 1)).resolved).toBe(2);
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

describe("find", () => {
  it("selects the match it shows, as Excel's Find Next does", () => {
    const workbook = makeWorkbook(10);
    const store = new SheetwriteStore(workbook, makeColumnarData(10));
    const grid = new GridImpl(mountHost(), { workbook }, store);
    grid.setSelection({ kind: "cell", addr: A(0, 0) });

    // makeColumnarData puts Tokyo in column 2 of rows 1, 4 and 7.
    grid.search("Tokyo");
    expect(grid.getSelection()).toEqual({ kind: "cell", addr: A(1, 2) });
    grid.findNext();
    expect(grid.getSelection()).toEqual({ kind: "cell", addr: A(4, 2) });
    grid.findPrev();
    expect(grid.getSelection()).toEqual({ kind: "cell", addr: A(1, 2) });

    grid.destroy();
  });

  it("searches and replaces only a selection of more than one cell, as Excel does", () => {
    const workbook = makeWorkbook(10);
    const store = new SheetwriteStore(workbook, makeColumnarData(10));
    const grid = new GridImpl(mountHost(), { workbook }, store);
    // makeColumnarData puts Tokyo in column 2 of rows 1, 4 and 7.
    const range = { sheet: "s1", start: { row: 0, col: 1 }, end: { row: 5, col: 2 } };
    grid.setSelection({ kind: "range", range });

    expect(grid.search("Tokyo").matches).toEqual([A(1, 2), A(4, 2)]);
    // The selection stays; Find Next moves the active cell inside it.
    expect(grid.getSelection()).toEqual({ kind: "range", range, active: A(1, 2) });
    grid.findNext();
    expect(grid.getSelection()).toEqual({ kind: "range", range, active: A(4, 2) });
    // Typing more of the query searches the same selection.
    expect(grid.search("Toky").matches).toEqual([A(1, 2), A(4, 2)]);

    expect(grid.replaceAll("Kyoto").replaced).toBe(2);
    expect(store.getCell(A(1, 2)).resolved).toBe("Kyoto");
    expect(store.getCell(A(4, 2)).resolved).toBe("Kyoto");
    expect(store.getCell(A(7, 2)).resolved).toBe("Tokyo");
    expect(grid.getSelection()).toMatchObject({ kind: "range", range });

    grid.destroy();
  });
});

describe("find with Excel's wildcards and Look in", () => {
  function cellsGrid(): { grid: GridImpl; store: SheetwriteStore } {
    const workbook = makeWorkbook(6);
    const store = new SheetwriteStore(workbook);
    store.applyTransaction({
      patches: [
        { op: "set", addr: A(0, 0), value: { kind: "literal", value: "apple" } },
        { op: "set", addr: A(1, 0), value: { kind: "literal", value: "Apple pie" } },
        { op: "set", addr: A(2, 0), value: { kind: "formula", src: '=A1&"*"' } },
        { op: "set", addr: A(3, 0), value: { kind: "literal", value: "a*e" } },
      ],
    });
    return { grid: new GridImpl(mountHost(), { workbook }, store), store };
  }
  const rows = (result: { matches: { row: number }[] }): number[] =>
    result.matches.map((match) => match.row);

  it("matches `*`, `?` and `~`, and looks in formulas unless told to look in values", () => {
    const { grid } = cellsGrid();
    // A3's formula, =A1&"*", has no "e"; its value, apple*, has one.
    expect(rows(grid.search("A*e"))).toEqual([0, 1, 3]);
    expect(rows(grid.search("A*e", { lookIn: "values" }))).toEqual([0, 1, 2, 3]);
    expect(rows(grid.search("a?ple", { wholeCell: true }))).toEqual([0]);
    expect(rows(grid.search("a~*e"))).toEqual([3]);
    expect(rows(grid.search("A1"))).toEqual([2]);
    expect(rows(grid.search("A1", { lookIn: "values" }))).toEqual([]);
    grid.destroy();
  });

  it("replaces inside formulas, as Excel's Replace does", () => {
    const { grid, store } = cellsGrid();
    grid.search("A1");
    expect(grid.replaceAll("A2").replaced).toBe(1);
    expect(store.getFormula(A(2, 0))).toBe('=A2&"*"');
    expect(store.getCell(A(2, 0)).resolved).toBe("Apple pie*");

    // A replacement that breaks the formula leaves the cell as it was.
    grid.search("A2");
    expect(grid.replaceAll("(").replaced).toBe(0);
    expect(store.getFormula(A(2, 0))).toBe('=A2&"*"');
    grid.destroy();
  });
});
