---
"@sheetwrite/core": patch
---

The spreadsheet shell's status bar names a selected row by its sheet row, as the row headers do, under a filter or hidden rows; before, it gave the row's place in the view. `describeSelection(selection, sheetRowOf?)` takes the mapping, such as `grid.sheetRowOf`.
