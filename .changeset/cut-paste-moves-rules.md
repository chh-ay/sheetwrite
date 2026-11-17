---
"@sheetwrite/wasm": minor
"@sheetwrite/formulas": minor
"@sheetwrite/core": patch
---

Cut and paste moves validation and conditional-format rules whose range lies inside the cut cells, as Excel does, and undo puts them back. A conditional-format formula follows the moved cells as a moved formula does, and a rule whose whole range the paste lands on goes. A range down to a sheet's last row or column no longer counts as a whole row or column when a cut moves its edge; only one that reaches Excel's sheet edge does.

The engines add `moveFormulaCells`.
