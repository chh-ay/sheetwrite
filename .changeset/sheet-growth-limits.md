---
"@sheetwrite/core": patch
"@sheetwrite/bench": patch
---

Row and column inserts are held to the document limits. A transaction whose `addRows` or `addColumns` would pass `maxRowsPerSheet`, `maxColumnsPerSheet`, `maxLogicalCellsPerSheet` or, for a dense sheet, `maxDenseCells` is now rejected with a `resource-limit` issue (`sheet-rows`, `sheet-columns`, `sheet-cells` or `dense-cells`) that names the limit, and nothing changes. Before, a sheet could grow past 1,000,000 rows and then fail to load from its own snapshot, and an insert past the 5,000,000 dense-cell limit was a silent `noop`. Insert Row and Insert Column show the limit in the grid's alert. The render benchmark's altering rows now make room below the limit before they time an insert, and fail when the store refuses a row edit.
