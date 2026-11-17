---
"@sheetwrite/core": minor
---

The status bar names Excel's cell mode at its start: Ready, Enter, Edit, or Point while an arrow key or a click has just picked a reference for a formula. Hosts read the mode with the new `grid.getCellMode()` and hear changes with the new `cell-mode` event; the `CellMode` type lists the modes.
