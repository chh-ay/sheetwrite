---
"@sheetwrite/core": minor
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

Fraction and Text number formats work as in Excel.

- Fraction codes such as `# ?/?`, `# ??/??`, `# ???/???`, `# ?/4`, `# ??/16` and `# ??/100` show the closest fraction (or the fixed number of parts) in cells and in `TEXT()`: `5.25` with `# ?/?` shows `5 1/4`. They used to show a rounded whole number in cells and stray digits in `TEXT()`.
- The Text format `@` shows a number as General would; a cell used to show nothing. What you type into a cell formatted as Text stays text exactly as typed, so `0123` keeps its zero and `=A1` is not a formula.
- An entry typed into a cell keeps the cell's formatting, as in Excel, with Enter, Tab and Ctrl+Enter alike. It used to clear the cell's style, bold and number format included.
- Format Cells has the Fraction and Text categories, and the Home number format list has Fraction and Text.
- `parseCellInput` takes the cell's effective number format as an optional third argument, so a formula bar keeps Text cells' input as text too.
