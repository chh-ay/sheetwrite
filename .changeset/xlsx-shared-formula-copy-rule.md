---
"@sheetwrite/core": patch
"@sheetwrite/xlsx": patch
---

Workbook import expands shared formulas in the engine, with its copy rule, the one that paste and fill use (part of #250). Import still works before `initSheetwrite()`: it borrows an initialized engine or uses a temporary one, as formula conversion does. Expanded formulas change where the old rule differed:

- Whole columns and rows move: a shared `=SUM(A:A)` one column right is `=SUM(B:B)`. Before, it stayed `=SUM(A:A)`.
- A reference moved past `XFD` or row 1048576 is `#REF!`, as is a range with any corner off the sheet: `=SUM(#REF!)` instead of `=SUM(#REF!:A1)`.
- A name past the last column, such as `XYZ1`, stays a name.

A shared-formula master that the engine's lexer cannot read has no copy rule. Each other cell of its group then keeps the formula text its writer stored on it, if any, and otherwise the master's text. Import reports an `unsupported-feature` warning for each such cell.

`withXlsxFormulaEngine` in `@sheetwrite/core` replaces the unreleased `convertXlsxFormulas`. It runs a callback with the engine's formula conversion, lexer check and copy rule in one engine session.
