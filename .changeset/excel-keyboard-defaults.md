---
"@sheetwrite/core": minor
---

The grid's keys follow Excel's defaults.

- **Active cell.** Extending a selection with Shift+Arrow, Shift-click or a drag keeps the cell it started from active; typing edits that cell. `getSelection()` reports it as `active` on a range, row, column or multi selection when it is not the first cell, and `setSelection` accepts it. The name box and formula bar show it.
- **Enter and Tab** move the active cell (Shift reverses) instead of opening the editor or leaving the grid. Inside a selected range they move within it and keep it; typing there keeps the range, and Ctrl/Cmd+Enter writes the entry into every selected cell, shifting relative references.
- **Editor modes.** Typing opens Enter mode, where arrow keys commit and move, or after an operator in a formula point at cells (Shift stretches the reference). F2 and double-click open Edit mode with the caret at the end; F2 switches modes. Shift+Enter commits and moves up. F4 cycles the reference at the caret through `A1`, `$A$1`, `A$1` and `$A1`. A picked reference stays replaceable by the next click until you type.
- **End mode and Ctrl+End.** End then an arrow jumps like Ctrl+Arrow; Ctrl+End goes to the last used cell.
- **Backspace** clears only the active cell and opens it; Escape restores it. Delete still clears the selection.
- **New rebindable actions:** `bold` (Mod+B, Mod+2), `italic` (Mod+I, Mod+3), `underline` (Mod+U, Mod+4), `strikethrough` (Mod+5), `insertDate` (Mod+;) and `insertTime` (Mod+Shift+;). A context-menu item that already used one of these keys now conflicts; rebind or set the action to `null`.
- **Row numbers** select rows on click, and a drag across row numbers or column letters extends the selection.
