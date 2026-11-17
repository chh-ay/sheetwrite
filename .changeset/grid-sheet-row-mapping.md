---
"@sheetwrite/core": minor
---

`grid.sheetRowOf(viewRow)` and `grid.viewRowOf(sheetRow)` map between the view rows that selections, `scrollToCell` and selection events use and the sheet rows of A1 references and the row headers. The two differ while a filter, hidden rows or a view sort change which rows show. Both take constant time; `viewRowOf` returns `null` for a row the view hides.
