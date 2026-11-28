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

let restore_stubs: () => void;
const grids: Grid[] = [];
beforeEach(() => {
  restore_stubs = installCanvasTestStubs();
});
afterEach(() => {
  for (const grid of grids.splice(0)) grid.destroy();
  restore_stubs();
});

const link = (book: string, value: number): ExternalLink => ({
  book,
  target: `https://files.example/${book}`,
  sheets: [{ name: "Annual", cells: [{ row: 0, col: 0, value }] }],
});

/** A grid whose B1 and B2 read the A1 cell of two linked workbooks. */
function linked_grid(): Grid {
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
    const grid = linked_grid();
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
    const grid = linked_grid();
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
    const grid = linked_grid();
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

  it("changes the source of and breaks formulas that use a name of the link", () => {
    const grid = linked_grid();
    const links = grid.store.getWorkbook().externalLinks ?? [];
    grid.applyTransaction({
      patches: [
        {
          op: "setExternalLinks",
          links: links.map((entry) => ({
            ...entry,
            names: [{ name: "Total", refersTo: "=Annual!$A$1" }],
          })),
        },
        { op: "set", addr: at(2), value: { kind: "formula", src: "=Sales.xlsx!Total+1" } },
      ],
    });
    expect(shown(grid, 2)).toBe(6);

    expect(
      changeExternalLinkSource(grid, "Sales.xlsx", { book: "Q 1.xlsx", target: "Q1.xlsx" }),
    ).toBe(true);
    expect(grid.store.getFormula(at(2))).toBe("='Q 1.xlsx'!Total+1");
    expect(shown(grid, 2)).toBe(6);

    expect(breakExternalLinks(grid, ["Q 1.xlsx"])).toBe(true);
    expect(grid.store.getFormula(at(2))).toBeNull();
    expect(shown(grid, 2)).toBe(6);
  });

  it("reads a link that is added after the formula", () => {
    const grid = linked_grid();
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

  it("gives a refreshed link new, cleared and error values, and undoes them", () => {
    const grid = linked_grid();
    const sales = link("Sales.xlsx", 5);
    const budget = (
      cells: Array<[number, ExternalLink["sheets"][number]["cells"][number]["value"]]>,
    ) => ({
      ...link("Budget.xlsx", 0),
      sheets: [{ name: "Annual", cells: cells.map(([row, value]) => ({ row, col: 0, value })) }],
    });
    const refresh = (links: ExternalLink[]) =>
      grid.applyTransaction({ patches: [{ op: "setExternalLinks", links }] }).status;
    expect(
      refresh([
        budget([
          [0, 7],
          [1, 8],
          [2, 9],
        ]),
        sales,
      ]),
    ).toBe("applied");
    grid.applyTransaction({
      patches: [
        { op: "set", addr: at(2), value: { kind: "formula", src: "=[Budget.xlsx]Annual!A2" } },
        { op: "set", addr: at(3), value: { kind: "formula", src: "=[Budget.xlsx]Annual!A3" } },
      ],
    });
    expect([shown(grid, 0), shown(grid, 2), shown(grid, 3)]).toEqual([7, 8, 9]);

    // Same sheets and extent: A1 becomes an error, A2 is left out and reads as 0, A3 changes.
    expect(
      refresh([
        budget([
          [0, { error: "#N/A" }],
          [2, 19],
        ]),
        sales,
      ]),
    ).toBe("applied");
    expect([shown(grid, 0), shown(grid, 2), shown(grid, 3), shown(grid, 1)]).toEqual([
      "#N/A",
      0,
      19,
      10,
    ]);

    grid.undo();
    expect([shown(grid, 0), shown(grid, 2), shown(grid, 3)]).toEqual([7, 8, 9]);
  });

  it("reads a refreshed link whose values reach past its old extent", () => {
    const grid = linked_grid();
    grid.applyTransaction({
      patches: [
        { op: "set", addr: at(2), value: { kind: "formula", src: "=[Budget.xlsx]Annual!A3" } },
      ],
    });
    expect(shown(grid, 2)).toBe("#REF!");

    const links = grid.store.getWorkbook().externalLinks ?? [];
    const grown = links.map((entry) =>
      entry.book === "Budget.xlsx"
        ? { ...entry, sheets: [{ name: "Annual", cells: [{ row: 2, col: 0, value: 4 }] }] }
        : entry,
    );
    grid.applyTransaction({ patches: [{ op: "setExternalLinks", links: grown }] });
    expect([shown(grid, 0), shown(grid, 2)]).toEqual([0, 4]);
  });
});
