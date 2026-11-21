---
"@sheetwrite/core": minor
---

The Name Box goes to a cell on a row a filter or Hide Rows hides, as Excel's does. Before, it refused the cell. The cell becomes the active cell without a selection on screen. The formula bar shows and edits it, typing or F2 edits it there, and Delete clears it. Up, Down, Enter and Shift+Enter go to the nearest row that shows; Left, Right and Tab stay on its row. Once a filter change shows the row, the cell is selected.

New `Grid` methods: `goToCell(addr)` makes a sheet cell the active cell, shown or hidden. `getActiveSheetCell()` returns the active cell in sheet rows. `getActiveCellInput()` returns its editable snapshot. While a hidden cell is active, the `selection` event reports `selection: null` and names the cell in `sheetFocus`.
