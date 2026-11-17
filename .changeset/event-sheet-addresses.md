---
"@sheetwrite/core": minor
---

The `edit-begin` and `edit-commit` events carry `sheetAddress`, and the `selection` event `sheetFocus`: the cell in sheet rows next to the view-row address they already report. Under a filter, hidden rows or a view sort the two differ; use the sheet address to store or look up data.
