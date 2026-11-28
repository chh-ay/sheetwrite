---
"@sheetwrite/wasm": minor
"@sheetwrite/formulas": minor
---

Sort rows in Excel's sort order. Text compares without case, in Excel's documented character order, and skips apostrophes and hyphens. Errors sort after `FALSE` and `TRUE` and are equal to each other. Blank cells are last in both directions. This changes the order of existing view sorts that have mixed-case text, errors, or blank cells in a descending sort.
