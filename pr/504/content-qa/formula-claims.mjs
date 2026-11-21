// QA script: checks formula behaviour that docs pages state, on the built
// packages, in Node, with both engines.
//
//   node formula-claims.mjs   (run from a directory that resolves @sheetwrite/*)
import { initSheetwrite, SheetwriteStore } from "@sheetwrite/core";
import * as formulas from "@sheetwrite/formulas";

const ENGINE = process.argv[2] === "full" ? formulas : undefined;
await initSheetwrite(ENGINE === undefined ? undefined : { engine: ENGINE });

const ROWS = 6;
const workbook = {
  activeSheet: "s1",
  sheets: [
    {
      id: "s1",
      name: "Sheet1",
      rowCount: ROWS,
      columns: ["a", "b", "c", "d"].map((key) => ({ key, header: key.toUpperCase(), type: "general", width: 80 })),
    },
  ],
};
// A1:A3 = 1,2,3 ; B1:B3 = 10,20,30 ; C1:C2 = 5,6 ; D1:D2 = 7,8
const column = (values) => Array.from({ length: ROWS }, (_, row) => values[row] ?? null);
const store = new SheetwriteStore(workbook, {
  rowCount: ROWS,
  columns: { a: column([1, 2, 3]), b: column([10, 20, 30]), c: column([5, 6]), d: column([7, 8]) },
});

const CLAIMS = [
  {
    page: "features/formulas/lookup-criteria-and-financial.md:71",
    claim: "SUMIF sum range must have exactly the criteria range's shape (no top-left extension)",
    formula: '=SUMIF(A1:A3,">0",B1)',
  },
  {
    page: "features/formulas/lookup-criteria-and-financial.md:90",
    claim: "INDEX with a zero row returns #VALUE!",
    formula: "=INDEX(A1:B3,0,2)",
  },
  {
    page: "features/formulas/operators.md:110 / concepts/calculation-engine.md:72",
    claim: "A space intersection with no overlap returns #NULL!",
    formula: "=SUM(A1:A2 C1:C2)",
  },
];

let row = 4;
for (const claim of CLAIMS) {
  const addr = { sheet: "s1", row, col: 0 };
  store.applyTransaction({ patches: [{ op: "set", addr, value: { kind: "formula", src: claim.formula } }] });
  const cell = store.getCell(addr);
  const below = store.getCell({ sheet: "s1", row: row + 1, col: 0 });
  process.stdout.write(
    `${JSON.stringify({ engine: ENGINE === undefined ? "default" : "full", ...claim, result: cell.resolved, below: below.resolved })}\n`,
  );
  store.applyTransaction({ patches: [{ op: "set", addr, value: null }] });
  row = 4;
}
