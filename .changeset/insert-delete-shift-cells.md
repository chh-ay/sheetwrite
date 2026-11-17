---
"@sheetwrite/core": minor
"@sheetwrite/wasm": minor
"@sheetwrite/formulas": patch
---

Insert and Delete (Ctrl++ and Ctrl+-) can shift cells, as in Excel.

- The dialog's Shift cells right and Shift cells down (left and up on delete) work, and it starts on them as Excel does: down (up) for a wide range, right (left) for a tall one.
- The cells after the range in its columns (rows) move with their formats, notes, links, merged cells, validation and conditional-format rules. Formulas, defined names and charts that refer to them follow by Excel's rule for inserted and deleted cells: a range in those columns grows or shrinks, and a reference to a deleted cell becomes `#REF!`. One undo puts everything back.
- An insert that would push cells that are not blank off the sheet does nothing and says so, and so does a shift that a table, PivotTable or merged cell is in the way of.
- `moveCells` takes `shift: true` for this; the engine's `moveCells`, `moveCellsLosses` and `moveFormulaCells` take a last `shift` argument.
