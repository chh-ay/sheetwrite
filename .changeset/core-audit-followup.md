---
"@sheetwrite/core": patch
---

Fix more bugs from the 0.6.0 audit:

- Pasting `-5` or `+1` from HTML (Excel, Google Sheets) into a number column stores a number. Only text that would become a formula gets a leading quote.
- A row or column delete shrinks a conditional-format formula range whose edge was deleted (`=SUM(A1:B4)` becomes `=SUM(A1:B2)`). Only a range with no rows or columns left becomes `#REF!`.
- The formula bar keeps a pasted or dropped draft when the grid refreshes.
- Formula reference highlights skip text in quotes and references to other sheets.
- A cell edit no longer closes an open sheet tab menu in the spreadsheet shell.
- Auto-fit row height from the menu fits the selected row under a sort or filter.
- Search over a custom store reports data rows when the store offers `getDataWindow`.
- A failed PivotTable placement shows its error in the form instead of an unhandled rejection.
- A toolbar or ribbon that cannot load tells the user why in the grid's alert. The load error still reaches the host.
- A row bridge clear lists only the cells that changed, so clearing whole columns no longer creates one object per empty cell.
- Disposing a store ends an engine memory release that was waiting for its page loads.
