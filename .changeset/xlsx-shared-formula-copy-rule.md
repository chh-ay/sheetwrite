---
"@sheetwrite/xlsx": patch
---

Workbook import expands shared formulas with the engine's copy rule, the one that paste and fill use (part of #250). Import still works before `initSheetwrite()`; a test checks the reader's rule against the engine over the conformance corpus. Expanded formulas change where the old rule differed:

- Whole columns and rows move: a shared `=SUM(A:A)` one column right is `=SUM(B:B)`. Before, it stayed `=SUM(A:A)`.
- A reference moved past `XFD` or row 1048576 is `#REF!`, as is a range with any corner off the sheet: `=SUM(#REF!)` instead of `=SUM(#REF!:A1)`.
- A name past the last column, such as `XYZ1`, stays a name.
