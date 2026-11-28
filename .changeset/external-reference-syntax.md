---
"@sheetwrite/wasm": minor
"@sheetwrite/formulas": minor
---

Formulas accept references to cells in other workbooks, in Excel's forms: `[Budget.xlsx]Annual!C10`, `SUM([Budget.xlsx]Annual!C10:C25)`, `'[Budget 2024.xlsx]Annual Plan'!C10` and `'C:\Reports\[Budget.xlsx]Annual'!C10` (#226). Before, the unquoted form was a syntax error, and a quoted form made the whole formula `#REF!`. The formula text now stays as written. A copy moves relative references, as in Excel. Row, column and sheet edits in this workbook do not change them. Without values for the other workbook, a reference shows `#REF!`; `IFERROR` and the other error functions handle it as an error value. A sheet of the same name in this workbook is never read in its place.
