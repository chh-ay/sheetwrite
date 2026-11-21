// QA script: checks the "Add a total" step of start/first-grid against the
// workbook the page builds, and an alternative that adds the total below.
import { initSheetwrite, SheetwriteStore } from "@sheetwrite/core";

await initSheetwrite();
function salesStore(rowCount) {
  const workbook = {
    activeSheet: "sales",
    sheets: [{ id: "sales", name: "Sales", rowCount, columns: [
      { key: "product", header: "Product", width: 180, type: "text" },
      { key: "amount", header: "Amount", width: 100, type: "number" },
    ] }],
  };
  return new SheetwriteStore(workbook, { rowCount: 3, columns: { product: ["Notebook", "Pen", "Folder"], amount: new Float64Array([12, 4, 9]) } });
}
const page = salesStore(3);
const pageResult = page.applyTransaction({ patches: [{ op: "set", addr: { sheet: "sales", row: 2, col: 1 }, value: { kind: "formula", src: "=SUM(B1:B2)" } }] });
process.stdout.write(`page step: status=${pageResult.status} B3=${page.getCell({ sheet: "sales", row: 2, col: 1 }).resolved} A3=${page.getCell({ sheet: "sales", row: 2, col: 0 }).resolved}\n`);
const below = salesStore(3);
const belowResult = below.applyTransaction({ patches: [{ op: "set", addr: { sheet: "sales", row: 3, col: 1 }, value: { kind: "formula", src: "=SUM(B1:B3)" } }] });
process.stdout.write(`row 4 on a 3-row sheet: status=${belowResult.status} B4=${below.getCell({ sheet: "sales", row: 3, col: 1 }).resolved}\n`);
const fourRows = salesStore(4);
const fourResult = fourRows.applyTransaction({ patches: [
  { op: "set", addr: { sheet: "sales", row: 3, col: 0 }, value: { kind: "literal", value: "Total" } },
  { op: "set", addr: { sheet: "sales", row: 3, col: 1 }, value: { kind: "formula", src: "=SUM(B1:B3)" } },
] });
process.stdout.write(`4-row sheet, total in row 4: status=${fourResult.status} A4=${fourRows.getCell({ sheet: "sales", row: 3, col: 0 }).resolved} B4=${fourRows.getCell({ sheet: "sales", row: 3, col: 1 }).resolved} B3=${fourRows.getCell({ sheet: "sales", row: 2, col: 1 }).resolved}\n`);
