---
"@sheetwrite/formulas": minor
"@sheetwrite/core": minor
---

The full engine adds `GETPIVOTDATA` (#280). It reads a value cell of a pivot table: the data field by its source name or caption (`"Sales"` or `"Sum of Sales"`), the pivot by any cell of its output, and field and item pairs in any order, with numbers and date serials as items. A pivot, field or item that the output does not show gives `#REF!`, as in Excel. Formulas that use it recompute when the pivot output changes, including pivots over the data model.

The default engine does not change.
