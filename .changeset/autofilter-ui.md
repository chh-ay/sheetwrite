---
"@sheetwrite/core": minor
"@sheetwrite/wasm": minor
---

Excel's AutoFilter in the grid. Data › Filter, Ctrl+Shift+L and `grid.actions.toggleAutoFilter()` turn filter buttons on for the table, selected range or current region around the focus cell, and off again. Each header cell of the range shows a button, a funnel when its column is filtered. The button, or Alt+Down on the header cell, opens a dropdown: sort, Clear Filter From, Number, Text or Date Filters with Excel's Custom AutoFilter dialog, and a searchable value list with (Select All) and (Blanks). It lists the values of the rows the other columns' filters keep, as Excel does. The dropdown is a labelled dialog with a multi-select listbox, fully usable from the keyboard, and loads on first open.

Data › Clear and Reapply, `clearFilters()`, `reapplyFilter()` and `filterBySelection()` join the ribbon, and a Filter submenu (filter by the selected cell's value, reapply, clear the column's filter) joins the cell context menu. Filtering keeps the selection on the header, and while a filter or hidden rows hide rows, row headers show the sheet's row numbers, as in Excel.
