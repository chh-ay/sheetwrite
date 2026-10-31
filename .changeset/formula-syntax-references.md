---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

Formulas accept more Excel syntax:

- Numbers with an exponent, such as `=1E3` and `=SUM(1.5E-3)`.
- Whole columns and rows, such as `=SUM(A:A)`, `=SUM($A:$C)` and `=SUM(Sheet2!1:1)`. They read only the rows and columns that the sheet has, keep their column or row through row and column edits and copies, and are written back in this short form. `ROWS(A:A)` is 1048576.
- A name such as `XYZ1` that is past column XFD or row 1048576 is a name, not a cell.
- A row or column edit keeps the text of a formula whose references it does not move, so `=A1+B1*2` stays as written.
