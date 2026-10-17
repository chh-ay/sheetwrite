// The full engine is selected once per process, so it has its own runtime check.
import { initSheetwrite, SheetwriteStore } from "@sheetwrite/core";
import * as formulas from "@sheetwrite/formulas";

await initSheetwrite(undefined, formulas);

const rows = 3;
const store = new SheetwriteStore(
  {
    activeSheet: "s1",
    sheets: [
      {
        id: "s1",
        name: "Sheet1",
        rowCount: rows,
        columns: [
          { key: "value", header: "Value", width: 80, type: "number" },
          { key: "result", header: "Result", width: 80, type: "number" },
        ],
      },
    ],
  },
  { rowCount: rows, columns: { value: Float64Array.from([2, 4, 9]) } },
);
store.applyTransaction({
  patches: [
    {
      op: "set",
      addr: { sheet: "s1", row: 0, col: 1 },
      value: { kind: "formula", src: "=REDUCE(0,A1:A3,LAMBDA(total,x,total+x))" },
    },
  ],
});
const result = store.getCell({ sheet: "s1", row: 0, col: 1 }).resolved;
if (result !== 15) {
  throw new Error(`The packed full engine returned ${JSON.stringify(result)} instead of 15`);
}
store.dispose();
console.log("Packed full formula engine check passed");
