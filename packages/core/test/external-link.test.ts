import { beforeAll, describe, expect, it } from "bun:test";

import {
  type ExternalLink,
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
    const withCell = (value: unknown, row = 0): unknown => [
      { ...budget, sheets: [{ name: "Annual", cells: [{ row, col: 0, value }] }] },
    ];

    expect(validateWorkbookSnapshot(snapshot([budget])).ok).toBe(true);
    for (const invalid of [
      {},
      [{ ...budget, book: "[Budget.xlsx]" }],
      [budget, { ...budget, book: "budget.XLSX" }],
      withCell({ error: "#BUSY!" }),
      withCell(Number.NaN),
      withCell(1, 1_048_576),
      // The engine holds a linked sheet from A1 to its last cell.
      [{ ...budget, sheets: [{ name: "Annual", cells: [{ row: 999_999, col: 9, value: 1 }] }] }],
    ]) {
      expect(validateWorkbookSnapshot(snapshot(invalid)).ok).toBe(false);
    }
  });
});
