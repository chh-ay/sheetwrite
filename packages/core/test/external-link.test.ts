import { beforeAll, describe, expect, it } from "bun:test";

import {
  formulaCallsExternalData,
  formulaContainsExternalReference,
  rewriteExternalSheets,
} from "../src/external-link-formula.js";
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

function linked_store(external_links: ExternalLink[]): SheetwriteStore {
  const workbook = makeWorkbook(8);
  workbook.externalLinks = external_links;
  return new SheetwriteStore(workbook);
}

function resolved_after(store: SheetwriteStore, src: string): unknown {
  const addr = { sheet: "s1", row: 0, col: 1 };
  store.applyTransaction({ patches: [{ op: "set", addr, value: { kind: "formula", src } }] });
  return store.getCell(addr).resolved;
}

describe("external formula text", () => {
  it("finds other workbooks and live-data calls outside quoted text", () => {
    const live = [
      "DDE",
      "RTD",
      "WEBSERVICE",
      "FILTERXML",
      "CUBEMEMBER",
      "CUBEVALUE",
      "CUBESET",
      "CUBESETCOUNT",
      "CUBERANKEDMEMBER",
    ];
    // [formula, names another workbook or calls live data, calls live data]
    const cases: [formula: string, external: boolean, liveData: boolean][] = [
      ["SUM(A1:B2)", false, false],
      ['IF(C2>500,"high","low")', false, false],
      ['Sheet1!A1+"[x]"', false, false],
      ["'It''s'!A1", false, false],
      ['RTD("prog",,"x")', true, true],
      ['A1&"x"&DDE("a","b")', true, true],
      ['RTD"x"(1)', true, true],
      ["'[1]Sheet 1'!A1", true, false],
      ["[Book.xlsx]Sheet1!A1", true, false],
      ...live.flatMap((name): [string, boolean, boolean][] => [
        [`IF(1,_xlfn.${name.toLowerCase()} ("a"),0)`, true, true],
        [`"${name}(1)"&A1`, false, false],
      ]),
    ];
    for (const [formula, external, live_data] of cases) {
      expect(formulaContainsExternalReference(formula), formula).toBe(external);
      expect(formulaCallsExternalData(formula), formula).toBe(live_data);
    }
  });

  it("rewrites only the names of other workbooks", () => {
    const names: string[] = [];
    const rewrite = (formula: string) =>
      rewriteExternalSheets(formula, ({ book, sheet }) => {
        names.push(`${book}|${sheet}`);
        return sheet ? `[9]${sheet}` : "[9]";
      });

    expect(rewrite('IF(A1>1,"[1]Annual!B2",SUM(B1:C2))')).toBe(
      'IF(A1>1,"[1]Annual!B2",SUM(B1:C2))',
    );
    expect(names).toEqual([]);
    expect(rewrite("[1]Annual!B2+Budget.xlsx!Total+Sheet2!A1+Sales[@Amount]")).toBe(
      "[9]Annual!B2+[9]!Total+Sheet2!A1+Sales[@Amount]",
    );
    expect(names).toEqual(["1|Annual", "Budget.xlsx|"]);
  });
});

describe("external workbook links", () => {
  it("shows the saved values of a linked workbook in formulas", () => {
    const store = linked_store([budget]);
    try {
      expect(resolved_after(store, "=SUM([Budget.xlsx]Annual!C10:C11)")).toBe(12);
      expect(resolved_after(store, "=[Budget.xlsx]Annual!C12")).toBe("North");
      expect(resolved_after(store, "=[Budget.xlsx]Annual!C13")).toBe(true);
      expect(resolved_after(store, "=ISNA([Budget.xlsx]Annual!C14)")).toBe(true);
      expect(resolved_after(store, "=[Sales.xlsx]Annual!C10")).toBe("#REF!");
      expect(store.exportSnapshot().workbook.externalLinks).toEqual([budget]);
    } finally {
      store.dispose();
    }
  });

  // Microsoft, "Create workbook links": a formula uses a defined name of
  // another workbook as `=SUM(Budget.xlsx!Sales)`, and shows the values the
  // link saved for it.
  it("reads the defined names of a linked workbook from its saved values", () => {
    const store = linked_store([{ ...budget, names }]);
    try {
      expect(resolved_after(store, "=Budget.xlsx!Total*2")).toBe(14);
      expect(resolved_after(store, "=SUM('C:\\Reports\\Budget.xlsx'!Both)")).toBe(12);
      expect(resolved_after(store, "=[Budget.xlsx]Annual!Local")).toBe(5);
      expect(resolved_after(store, "=Budget.xlsx!Missing")).toBe("#REF!");
      expect(store.exportSnapshot().workbook.externalLinks).toEqual([{ ...budget, names }]);
    } finally {
      store.dispose();
    }

    // Without values for the link, a name is `#REF!`, as in Excel, and the
    // empty link list is not saved.
    const unlinked = linked_store([]);
    try {
      expect(resolved_after(unlinked, "=Budget.xlsx!Total")).toBe("#REF!");
      expect(unlinked.exportSnapshot().workbook.externalLinks).toBeUndefined();
    } finally {
      unlinked.dispose();
    }
  });

  it("rejects links that the engine cannot hold", () => {
    const snapshot = (external_links: unknown): WorkbookSnapshot => {
      const workbook = makeWorkbook(1);
      // The validator receives untrusted data, so the cast is the point of the test.
      return {
        schemaVersion: 1,
        workbook: { activeSheet: "s1", externalLinks: external_links },
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
    const with_cell = (row: number, col: number, value: unknown): ExternalLink[] => [
      // The store receives untrusted values, so the cast is the point of the test.
      { ...budget, sheets: [{ name: "Annual", cells: [{ row, col, value } as ExternalLinkCell] }] },
    ];
    for (const links of [
      with_cell(0, 0, { error: "#BUSY!" }),
      with_cell(0, 0, Number.NaN),
      with_cell(1_048_576, 0, 1),
      // The engine holds a linked sheet from A1 to its last cell.
      with_cell(999_999, 9, 1),
    ]) {
      expect(() => linked_store(links)).toThrow(
        expect.objectContaining({ code: "invalid-snapshot" }),
      );
    }
  });
});
