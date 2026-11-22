import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";

import { expectSame } from "../../../test/expect-same.js";
import { FindBar } from "../src/find-bar.js";
import { createGrid, DEFAULT_THEME, initSheetwrite } from "../src/grid.js";
import { installCanvasTestStubs } from "../src/testing.js";
import type { ColumnarData, Grid, Workbook } from "../src/types.js";
import { makeWorkbook, mountHost } from "./fixtures.js";

let restore_canvas_stubs: () => void;
const cleanups: (() => void)[] = [];

beforeAll(async () => {
  await initSheetwrite();
});

beforeEach(() => {
  restore_canvas_stubs = installCanvasTestStubs();
});

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  restore_canvas_stubs();
  document.body.innerHTML = "";
});

const PEOPLE: ColumnarData = {
  rowCount: 3,
  columns: { name: ["Ada", "Bob", "Ada"], amount: [1, 2, 3], city: ["London", "Paris", "Rome"] },
};
const A = (row: number, col: number) => ({ sheet: "s1", row, col });

/** A grid without its own find bar, and a FindBar over it. */
function mount(data: ColumnarData, workbook: Workbook = makeWorkbook(data.rowCount)) {
  const host = mountHost();
  const grid = createGrid(host, {
    workbook,
    data,
    config: { find: false, contextMenu: false, toolbar: false },
  });
  const bar = new FindBar(host, DEFAULT_THEME, grid);
  cleanups.push(
    () => bar.destroy(),
    () => grid.destroy(),
  );
  const field = (name: string) => host.querySelector<HTMLInputElement>(`.sheetwrite-find-${name}`)!;
  const click = (name: string) =>
    host.querySelector<HTMLButtonElement>(`.sheetwrite-find-${name}`)!.click();
  const type_into = (input: HTMLInputElement, text: string) => {
    input.value = text;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  };
  return { host, grid, bar, field, click, typeInto: type_into };
}

const value = (grid: Grid, row: number, col = 0) => grid.store.getCell(A(row, col)).resolved;

describe("FindBar", () => {
  it("searches and replaces live cells without leaking field keystrokes", async () => {
    const { host, grid, bar, field, click, typeInto: type_into } = mount(PEOPLE);
    bar.open();
    const count = () => host.querySelector(".sheetwrite-find-count")?.textContent?.match(/\d+/g);
    type_into(field("input"), "Ada");
    expect(count()).toEqual(["1", "2"]);
    click("next");
    expect(count()).toEqual(["2", "2"]);
    expect(grid.getSelection()).toEqual({ kind: "cell", addr: A(2, 0) });

    // A press on a button keeps the focus in the field.
    const press = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    host.querySelector(".sheetwrite-find-next")!.dispatchEvent(press);
    expect(press.defaultPrevented).toBe(true);
    click("prev");
    expect(count()).toEqual(["1", "2"]);
    click("next");

    field("input").dispatchEvent(new KeyboardEvent("keydown", { key: "x", bubbles: true }));
    expect([value(grid, 0), value(grid, 2)]).toEqual(["Ada", "Ada"]);

    let changes = 0;
    grid.on("change", () => {
      changes += 1;
    });
    field("replace-input").value = "Grace";
    click("replace");
    expect(value(grid, 2)).toBe("Grace");
    expect(changes).toBe(1);
    expect(count()).toEqual(["1", "1"]);
    await Promise.resolve();

    field("replace-input").value = "Lovelace";
    field("replace-input").dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
    expect(value(grid, 0)).toBe("Lovelace");

    type_into(field("input"), "Grace");
    field("replace-input").value = "All";
    click("replace-all");
    expect(value(grid, 2)).toBe("All");

    field("replace-input").dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    expect(bar.isOpen).toBe(false);
    bar.open();
    click("close");
    expect(bar.isOpen).toBe(false);
    bar.open();
    field("input").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(bar.isOpen).toBe(false);
    expectSame(document.activeElement, host);
    expect(value(grid, 0)).toBe("Lovelace");
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
    const [within, , look_in] = options.querySelectorAll("select");

    // Alt+C, Excel's Match case key, opens the options and ticks the box.
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "c", altKey: true, bubbles: true }));
    expect(options.hidden).toBe(false);
    expect(options.querySelector<HTMLInputElement>("input[type=checkbox]")!.checked).toBe(true);
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "c", altKey: true, bubbles: true }));

    within!.value = "workbook";
    within!.dispatchEvent(new Event("change"));
    look_in!.value = "values";
    look_in!.dispatchEvent(new Event("change"));
    expect(input.getAttribute("aria-label")).toBe("Find in workbook");
    input.value = "ada";
    input.dispatchEvent(new Event("input", { bubbles: true }));

    host.querySelector<HTMLButtonElement>(".sheetwrite-find-all")!.click();
    const find_all = host.querySelector<HTMLElement>(".sheetwrite-find-all-results")!;
    const rows = [
      ...find_all.querySelectorAll(".sheetwrite-find-results-list .sheetwrite-find-result"),
    ];
    expect(rows.map((row) => [...row.children].map((cell) => cell.textContent))).toEqual([
      ["Sheet 1", "$A$1", "Ada", ""],
      ["Sheet 2", "$C$2", "ada", '="ada"'],
    ]);
    expect(find_all.querySelector(".sheetwrite-find-results-status")!.textContent).toBe(
      "2 cells found",
    );

    (rows[1] as HTMLElement).click();
    expect(grid.getActiveSheet()).toBe("s2");
    expect(grid.getSelection()).toEqual({ kind: "cell", addr: { sheet: "s2", row: 1, col: 2 } });
    expect(
      find_all.querySelector(".sheetwrite-find-result[aria-selected=true] span")!.textContent,
    ).toBe("Sheet 2");

    bar.destroy();
    grid.destroy();
  });
});

describe("FindBar Replace all preview", () => {
  /** Waits out the preview's debounce. */
  const settle = () => new Promise((resolve) => setTimeout(resolve, 200));

  it("shows what Replace all will change before it applies, as one undo step", async () => {
    const { host, grid, bar, field, click, typeInto: type_into } = mount(PEOPLE);
    grid.applyTransaction({
      patches: [{ op: "set", addr: A(1, 2), value: { kind: "formula", src: '="Ada"' } }],
    });
    bar.open({ replace: true });
    const preview = host.querySelector<HTMLElement>(".sheetwrite-find-preview")!;
    const status = () => preview.querySelector(".sheetwrite-find-results-status")!.textContent;
    type_into(field("input"), "Ada");
    type_into(field("replace-input"), "Grace");
    await settle();

    expect(status()).toBe("3 cells, 1 of them a formula");
    const rows = [
      ...preview.querySelectorAll(".sheetwrite-find-results-list .sheetwrite-find-result"),
    ];
    expect(rows.map((row) => [...row.children].map((cell) => cell.textContent))).toEqual([
      ["Sheet 1", "$A$1", "Ada", "Grace"],
      ["Sheet 1", "$C$2", '="Ada"', '="Grace"'],
      ["Sheet 1", "$A$3", "Ada", "Grace"],
    ]);
    expect(value(grid, 0)).toBe("Ada");

    click("replace-all");
    expect(grid.store.getFormula(A(1, 2))).toBe('="Grace"');
    await settle();
    expect(status()).toBe("Nothing to replace");
    grid.actions.undo();
    expect(value(grid, 0)).toBe("Ada");
    expect(grid.store.getFormula(A(1, 2))).toBe('="Ada"');
  });

  it("plans the preview once typing pauses, not on every key", async () => {
    const {
      grid,
      bar,
      field,
      typeInto: type_into,
    } = mount({
      rowCount: 2,
      columns: { name: ["Ada", "Bob"], amount: [1, 2], city: ["", ""] },
    });
    let plans = 0;
    const preview = grid.previewReplaceAll.bind(grid);
    grid.previewReplaceAll = (replacement) => {
      plans += 1;
      return preview(replacement);
    };
    bar.open({ replace: true });
    type_into(field("input"), "Ada");
    for (const text of ["G", "Gr", "Gra"]) type_into(field("replace-input"), text);
    expect(plans).toBe(0);
    await settle();
    expect(plans).toBe(1);
  });
});

describe("Find in numbers with a number format", () => {
  it("matches the formula bar's text or the shown text, as Excel's Look in does", () => {
    const workbook = makeWorkbook(4);
    workbook.sheets[0]!.columns[1] = {
      key: "amount",
      header: "Amount",
      width: 120,
      type: "general",
    };
    const { grid } = mount(
      {
        rowCount: 4,
        columns: {
          name: ["a", "b", "c", "d"],
          amount: [46037, 0.15, 4.5, 0.15],
          city: ["", "", "", ""],
        },
      },
      workbook,
    );
    const format = (row: number, number_format: string) =>
      grid.applyTransaction({
        patches: [
          {
            op: "setRangeStyle",
            range: { sheet: "s1", start: A(row, 1), end: A(row, 1) },
            style: { numberFormat: number_format },
          },
        ],
      });
    ["m/d/yyyy", "0%", "$#,##0.00"].forEach((number_format, row) => format(row, number_format));
    const rows = (query: string, look_in: "formulas" | "values") =>
      grid.search(query, { lookIn: look_in }).matches.map((match) => match.row);

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
    expect(grid.store.getCell(A(0, 1))).toMatchObject({
      resolved: 46038,
      style: { numberFormat: "m/d/yyyy" },
    });

    // A number format given to a found cell takes it out of the open search.
    expect(rows("4.5", "formulas")).toEqual([2]);
    let latest: number[] | undefined;
    grid.on("search", (event) => {
      latest = event.matches.map((match) => match.row);
    });
    format(2, "0.0%");
    expect(latest).toEqual([]);
  });
});
