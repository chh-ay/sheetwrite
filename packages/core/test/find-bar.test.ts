import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";

import { FindBar } from "../src/find-bar.js";
import { createGrid, DEFAULT_THEME, initSheetwrite } from "../src/grid.js";
import { installCanvasTestStubs } from "../src/testing.js";
import type { SearchResult } from "../src/types.js";
import { makeWorkbook, mountHost } from "./fixtures.js";

let restoreCanvasStubs: () => void;

beforeAll(async () => {
  await initSheetwrite();
});

beforeEach(() => {
  restoreCanvasStubs = installCanvasTestStubs();
});

afterEach(() => {
  restoreCanvasStubs();
  document.body.innerHTML = "";
});

describe("FindBar", () => {
  it("searches and replaces live cells without leaking field keystrokes", async () => {
    const host = mountHost();
    const grid = createGrid(host, {
      workbook: makeWorkbook(3),
      data: {
        rowCount: 3,
        columns: {
          name: ["Ada", "Bob", "Ada"],
          amount: [1, 2, 3],
          city: ["London", "Paris", "Rome"],
        },
      },
      config: { find: false, contextMenu: false, toolbar: false },
    });
    const searchEvents: SearchResult[] = [];
    let changes = 0;
    grid.on("search", (event) => searchEvents.push(event));
    grid.on("change", () => {
      changes += 1;
    });
    const bar = new FindBar(host, DEFAULT_THEME, grid);
    expect(host.querySelector(".sheetwrite-find")).toBeNull();

    bar.open();
    const input = host.querySelector<HTMLInputElement>(".sheetwrite-find-input")!;
    const replacement = host.querySelector<HTMLInputElement>(".sheetwrite-find-replace-input")!;
    const count = host.querySelector<HTMLElement>(".sheetwrite-find-count")!;
    input.value = "Ada";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(count.textContent?.match(/\d+/g)).toEqual(["1", "2"]);
    let latest = searchEvents.at(-1)!;
    expect(latest.matches[latest.active]).toEqual({ sheet: "s1", row: 0, col: 0 });

    host.querySelector<HTMLButtonElement>(".sheetwrite-find-next")!.click();
    expect(count.textContent?.match(/\d+/g)).toEqual(["2", "2"]);
    latest = searchEvents.at(-1)!;
    expect(latest.matches[latest.active]).toEqual({ sheet: "s1", row: 2, col: 0 });

    const buttonMouseDown = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    host.querySelector<HTMLButtonElement>(".sheetwrite-find-next")!.dispatchEvent(buttonMouseDown);
    expect(buttonMouseDown.defaultPrevented).toBe(true);

    host.querySelector<HTMLButtonElement>(".sheetwrite-find-prev")!.click();
    expect(count.textContent?.match(/\d+/g)).toEqual(["1", "2"]);
    host.querySelector<HTMLButtonElement>(".sheetwrite-find-next")!.click();

    input.dispatchEvent(new KeyboardEvent("keydown", { key: "x", bubbles: true }));
    expect(grid.store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe("Ada");
    expect(grid.store.getCell({ sheet: "s1", row: 2, col: 0 }).resolved).toBe("Ada");

    replacement.value = "Grace";
    host.querySelector<HTMLButtonElement>(".sheetwrite-find-replace")!.click();
    expect(grid.store.getCell({ sheet: "s1", row: 2, col: 0 }).resolved).toBe("Grace");
    expect(changes).toBe(1);
    expect(count.textContent?.match(/\d+/g)).toEqual(["1", "1"]);
    await Promise.resolve();

    replacement.value = "Lovelace";
    replacement.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(grid.store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe("Lovelace");

    input.value = "Grace";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    replacement.value = "All";
    host.querySelector<HTMLButtonElement>(".sheetwrite-find-replace-all")!.click();
    expect(grid.store.getCell({ sheet: "s1", row: 2, col: 0 }).resolved).toBe("All");

    replacement.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(bar.isOpen).toBe(false);
    bar.open();
    host.querySelector<HTMLButtonElement>(".sheetwrite-find-close")!.click();
    expect(bar.isOpen).toBe(false);
    bar.open();
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(bar.isOpen).toBe(false);
    expect(document.activeElement).toBe(host);
    expect(grid.store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe("Lovelace");

    bar.destroy();
    grid.destroy();
  });
});

describe("FindBar options and Find All", () => {
  it("searches the workbook from Options and lists every match", () => {
    const host = mountHost();
    const base = makeWorkbook(3);
    const [first] = base.sheets;
    if (!first) throw new Error("makeWorkbook gives one sheet");
    const grid = createGrid(host, {
      workbook: { ...base, sheets: [first, { ...first, id: "s2", name: "Sheet 2" }] },
      config: { find: false, contextMenu: false, toolbar: false },
    });
    grid.applyTransaction({
      patches: [
        {
          op: "set",
          addr: { sheet: "s1", row: 0, col: 0 },
          value: { kind: "literal", value: "Ada" },
        },
        {
          op: "set",
          addr: { sheet: "s2", row: 1, col: 2 },
          value: { kind: "formula", src: '="ada"' },
        },
      ],
    });
    const bar = new FindBar(host, DEFAULT_THEME, grid);
    bar.open();
    const input = host.querySelector<HTMLInputElement>(".sheetwrite-find-input")!;
    const options = host.querySelector<HTMLElement>(".sheetwrite-find-options")!;
    const [within, , lookIn] = options.querySelectorAll("select");

    // Alt+C, Excel's Match case key, opens the options and ticks the box.
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "c", altKey: true, bubbles: true }));
    expect(options.hidden).toBe(false);
    expect(options.querySelector<HTMLInputElement>("input[type=checkbox]")!.checked).toBe(true);
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "c", altKey: true, bubbles: true }));

    within!.value = "workbook";
    within!.dispatchEvent(new Event("change"));
    lookIn!.value = "values";
    lookIn!.dispatchEvent(new Event("change"));
    expect(input.getAttribute("aria-label")).toBe("Find in workbook");
    input.value = "ada";
    input.dispatchEvent(new Event("input", { bubbles: true }));

    host.querySelector<HTMLButtonElement>(".sheetwrite-find-all")!.click();
    const findAll = host.querySelector<HTMLElement>(".sheetwrite-find-all-results")!;
    const rows = [
      ...findAll.querySelectorAll(".sheetwrite-find-results-list .sheetwrite-find-result"),
    ];
    expect(rows.map((row) => [...row.children].map((cell) => cell.textContent))).toEqual([
      ["Sheet 1", "$A$1", "Ada", ""],
      ["Sheet 2", "$C$2", "ada", '="ada"'],
    ]);
    expect(findAll.querySelector(".sheetwrite-find-results-status")!.textContent).toBe(
      "2 cells found",
    );

    (rows[1] as HTMLElement).click();
    expect(grid.getActiveSheet()).toBe("s2");
    expect(grid.getSelection()).toEqual({ kind: "cell", addr: { sheet: "s2", row: 1, col: 2 } });
    expect(
      findAll.querySelector(".sheetwrite-find-result[aria-selected=true] span")!.textContent,
    ).toBe("Sheet 2");

    bar.destroy();
    grid.destroy();
  });
});

describe("FindBar Replace all preview", () => {
  /** Waits out the preview's debounce. */
  const settle = () => new Promise((resolve) => setTimeout(resolve, 200));

  it("shows what Replace all will change before it applies, as one undo step", async () => {
    const host = mountHost();
    const grid = createGrid(host, {
      workbook: makeWorkbook(3),
      data: {
        rowCount: 3,
        columns: {
          name: ["Ada", "Bob", "Ada"],
          amount: [1, 2, 3],
          city: ["London", "Paris", "Rome"],
        },
      },
      config: { find: false, contextMenu: false, toolbar: false },
    });
    grid.applyTransaction({
      patches: [
        {
          op: "set",
          addr: { sheet: "s1", row: 1, col: 2 },
          value: { kind: "formula", src: '="Ada"' },
        },
      ],
    });
    const bar = new FindBar(host, DEFAULT_THEME, grid);
    bar.open({ replace: true });
    const input = host.querySelector<HTMLInputElement>(".sheetwrite-find-input")!;
    const replacement = host.querySelector<HTMLInputElement>(".sheetwrite-find-replace-input")!;
    const preview = host.querySelector<HTMLElement>(".sheetwrite-find-preview")!;
    input.value = "Ada";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    replacement.value = "Grace";
    replacement.dispatchEvent(new Event("input", { bubbles: true }));
    await settle();

    expect(preview.hidden).toBe(false);
    expect(preview.querySelector(".sheetwrite-find-results-status")!.textContent).toBe(
      "3 cells, 1 of them a formula",
    );
    const rows = [
      ...preview.querySelectorAll(".sheetwrite-find-results-list .sheetwrite-find-result"),
    ];
    expect(rows.map((row) => [...row.children].map((cell) => cell.textContent))).toEqual([
      ["Sheet 1", "$A$1", "Ada", "Grace"],
      ["Sheet 1", "$C$2", '="Ada"', '="Grace"'],
      ["Sheet 1", "$A$3", "Ada", "Grace"],
    ]);
    expect(grid.store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe("Ada");

    host.querySelector<HTMLButtonElement>(".sheetwrite-find-replace-all")!.click();
    expect(grid.store.getCell({ sheet: "s1", row: 2, col: 0 }).resolved).toBe("Grace");
    expect(grid.store.getFormula({ sheet: "s1", row: 1, col: 2 })).toBe('="Grace"');
    await settle();
    expect(preview.querySelector(".sheetwrite-find-results-status")!.textContent).toBe(
      "Nothing to replace",
    );
    grid.actions.undo();
    expect(grid.store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe("Ada");
    expect(grid.store.getFormula({ sheet: "s1", row: 1, col: 2 })).toBe('="Ada"');

    bar.destroy();
    grid.destroy();
  });

  it("plans the preview once typing pauses, not on every key", async () => {
    const host = mountHost();
    const grid = createGrid(host, {
      workbook: makeWorkbook(2),
      data: { rowCount: 2, columns: { name: ["Ada", "Bob"], amount: [1, 2], city: ["", ""] } },
      config: { find: false, contextMenu: false, toolbar: false },
    });
    let plans = 0;
    const preview = grid.previewReplaceAll.bind(grid);
    grid.previewReplaceAll = (replacement) => {
      plans += 1;
      return preview(replacement);
    };
    const bar = new FindBar(host, DEFAULT_THEME, grid);
    bar.open({ replace: true });
    const input = host.querySelector<HTMLInputElement>(".sheetwrite-find-input")!;
    const replacement = host.querySelector<HTMLInputElement>(".sheetwrite-find-replace-input")!;
    input.value = "Ada";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    for (const text of ["G", "Gr", "Gra"]) {
      replacement.value = text;
      replacement.dispatchEvent(new Event("input", { bubbles: true }));
    }
    expect(plans).toBe(0);
    await settle();
    expect(plans).toBe(1);
    bar.destroy();
    grid.destroy();
  });
});

describe("Find in numbers with a number format", () => {
  it("matches the formula bar's text or the shown text, as Excel's Look in does", () => {
    const host = mountHost();
    const workbook = makeWorkbook(4);
    workbook.sheets[0]!.columns[1] = {
      key: "amount",
      header: "Amount",
      width: 120,
      type: "general",
    };
    const grid = createGrid(host, {
      workbook,
      data: {
        rowCount: 4,
        columns: {
          name: ["a", "b", "c", "d"],
          amount: [46037, 0.15, 4.5, 0.15],
          city: ["", "", "", ""],
        },
      },
      config: { find: false, contextMenu: false, toolbar: false },
    });
    const cell = (row: number) => ({ sheet: "s1", row, col: 1 });
    const formats = ["m/d/yyyy", "0%", "$#,##0.00"];
    grid.applyTransaction({
      patches: formats.map((numberFormat, row) => ({
        op: "setRangeStyle" as const,
        range: { sheet: "s1", start: cell(row), end: cell(row) },
        style: { numberFormat },
      })),
    });
    const rows = (query: string, lookIn: "formulas" | "values") =>
      grid.search(query, { lookIn }).matches.map((match) => match.row);

    expect(rows("1/15/2026", "formulas")).toEqual([0]);
    expect(rows("1/15/2026", "values")).toEqual([0]);
    expect(rows("15%", "formulas")).toEqual([1]);
    expect(rows("15%", "values")).toEqual([1]);
    expect(rows("$4.50", "values")).toEqual([2]);
    // A formatted number is not found by its stored number; a General one is.
    expect(rows("0.15", "formulas")).toEqual([3]);

    // Replace rewrites the text Find read, and the cell keeps its format.
    grid.search("1/15", { lookIn: "formulas" });
    expect(grid.replaceAll("1/16").replaced).toBe(1);
    expect(grid.store.getCell(cell(0))).toMatchObject({
      resolved: 46038,
      style: { numberFormat: "m/d/yyyy" },
    });

    // A number format given to a found cell takes it out of the open search.
    expect(rows("4.5", "formulas")).toEqual([2]);
    const events: SearchResult[] = [];
    grid.on("search", (event) => events.push(event));
    grid.applyTransaction({
      patches: [
        {
          op: "setRangeStyle",
          range: { sheet: "s1", start: cell(2), end: cell(2) },
          style: { numberFormat: "0.0%" },
        },
      ],
    });
    expect(events.at(-1)?.matches).toEqual([]);
    grid.destroy();
  });
});
