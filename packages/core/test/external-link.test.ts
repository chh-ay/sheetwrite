import { beforeAll, describe, expect, it } from "bun:test";

import {
  type ExternalLink,
  type ExternalLinkCell,
  type ExternalLinkName,
  initSheetwrite,
  SheetwriteStore,
  validateWorkbookSnapshot,
  type WorkbookSnapshot,
} from "../src/index.js";
import { makeWorkbook } from "./fixtures.js";

beforeAll(async () => {
  await initSheetwrite();
});

const budget: ExternalLink = {
  book: "Budget.xlsx",
  target: "file:///C:/Reports/Budget.xlsx",
  sheets: [
    {
      name: "Annual",
      cells: [
        { row: 9, col: 2, value: 7 },
        { row: 10, col: 2, value: 5 },
        { row: 11, col: 2, value: "North" },
        { row: 12, col: 2, value: true },
        { row: 13, col: 2, value: { error: "#N/A" } },
      ],
    },
  ],
};

/** Names that `Budget.xlsx` defines, as its link part saves them. */
const names: ExternalLinkName[] = [
  { name: "Total", refersTo: "=Annual!$C$10" },
  { name: "Both", refersTo: "=Annual!$C$10:$C$11" },
  { name: "Local", refersTo: "=Annual!$C$11", sheet: "Annual" },
];

function linkedStore(externalLinks: ExternalLink[] | undefined): SheetwriteStore {
  const workbook = makeWorkbook(8);
  if (externalLinks) workbook.externalLinks = externalLinks;
  return new SheetwriteStore(workbook);
}

function resolvedAfter(store: SheetwriteStore, src: string): unknown {
  const addr = { sheet: "s1", row: 0, col: 1 };
  store.applyTransaction({ patches: [{ op: "set", addr, value: { kind: "formula", src } }] });
  return store.getCell(addr).resolved;
}

describe("external workbook links", () => {
  it("shows the saved values of a linked workbook in formulas", () => {
    const store = linkedStore([budget]);
    try {
      expect(resolvedAfter(store, "=SUM([Budget.xlsx]Annual!C10:C11)")).toBe(12);
      expect(resolvedAfter(store, "=[Budget.xlsx]Annual!C12")).toBe("North");
      expect(resolvedAfter(store, "=[Budget.xlsx]Annual!C13")).toBe(true);
      expect(resolvedAfter(store, "=ISNA([Budget.xlsx]Annual!C14)")).toBe(true);
      expect(resolvedAfter(store, "=[Sales.xlsx]Annual!C10")).toBe("#REF!");
    } finally {
      store.dispose();
    }
  });

  // Microsoft, "Create workbook links": a formula uses a defined name of
  // another workbook as `=SUM(Budget.xlsx!Sales)`, and shows the values the
  // link saved for it.
  it("reads the defined names of a linked workbook from its saved values", () => {
    const store = linkedStore([{ ...budget, names }]);
    try {
      expect(resolvedAfter(store, "=Budget.xlsx!Total*2")).toBe(14);
      expect(resolvedAfter(store, "=SUM('C:\\Reports\\Budget.xlsx'!Both)")).toBe(12);
      expect(resolvedAfter(store, "=[Budget.xlsx]Annual!Local")).toBe(5);
      expect(resolvedAfter(store, "=Budget.xlsx!Missing")).toBe("#REF!");
      expect(store.exportSnapshot().workbook.externalLinks).toEqual([{ ...budget, names }]);
    } finally {
      store.dispose();
    }

    // Without values for the link, a name is `#REF!`, as in Excel.
    const unlinked = linkedStore(undefined);
    try {
      expect(resolvedAfter(unlinked, "=Budget.xlsx!Total")).toBe("#REF!");
    } finally {
      unlinked.dispose();
    }
  });

  it("keeps the links in snapshots and drops an empty list", () => {
    const store = linkedStore([budget]);
    const empty = linkedStore([]);
    try {
      expect(store.exportSnapshot().workbook.externalLinks).toEqual([budget]);
      expect(empty.exportSnapshot().workbook.externalLinks).toBeUndefined();
    } finally {
      store.dispose();
      empty.dispose();
    }
  });

  it("rejects links that the engine cannot hold", () => {
    const snapshot = (externalLinks: unknown): WorkbookSnapshot => {
      const workbook = makeWorkbook(1);
      // The validator receives untrusted data, so the cast is the point of the test.
      return {
        schemaVersion: 1,
        workbook: { activeSheet: "s1", externalLinks },
        sheets: [{ ...workbook.sheets[0]!, order: 0, cells: [] }],
      } as unknown as WorkbookSnapshot;
    };
    expect(validateWorkbookSnapshot(snapshot([budget])).ok).toBe(true);
    for (const invalid of [
      {},
      [{ ...budget, book: "[Budget.xlsx]" }],
      [budget, { ...budget, book: "budget.XLSX" }],
      [{ ...budget, sheets: [{ name: "Annual" }] }],
    ]) {
      expect(validateWorkbookSnapshot(snapshot(invalid)).ok).toBe(false);
    }
    expect(validateWorkbookSnapshot(snapshot([{ ...budget, names }])).ok).toBe(true);
    for (const invalid of [
      [{ ...budget, names: {} }],
      [{ ...budget, names: [{ name: "Total" }] }],
      [{ ...budget, names: [{ name: "Total", refersTo: "=Annual!$C$10", sheet: 1 }] }],
    ]) {
      expect(validateWorkbookSnapshot(snapshot(invalid)).ok).toBe(false);
    }

    // The store checks each saved cell when it gives the links to the engine.
    const withCell = (row: number, col: number, value: unknown): ExternalLink[] => [
      // The store receives untrusted values, so the cast is the point of the test.
      { ...budget, sheets: [{ name: "Annual", cells: [{ row, col, value } as ExternalLinkCell] }] },
    ];
    for (const links of [
      withCell(0, 0, { error: "#BUSY!" }),
      withCell(0, 0, Number.NaN),
      withCell(1_048_576, 0, 1),
      // The engine holds a linked sheet from A1 to its last cell.
      withCell(999_999, 9, 1),
    ]) {
      expect(() => linkedStore(links)).toThrow(
        expect.objectContaining({ code: "invalid-snapshot" }),
      );
    }
  });
});
