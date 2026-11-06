---
"@sheetwrite/core": minor
"@sheetwrite/formulas": minor
---

Measures read related tables, refer to other measures, and follow renames (#230).

- A measure reads qualified columns of any model table. Another table than the pivot's base sees its rows that match the cell's row items, column items and report filters on the fields it reaches through many-to-one relationships; other fields put no condition on it, so filters flow from the one side to the many side only.
- `[Name]` in a measure formula refers to another measure, ignoring case. An unknown name shows `#REF!`; measures that refer to each other in a cycle show `#VALUE!`.
- Renaming a table or a table column with `updateTable` rewrites the measure formulas that name it, and renaming a measure with `setMeasure` rewrites the `[Name]` references to it, within the same undo step. `rebaseDocumentOperations` reports a pending `setMeasure` and a concurrent `updateTable` that renames the table or its columns as an `overlapping-edit` conflict, in either order, so collaborating peers reload and converge on the renamed formulas.
- New engine function `renameStructuredReference(source, table, column, to)` renames a table (empty `column`) or a table column in the structured references of formula text, keeping the rest of the text.
- `GETPIVOTDATA` reads measure values by the measure name.
