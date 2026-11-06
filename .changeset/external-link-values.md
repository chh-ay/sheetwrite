---
"@sheetwrite/wasm": minor
"@sheetwrite/formulas": minor
---

Both engines hold the cached values of linked workbooks (#226). `CellStore.addExternalSheet(book, sheet, columns, rows)` adds a sheet of a linked workbook and returns its handle; the cell setters on that handle set its values. References such as `[Budget.xlsx]Annual!C10` and `SUM('C:\Reports\[Budget.xlsx]Annual'!C10:C25)` read those values. The folder and letter case do not matter. A change to the values recalculates the formulas that read them. A link sheet is not a tab: `SHEETS`, 3-D references and the tab order do not include it. A reference to a link the store does not hold is still `#REF!`.

A quoted reference with a drive in its path, such as `'C:\Reports\[Budget.xlsx]Annual'!C10`, is no longer read as a 3-D reference.
