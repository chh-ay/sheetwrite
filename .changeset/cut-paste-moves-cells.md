---
"@sheetwrite/wasm": minor
"@sheetwrite/formulas": minor
"@sheetwrite/core": minor
---

Cut and paste moves cells, as Excel's Cut and Paste does. Cut no longer empties its cells: it marks them with a moving dashed border, and the next paste moves their values, formulas, formats, notes, hyperlinks and merged cells with one new `moveCells` document operation. Every formula, defined name and chart that refers to a moved cell follows it, on the same sheet or to another one, and a reference to a cell the paste replaces becomes `#REF!`, as in Excel. A formula inside the moved block keeps pointing at the same cells. Esc, an edit, another copy or a structural change ends the cut. The move is one undo step and syncs as one operation; rebase treats it like a row move. The `"cut"` commit reason is no longer emitted.

The engines add `CellStore.moveCells` and `CellStore.moveCellsLosses`.
