---
"@sheetwrite/xlsx": patch
---

Keep formulas whose table columns have numeric or file-like names, such as `=SUM(Sales[2023])` or `Sales[report.xlsx]`, as formulas on import and export. Before, any `[digits]` or `[name.xlsx]` counted as a reference to another workbook, so the cell became inert text and table formulas were dropped. External-workbook references (`[1]Data!A1`, `[Budget.xlsx]Data!A1`, `'C:\Books\[Budget.xlsx]Data'!A1`) are still neutralized.
