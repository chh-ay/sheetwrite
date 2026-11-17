---
"@sheetwrite/core": minor
---

Excel's keys for formats, rows and columns, and the Format Cells dialog:

- Ctrl/Cmd + Shift + ~ ! @ # $ % ^ apply the General, Number, Time, Date, Currency, Percentage and Scientific formats with Excel's codes.
- Ctrl/Cmd + 9 hides the selected rows and Ctrl/Cmd + Shift + 9 shows the hidden rows inside the selection; Ctrl/Cmd + 0 and Ctrl/Cmd + Shift + 0 do the same for columns.
- Ctrl/Cmd + + (Ctrl/Cmd + Shift + =, or the keypad +) inserts and Ctrl/Cmd + - deletes: whole selected rows or columns at once, and for any other range an Insert or Delete dialog asks for entire rows or entire columns, with Excel's default. New actions: `grid.actions.insertCells()` and `grid.actions.deleteCells()`.
- Ctrl/Cmd + 1, the context menu's new Format cells… item and `grid.actions.formatCells()` open Format Cells, with Number, Alignment, Font, Border and Fill tabs. OK applies what changed as one undoable step. The dialog loads on first use.
- New `KeyboardAction` names, which `config.keyboard.bindings` can rebind: `formatGeneral`, `formatNumber`, `formatTime`, `formatDate`, `formatCurrency`, `formatPercent`, `formatScientific`, `hideRows`, `unhideRows`, `hideColumns`, `unhideColumns`, `insertCells`, `deleteCells` and `formatCells`. New context-menu action: `formatCells`.
