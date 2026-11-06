import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";

import {
  breakExternalLinks,
  changeExternalLinkSource,
  updateExternalLinks,
} from "../src/external-links.js";
import { createGrid, type ExternalLink, type Grid, initSheetwrite } from "../src/index.js";
import { installCanvasTestStubs } from "../src/testing.js";
import { makeWorkbook } from "./fixtures.js";

beforeAll(async () => {
  await initSheetwrite();
});

let restoreStubs: () => void;
const grids: Grid[] = [];
beforeEach(() => {
  restoreStubs = installCanvasTestStubs();
});
afterEach(() => {
  for (const grid of grids.splice(0)) grid.destroy();
  restoreStubs();
});

const link = (book: string, value: number): ExternalLink => ({
  book,
  target: `https://files.example/${book}`,
  sheets: [{ name: "Annual", cells: [{ row: 0, col: 0, value }] }],
});

/** A grid whose B1 and B2 read the A1 cell of two linked workbooks. */
function linkedGrid(): Grid {
  const workbook = makeWorkbook(4);
  workbook.externalLinks = [link("Budget.xlsx", 7), link("Sales.xlsx", 5)];
  const host = document.createElement("div");
  document.body.appendChild(host);
  const grid = createGrid(host, { workbook });
  grids.push(grid);
  grid.applyTransaction({
    patches: [
      { op: "set", addr: at(0), value: { kind: "formula", src: "=[Budget.xlsx]Annual!A1" } },
      {
        op: "set",
        addr: at(1),
        value: { kind: "formula", src: "='C:\\Reports\\[Sales.xlsx]Annual'!A1*2" },
      },
    ],
  });
  return grid;
}

const at = (row: number) => ({ sheet: "s1", row, col: 1 });
const shown = (grid: Grid, row: number) => grid.store.getCell(at(row)).resolved;

describe("external link commands", () => {
  it("updates values from the resolver in one undoable change", async () => {
    const grid = linkedGrid();
    const updates = await updateExternalLinks(grid, async ({ book, sheets }) => {
      if (book === "Sales.xlsx") return null;
      expect(sheets).toEqual(["Annual"]);
      return [{ name: "Annual", cells: [{ row: 0, col: 0, value: 9 }] }];
    });

    expect(updates).toEqual([
      { book: "Budget.xlsx", status: "updated" },
      { book: "Sales.xlsx", status: "unavailable" },
    ]);
    expect(shown(grid, 0)).toBe(9);
    expect(shown(grid, 1)).toBe(10);

    const failed = await updateExternalLinks(grid, () => Promise.reject(new Error("offline")), [
      "budget.xlsx",
    ]);
    expect(failed.map((update) => [update.status, update.error?.code])).toEqual([
      ["failed", "datasource-request-failed"],
    ]);
    expect(shown(grid, 0)).toBe(9);

    grid.undo();
    expect(shown(grid, 0)).toBe(7);
  });

  it("points formulas at another workbook and keeps the saved values", () => {
    const grid = linkedGrid();
    expect(
      changeExternalLinkSource(grid, "sales.xlsx", { book: "Q1.xlsx", target: "Q1.xlsx" }),
    ).toBe(true);

    expect(grid.store.getFormula(at(1))).toBe("=[Q1.xlsx]Annual!A1*2");
    expect(grid.store.getFormula(at(0))).toBe("=[Budget.xlsx]Annual!A1");
    expect(shown(grid, 1)).toBe(10);
    expect(grid.store.getWorkbook().externalLinks?.map((entry) => entry.book)).toEqual([
      "Budget.xlsx",
      "Q1.xlsx",
    ]);

    grid.undo();
    expect(grid.store.getFormula(at(1))).toBe("='C:\\Reports\\[Sales.xlsx]Annual'!A1*2");
    expect(shown(grid, 1)).toBe(10);
  });

  it("replaces formulas with their values and removes the link", () => {
    const grid = linkedGrid();
    expect(breakExternalLinks(grid, ["Budget.xlsx"])).toBe(true);

    expect(grid.store.getFormula(at(0))).toBeNull();
    expect(shown(grid, 0)).toBe(7);
    expect(grid.store.getWorkbook().externalLinks?.map((entry) => entry.book)).toEqual([
      "Sales.xlsx",
    ]);

    grid.undo();
    expect(grid.store.getFormula(at(0))).toBe("=[Budget.xlsx]Annual!A1");
    expect(shown(grid, 0)).toBe(7);
  });

  it("reads a link that is added after the formula", () => {
    const grid = linkedGrid();
    grid.applyTransaction({
      patches: [
        { op: "set", addr: at(2), value: { kind: "formula", src: "=[New.xlsx]Annual!A1+1" } },
      ],
    });
    expect(shown(grid, 2)).toBe("#REF!");

    const links = grid.store.getWorkbook().externalLinks ?? [];
    grid.applyTransaction({
      patches: [{ op: "setExternalLinks", links: [...links, link("New.xlsx", 3)] }],
    });
    expect(shown(grid, 2)).toBe(4);
    expect(grid.store.getFormula(at(2))).toBe("=[New.xlsx]Annual!A1+1");
  });
});
