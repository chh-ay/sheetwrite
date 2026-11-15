import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";

import { validateWorkbookSnapshot } from "../src/document-protocol.js";
import { GridImpl, initSheetwrite } from "../src/grid.js";
import { SheetwriteStore } from "../src/store.js";
import { installCanvasTestStubs } from "../src/testing.js";
import type {
  CellScalar,
  ColumnFilter,
  FilterCondition,
  Range,
  WorkbookSnapshot,
} from "../src/types.js";

let restoreStubs: () => void;
const disposers: (() => void)[] = [];

beforeAll(async () => {
  await initSheetwrite();
});

beforeEach(() => {
  restoreStubs = installCanvasTestStubs();
});

afterEach(() => {
  for (const dispose of disposers.splice(0).reverse()) dispose();
  restoreStubs();
  document.body.replaceChildren();
});

const ROWS: (readonly CellScalar[])[] = [
  ["Title", null],
  ["Item", "Qty"],
  ["apple", 3],
  ["Apricot", 12],
  ["banana", 7],
  ["fig", null],
  ["grape", 20],
  ["Total", 42],
];

/** A title row, then A2:B7 with a header and five items, then a total row below. */
function snapshot(): WorkbookSnapshot {
  return {
    schemaVersion: 1,
    workbook: { activeSheet: "s1" },
    sheets: [
      {
        id: "s1",
        name: "Orders",
        order: 0,
        rowCount: ROWS.length,
        columns: [
          { key: "item", header: "A", width: 80, type: "text" },
          { key: "qty", header: "B", width: 80, type: "number" },
        ],
        cells: [
          {
            startRow: 0,
            startCol: 0,
            rowCount: ROWS.length,
            colCount: 2,
            cells: ROWS.flatMap((row, rowOffset) =>
              row.flatMap((value, colOffset) =>
                value === null
                  ? []
                  : [{ rowOffset, colOffset, value: { kind: "literal" as const, value } }],
              ),
            ),
          },
        ],
      },
    ],
  };
}

const RANGE: Range = { sheet: "s1", start: { row: 1, col: 0 }, end: { row: 6, col: 1 } };

function mount(): { grid: GridImpl; store: SheetwriteStore } {
  const store = SheetwriteStore.fromSnapshot(snapshot());
  const host = document.createElement("div");
  Object.defineProperty(host, "clientWidth", { value: 640, configurable: true });
  Object.defineProperty(host, "clientHeight", { value: 320, configurable: true });
  document.body.appendChild(host);
  const grid = new GridImpl(host, { workbook: store.getWorkbook() }, store);
  disposers.push(
    () => store.dispose(),
    () => grid.destroy(),
  );
  return { grid, store };
}

/** The first-column text of every shown row, top to bottom. */
function shown(store: SheetwriteStore): CellScalar[] {
  return Array.from({ length: store.viewRowCount("s1") }, (_unused, viewRow) => {
    const row = store.dataRowAt("s1", viewRow);
    return store.getCell({ sheet: "s1", row, col: 0 }).resolved;
  });
}

const custom = (
  join: "and" | "or",
  ...conditions: [FilterCondition] | [FilterCondition, FilterCondition]
): ColumnFilter => ({ kind: "custom", join, conditions });

describe("AutoFilter", () => {
  it("filters only the range's rows below its header", () => {
    const { grid, store } = mount();
    expect(grid.setAutoFilter(RANGE).status).toBe("applied");
    grid.setColumnFilter(1, { kind: "compare", op: "gt", value: 5 });

    // The title above, the header and the total row below always show.
    expect(shown(store)).toEqual(["Title", "Item", "Apricot", "banana", "grape", "Total"]);
    expect(grid.getAutoFilter()).toEqual({ range: RANGE });
  });

  it("filters with Excel's custom conditions", () => {
    const { grid, store } = mount();
    grid.setAutoFilter(RANGE);
    const items = (filter: ColumnFilter) => {
      grid.setColumnFilter(0, filter);
      return shown(store).slice(2, -1);
    };

    expect(items(custom("and", { op: "beginsWith", value: "a" }))).toEqual(["apple", "Apricot"]);
    expect(items(custom("and", { op: "endsWith", value: "e" }))).toEqual(["apple", "grape"]);
    expect(items(custom("and", { op: "contains", value: "an" }))).toEqual(["banana"]);
    expect(items(custom("and", { op: "notContains", value: "p" }))).toEqual(["banana", "fig"]);
    expect(items(custom("or", { op: "eq", value: "fig" }, { op: "eq", value: "GRAPE" }))).toEqual([
      "fig",
      "grape",
    ]);
    grid.setColumnFilter(0, null);
    grid.setColumnFilter(1, custom("and", { op: "gte", value: 5 }, { op: "lt", value: 20 }));
    expect(shown(store).slice(2, -1)).toEqual(["Apricot", "banana"]);
  });

  it("turns on and off as one undo step each, clearing the filters", () => {
    const { grid, store } = mount();
    grid.setAutoFilter(RANGE);
    grid.setColumnFilter(1, { kind: "empty" });
    expect(shown(store)).toEqual(["Title", "Item", "fig", "Total"]);

    grid.setAutoFilter(null);
    expect(grid.getAutoFilter()).toBeNull();
    expect(grid.getColumnFilters().size).toBe(0);
    expect(shown(store)).toHaveLength(ROWS.length);

    grid.undo();
    expect(grid.getAutoFilter()).toEqual({ range: RANGE });
    expect(shown(store)).toEqual(["Title", "Item", "fig", "Total"]);
    grid.redo();
    expect(grid.getAutoFilter()).toBeNull();
  });

  it("filters again only on Reapply, as Excel does", () => {
    const { grid, store } = mount();
    grid.setAutoFilter(RANGE);
    grid.setColumnFilter(1, { kind: "compare", op: "gt", value: 5 });
    grid.applyTransaction({
      patches: [
        { op: "set", addr: { sheet: "s1", row: 4, col: 1 }, value: { kind: "literal", value: 1 } },
      ],
    });
    expect(shown(store)).toContain("banana");

    expect(grid.reapplyFilter().status).toBe("applied");
    expect(shown(store)).not.toContain("banana");
  });

  it("moves with inserted rows and columns, and goes with its header row", () => {
    const { grid } = mount();
    grid.setAutoFilter(RANGE);
    grid.setColumnFilter(1, { kind: "nonEmpty" });

    grid.insertRows(0, 2);
    grid.insertColumns(0);
    expect(grid.getAutoFilter()?.range).toEqual({
      sheet: "s1",
      start: { row: 3, col: 1 },
      end: { row: 8, col: 2 },
    });
    expect([...grid.getColumnFilters().keys()]).toEqual([2]);

    grid.removeRows(3);
    expect(grid.getAutoFilter()).toBeNull();
    grid.undo();
    expect(grid.getAutoFilter()?.range.start).toEqual({ row: 3, col: 1 });
    expect([...grid.getColumnFilters().keys()]).toEqual([2]);
  });

  it("saves with the snapshot and rejects a range outside its sheet", () => {
    const { grid, store } = mount();
    grid.setAutoFilter(RANGE);
    grid.setColumnFilter(0, custom("and", { op: "beginsWith", value: "a" }));

    const saved = store.exportSnapshot();
    const reloaded = SheetwriteStore.fromSnapshot(saved);
    disposers.push(() => reloaded.dispose());
    expect(reloaded.exportSnapshot().sheets[0]?.autoFilter).toEqual({ range: RANGE });
    expect(shown(reloaded)).toEqual(["Title", "Item", "apple", "Apricot", "Total"]);

    const outside = structuredClone(saved);
    outside.sheets[0]!.autoFilter = { range: { ...RANGE, end: { row: 99, col: 1 } } };
    expect(validateWorkbookSnapshot(outside).ok).toBe(false);
    // A range given bottom-up would repeat rows in the view; it is refused.
    const reversed = structuredClone(saved);
    reversed.sheets[0]!.autoFilter = {
      range: { sheet: "s1", start: { row: 6, col: 1 }, end: { row: 1, col: 0 } },
    };
    expect(validateWorkbookSnapshot(reversed).ok).toBe(false);
    const badCondition = structuredClone(saved);
    badCondition.sheets[0]!.filters = [
      [0, { kind: "custom", join: "and", conditions: [{ op: "contains", value: 3 }] }],
    ];
    expect(validateWorkbookSnapshot(badCondition).ok).toBe(false);
  });
});
