---
"@sheetwrite/core": minor
---

Formula AutoComplete lists defined names and tables with the functions, a table's columns after `Table1[`, and the values of arguments such as `TRUE - Approximate match` and `FALSE - Exact match` for VLOOKUP's last argument, as Excel does. The argument guide uses Excel's argument names, such as `SUMIF(range, criteria, [sum_range])`. `analyzeFormula` takes the names and tables to list as a new optional fourth argument, `FormulaCompletion.matches` now holds `FormulaCompletionItem`s (`kind`, `name`, `insert`, `description`, and `function` for a function), and `FormulaArgumentMetadata` has `choices`.
