---
"@sheetwrite/wasm": minor
"@sheetwrite/formulas": minor
"@sheetwrite/core": minor
---

Add the Excel reference operators. A space between two references is the intersection operator: `=SUM(A1:C3 B2:D4)` adds the cells that both ranges cover. When the references share no cell, or are on different sheets, the result is `#NULL!`. Spaces around other operators, after commas and before `)` do not change.

A comma inside parentheses that are not a function call is the union operator: `=SUM((A1:A2,C1:C2))`. `SUM`, `COUNT`, `AVERAGE`, `MAX`, `MIN`, `SMALL`, `LARGE` and the other functions that read lists of values accept a union. `INDEX` has the optional `area_num` argument, which selects one area of a union. The new `AREAS` function counts the areas of a reference. A union in a position that needs one range, such as a `VLOOKUP` table, returns `#VALUE!`.

A 3-D reference such as `=SUM(Jan:Mar!B2)` or `=SUM('Jan:Q1 Close'!A1:B2)` reads the same cells on every sheet from the first to the last sheet in tab order. `SUM`, `AVERAGE`, `COUNT`, `COUNTA`, `MAX`, `MIN`, `PRODUCT`, `STDEV.S`, `STDEV.P`, `VAR.S` and `VAR.P` accept 3-D references; other positions return `#VALUE!`. When you insert, move or delete a sheet inside the span, the result changes as in Excel. When you delete or move an endpoint sheet, the formula moves to the nearest sheet inside the span. A rename keeps the formula valid. When every sheet of the span is deleted, the reference becomes `#REF!`. Row and column edits on one sheet do not change a 3-D reference.

The three operators record only the cells they read, so an edit recalculates only the formulas that it can change. A tab move updates the dependencies of the affected formulas only. When a tab move rewrites a 3-D reference, undo restores the original formula text. XLSX import and export keep these formulas as Excel text. The WASM `CellStore` has the new `setSheetOrder` and `sheetSpanFormulaCells` methods; core calls them when tabs are added, moved or restored.
