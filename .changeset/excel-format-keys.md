---
"@sheetwrite/core": minor
---

Excel's keys for formats, rows and columns, and the Format Cells dialog:

- Ctrl/Cmd + Shift + ~ ! @ # $ % ^ apply the General, Number, Time, Date, Currency, Percentage and Scientific formats with Excel's codes.
- Ctrl/Cmd + 9 hides the selected rows and Ctrl/Cmd + Shift + 9 shows the hidden rows inside the selection; Ctrl/Cmd + 0 and Ctrl/Cmd + Shift + 0 do the same for columns.
- Ctrl/Cmd + + (Ctrl/Cmd + Shift + =, or the keypad +) inserts and Ctrl/Cmd + - deletes: whole selected rows or columns at once, and for any other range an Insert or Delete dialog asks for entire rows or entire columns, with Excel's default. New actions: `grid.actions.insertCells(options?)` and `grid.actions.deleteCells(options?)`. They apply before they return, without a dialog, as Excel's `Range.Insert` and `Range.Delete` do in a macro: `{ entire: "row" }` or `{ entire: "column" }` chooses for a range that is neither whole rows nor whole columns, and without it the range's shape chooses, as the dialog's default does. `{ ask: true }` opens the dialog, as the keys do.
- Ctrl/Cmd + 1, the context menu's new Format cells… item and `grid.actions.formatCells()` open Format Cells, with Number, Alignment, Font, Border and Fill tabs. OK applies what changed as one undoable step. `grid.actions.formatCells({ style, border })` applies a format the same way from code, before it returns, without the dialog.
- The commands apply when they are called. Only the Insert, Delete and Format Cells dialogs load on first use, and keys pressed while one loads reach it once it opens.
- New `KeyboardAction` names, which `config.keyboard.bindings` can rebind: `formatGeneral`, `formatNumber`, `formatTime`, `formatDate`, `formatCurrency`, `formatPercent`, `formatScientific`, `hideRows`, `unhideRows`, `hideColumns`, `unhideColumns`, `insertCells`, `deleteCells` and `formatCells`. New context-menu action: `formatCells`.
