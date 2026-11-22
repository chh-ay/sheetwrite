import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";

import { GridImpl, initSheetwrite } from "../src/grid.js";
import { findMatcher, replaceInText } from "../src/search-replace.js";
import { SheetwriteStore } from "../src/store.js";
import { installCanvasTestStubs } from "../src/testing.js";
import type { DocumentOp, Workbook } from "../src/types.js";
import { makeColumnarData, makeWorkbook, mountHost } from "./fixtures.js";

beforeAll(async () => {
  await initSheetwrite();
});

let restore_stubs: () => void;

beforeEach(() => {
  restore_stubs = installCanvasTestStubs();
});
const mounted: { grid: GridImpl; store: SheetwriteStore }[] = [];
afterEach(() => {
  for (const { grid, store } of mounted.splice(0)) {
    grid.destroy();
    store.dispose();
  }
  restore_stubs();
});

/** A grid over a store of `workbook` (or `makeWorkbook(rows)`) after `patches`. */
function mount(
  rows: number | Workbook,
  patches: DocumentOp[] = [],
  { data = false, partial = false }: { data?: boolean; partial?: boolean } = {},
): { grid: GridImpl; store: SheetwriteStore } {
  const workbook = typeof rows === "number" ? makeWorkbook(rows) : rows;
  const store = new SheetwriteStore(
    workbook,
    data && typeof rows === "number" ? makeColumnarData(rows) : undefined,
  );
  if (patches.length > 0) store.applyTransaction({ patches });
  const grid = new GridImpl(
    mountHost(),
    { workbook, ...(partial ? { mutationPolicy: "partial" as const } : {}) },
    store,
  );
  mounted.push({ grid, store });
  return { grid, store };
}

const text = (value: string | number) => ({ kind: "literal" as const, value });
const set = (addr: ReturnType<typeof A>, value: string | number, style?: object): DocumentOp =>
  ({ op: "set", addr, value: text(value), ...(style ? { style } : {}) }) as DocumentOp;

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
  it("matches wildcards leftmost and longest, without empty matches", () => {
    expect(replaceInText("xaybzaqb", "a*b", "-")).toBe("x-");
    expect(replaceInText("abab", "a?", "-")).toBe("--");
    expect(replaceInText("ABC abc", "b*", "-")).toBe("A-");
    expect(replaceInText("ABC abc", "b?", "-", { matchCase: true })).toBe("ABC a-");
    expect(replaceInText("a😀b", "a?b", "-")).toBe("-");
    expect(replaceInText("x", "*", "-", { wholeCell: true })).toBe("-");
    expect(replaceInText("xy", "x", "-", { wholeCell: true })).toBeNull();
    expect(replaceInText("x~y", "~y", "-")).toBe("x-");
    expect(replaceInText("a?c abc", "a~?c", "-")).toBe("- abc");
    expect(replaceInText("one two three", "t*e", "-")).toBe("one -");
    expect(replaceInText("one two three", "t?o*e", "-")).toBe("one -");
    expect(replaceInText("x😀b", "?b", "-")).toBe("x-");
    expect(replaceInText("ab*", "b~*", "-")).toBe("a-");
    expect(findMatcher("c*r 1?", { wholeCell: true })("Customer 12")).toBe(true);
    expect(findMatcher("c*r 1?", { wholeCell: true })("Customer 123")).toBe(false);
    expect(findMatcher("*o?e", { wholeCell: true })("one done")).toBe(true);
    expect(findMatcher("??", { wholeCell: true })("😀x")).toBe(true);
    expect(findMatcher("a*b*c")("xxaxxbxxc")).toBe(true);
  });
  it("finds and replaces wildcards in time linear in the text", () => {
    // A backtracking matcher scans to the end of the text from every `a`
    // after the first match: quadratic for one `*`.
    const text = `ab${"a".repeat(32_000)}`;
    const note = "a".repeat(32_000);
    const started = performance.now();
    expect(replaceInText(text, "a*b", "X")).toBe(`X${"a".repeat(32_000)}`);
    expect(findMatcher("a*b")(note)).toBe(false);
    expect(findMatcher("*a*", { wholeCell: true })(note)).toBe(true);
    expect(performance.now() - started).toBeLessThan(250);
  });
  it("stays linear with two stars, where backtracking is cubic", () => {
    // Short text: a backtracking matcher takes seconds on it already.
    const text = `aab${"a".repeat(2_000)}`;
    const started = performance.now();
    expect(replaceInText(text, "a*a*b", "X")).toBe(`X${"a".repeat(2_000)}`);
    expect(findMatcher("a*a*b")(text.slice(3))).toBe(false);
    expect(performance.now() - started).toBeLessThan(250);
  });
});

describe("replaceAll", () => {
  it("keeps replacements in spill children and ordinary cells through undo", () => {
    const { grid, store } = mount(6, [
      { op: "set", addr: A(0, 1), value: { kind: "formula", src: "=SEQUENCE(3)" } },
      set(A(5, 1), 2),
    ]);
    grid.search("2", { wholeCell: true });

    expect(grid.replaceAll("9").replaced).toBe(2);
    expect(store.getCell(A(1, 1)).resolved).toBe(9);
    expect(store.getCell(A(0, 1)).resolved).toBe("#SPILL!");
    expect(store.getCell(A(5, 1)).resolved).toBe(9);
    grid.actions.undo();
    expect(store.getCell(A(5, 1)).resolved).toBe(2);
    expect(store.getCell(A(1, 1)).resolved).toBe(2);
  });

  it("retains per-match validation issues and partial application", () => {
    const { grid, store } = mount(
      4,
      [
        set(A(0, 0), "match"),
        set(A(3, 0), "match"),
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
      { partial: true },
    );
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
  });

  it("keeps styles, references and linked cells through replace, undo and redo", () => {
    const { grid, store } = mount(10, [
      set(A(1, 0), "match", { bold: true }),
      set(A(8, 2), "match", { italic: true }),
      { op: "set", addr: A(4, 1), value: { kind: "formula", src: "=10+2" } },
      { op: "set", addr: A(9, 0), value: { kind: "ref", target: A(4, 1) } },
      // A reference cell whose value matches stays linked, and is not counted.
      { op: "set", addr: A(2, 2), value: { kind: "ref", target: A(1, 0) } },
    ]);
    grid.search("match");

    expect(grid.replaceAll("changed").replaced).toBe(2);
    expect(store.getCell(A(1, 0))).toMatchObject({ resolved: "changed", style: { bold: true } });
    expect(store.getCell(A(8, 2))).toMatchObject({ resolved: "changed", style: { italic: true } });
    expect(store.getRefTarget(A(2, 2))).toEqual(A(1, 0));
    expect(store.getCell(A(2, 2)).resolved).toBe("changed");
    grid.actions.undo();
    expect(store.getCell(A(8, 2)).resolved).toBe("match");
    expect(store.getFormula(A(4, 1))).toBe("=10+2");
    grid.actions.redo();
    expect(store.getCell(A(8, 2)).resolved).toBe("changed");
    expect(store.getRefTarget(A(9, 0))).toEqual(A(4, 1));
  });
});

describe("find", () => {
  it("selects the match it shows, as Excel's Find Next does", () => {
    const { grid } = mount(10, [], { data: true });
    grid.setSelection({ kind: "cell", addr: A(0, 0) });

    // makeColumnarData puts Tokyo in column 2 of rows 1, 4 and 7.
    grid.search("Tokyo");
    expect(grid.getSelection()).toEqual({ kind: "cell", addr: A(1, 2) });
    grid.findNext();
    expect(grid.getSelection()).toEqual({ kind: "cell", addr: A(4, 2) });
    grid.findPrev();
    expect(grid.getSelection()).toEqual({ kind: "cell", addr: A(1, 2) });
  });

  it("searches and replaces only a selection of more than one cell, as Excel does", () => {
    const { grid, store } = mount(10, [], { data: true });
    const range = { sheet: "s1", start: { row: 0, col: 1 }, end: { row: 5, col: 2 } };
    grid.setSelection({ kind: "range", range });
    // The store's own search reads the whole sheet, whole cells only when asked.
    expect(store.searchCells("s1", "Tok", { wholeCell: true })).toEqual([]);
    expect(store.searchCells("s1", "Tokyo", { wholeCell: true })).toEqual([
      A(1, 2),
      A(4, 2),
      A(7, 2),
    ]);

    // Each keystroke searches the same selection, because the selection stays.
    expect(grid.search("Toky").matches).toEqual([A(1, 2), A(4, 2)]);
    expect(grid.search("Tokyo").matches).toEqual([A(1, 2), A(4, 2)]);
    // Find Next moves the active cell inside the selection.
    expect(grid.getSelection()).toEqual({ kind: "range", range, active: A(1, 2) });
    grid.findNext();
    expect(grid.getSelection()).toEqual({ kind: "range", range, active: A(4, 2) });

    expect(grid.replaceAll("Kyoto").replaced).toBe(2);
    expect([1, 4, 7].map((row) => store.getCell(A(row, 2)).resolved)).toEqual([
      "Kyoto",
      "Kyoto",
      "Tokyo",
    ]);
    expect(grid.getSelection()).toMatchObject({ kind: "range", range });
  });
});

describe("find with Excel's wildcards and Look in", () => {
  const cells_grid = () =>
    mount(6, [
      set(A(0, 0), "apple"),
      set(A(1, 0), "Apple pie"),
      { op: "set", addr: A(2, 0), value: { kind: "formula", src: '=A1&"*"' } },
      set(A(3, 0), "a*e"),
    ]);
  const rows = (result: { matches: { row: number }[] }): number[] =>
    result.matches.map((match) => match.row);

  it("matches `*`, `?` and `~`, and looks in formulas unless told to look in values", () => {
    const { grid } = cells_grid();
    // A3's formula, =A1&"*", has no "e"; its value, apple*, has one.
    expect(rows(grid.search("A*e"))).toEqual([0, 1, 3]);
    expect(rows(grid.search("A*e", { lookIn: "values" }))).toEqual([0, 1, 2, 3]);
    expect(rows(grid.search("a?ple", { wholeCell: true }))).toEqual([0]);
    expect(rows(grid.search("a~*e"))).toEqual([3]);
    expect(rows(grid.search("A1"))).toEqual([2]);
    expect(rows(grid.search("A1", { lookIn: "values" }))).toEqual([]);
  });

  it("replaces inside formulas, as Excel's Replace does", () => {
    const { grid, store } = cells_grid();
    grid.search("A1");
    expect(grid.replaceAll("A2").replaced).toBe(1);
    expect(store.getFormula(A(2, 0))).toBe('=A2&"*"');
    expect(store.getCell(A(2, 0)).resolved).toBe("Apple pie*");
  });
});

describe("find options", () => {
  const B = (row: number, col: number) => ({ sheet: "s2", row, col });

  /** Sheet 1 and Sheet 2 hold "North" in different cases; a hidden Sheet 3 holds one too. */
  function workbook_grid(): { grid: GridImpl; store: SheetwriteStore } {
    const base = makeWorkbook(4);
    const first = base.sheets[0]!;
    return mount(
      {
        ...base,
        sheets: [
          first,
          { ...first, id: "s2", name: "Sheet 2" },
          { ...first, id: "s3", name: "Sheet 3", visibility: "hidden" as const },
        ],
      },
      [
        set(A(1, 0), "North"),
        set(A(0, 2), "x"),
        set(A(1, 1), "x"),
        set(B(0, 2), "north"),
        set({ sheet: "s3", row: 0, col: 0 }, "North"),
        { op: "setNote", addr: A(2, 1), text: "Check North" },
      ],
    );
  }

  it("searches every visible sheet in tab order and moves to a match on another sheet", () => {
    const { grid, store } = workbook_grid();

    expect(grid.search("north", { within: "workbook" }).matches).toEqual([A(1, 0), B(0, 2)]);
    expect(grid.search("north", { within: "workbook", matchCase: true }).matches).toEqual([
      B(0, 2),
    ]);
    expect(grid.getActiveSheet()).toBe("s2");
    expect(grid.getSelection()).toEqual({ kind: "cell", addr: B(0, 2) });

    grid.search("north", { within: "workbook" });
    expect(grid.findNext().active).toBe(0);
    expect(grid.getActiveSheet()).toBe("s1");
    expect(grid.selectMatch(1).active).toBe(1);
    expect(grid.getActiveSheet()).toBe("s2");

    expect(grid.replaceAll("South").replaced).toBe(2);
    expect(store.getCell(A(1, 0)).resolved).toBe("South");
    expect(store.getCell(B(0, 2)).resolved).toBe("South");
    expect(store.getCell({ sheet: "s3", row: 0, col: 0 }).resolved).toBe("North");
    grid.actions.undo();
    expect(store.getCell(B(0, 2)).resolved).toBe("north");
  });

  it("orders matches down each column for Search: By Columns", () => {
    const { grid } = workbook_grid();
    expect(grid.search("x").matches).toEqual([A(0, 2), A(1, 1)]);
    expect(grid.search("x", { searchBy: "columns" }).matches).toEqual([A(1, 1), A(0, 2)]);
    grid.findNext();
    expect(grid.getSelection()).toEqual({ kind: "cell", addr: A(0, 2) });
  });

  it("looks in notes and replaces note text", () => {
    const { grid, store } = workbook_grid();
    expect(grid.search("north", { lookIn: "notes" }).matches).toEqual([A(2, 1)]);

    expect(grid.replaceAll("South").replaced).toBe(1);
    expect(store.getWorkbook().sheets[0]?.notes).toEqual([{ addr: A(2, 1), text: "Check South" }]);
    expect(store.getCell(A(1, 0)).resolved).toBe("North");
  });
});

describe("previewReplaceAll", () => {
  it("lists exactly the changes replaceAll writes, without writing", () => {
    const { grid, store } = mount(4, [
      set(A(0, 0), "A1 total"),
      { op: "set", addr: A(1, 0), value: { kind: "formula", src: "=A1&B1" } },
      { op: "set", addr: A(2, 0), value: { kind: "formula", src: '="A1"' } },
    ]);
    grid.search("A1");

    // `A1)` would break =A1&B1, so neither the preview nor Replace all touch it.
    expect(grid.previewReplaceAll("A1)")).toEqual({
      changes: [
        { addr: A(0, 0), kind: "value", before: "A1 total", after: "A1) total" },
        { addr: A(2, 0), kind: "formula", before: '="A1"', after: '="A1)"' },
      ],
      total: 2,
      formulas: 1,
    });
    expect(store.getCell(A(0, 0)).resolved).toBe("A1 total");

    expect(grid.replaceAll("A1)").replaced).toBe(2);
    expect(store.getCell(A(0, 0)).resolved).toBe("A1) total");
    expect(store.getFormula(A(1, 0))).toBe("=A1&B1");
    expect(store.getFormula(A(2, 0))).toBe('="A1)"');
  });

  it("lists the first 1,000 changes and counts them all", () => {
    const rows = 1_005;
    const { grid } = mount(
      rows,
      Array.from({ length: rows }, (_, row) => set(A(row, 0), "dup")),
    );
    grid.search("dup");

    const preview = grid.previewReplaceAll("one");
    expect(preview.total).toBe(rows);
    expect(preview.changes).toHaveLength(1_000);
    expect(preview.changes.at(-1)).toMatchObject({ addr: A(999, 0), after: "one" });
  });
});
