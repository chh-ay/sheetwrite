---
"@sheetwrite/core": minor
"@sheetwrite/wasm": minor
"@sheetwrite/formulas": minor
---

Sort commands rewrite the cells, as Excel does; the view sort stays as an option.

- Sort A to Z and Sort Z to A (ribbon, compact ribbon, toolbar and the column context menu) and `grid.sortBy(col, ascending)` run Excel's quick sort: they sort the cells of the table body that holds the focus cell, or else the selected range, or else the current region around the focus cell. A first row of text over other values stays as a header. One undo restores the cells.
- Data › Custom Sort opens the Sort panel: a range, "My data has headers", up to 64 sort levels, and "Sort view only".
- Sort View A to Z and Sort View Z to A sort the displayed rows without moving cells.
- New: `grid.sortRange(range, keys, { hasHeader })`, `grid.setViewSort(keys)`, `store.setViewSort(sheet, keys)`, the `sortView` and `customSort` grid actions, the `sortAscending`, `sortDescending`, `sortViewAscending` and `sortViewDescending` context-menu actions, and the `sortCustom` and `sortView` icons.

Breaking changes:

- Changed: `grid.sortBy(col, ascending)` now sorts the cells in place; for the display-only sort, use `grid.setViewSort([{ col, ascending }])` instead.
- Removed: `store.sortBy(sheet, col, ascending)`; use `store.setViewSort(sheet, [{ col, ascending }])` instead.
- Removed: `store.sortByMulti(sheet, keys)`; use `store.setViewSort(sheet, keys)` instead.
- Removed: `grid.setSort(keys)`; use `grid.setViewSort(keys)` instead.
- Removed: `grid.sortByMulti(keys)`; use `grid.setViewSort(keys)` instead.
