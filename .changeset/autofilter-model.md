---
"@sheetwrite/core": minor
"@sheetwrite/wasm": minor
"@sheetwrite/xlsx": minor
---

Excel's AutoFilter, in the document model. `Grid.setAutoFilter(range)` turns filter buttons on for a range whose first row is the header, and `setAutoFilter(null)` turns them off; with an AutoFilter, column filters hide only the range's rows below the header, so the header, and rows above and below the range, always show. `getAutoFilter()` reads it and `reapplyFilter()` filters again after edits, as Excel's Reapply. The sheet's `autoFilter` saves with the snapshot, syncs to collaborators, follows inserted and deleted rows and columns, and is one undo step.

A new column filter, `{ kind: "custom", join, conditions }`, holds Excel's custom AutoFilter: one or two conditions (equals, does not equal, greater or less than, begins with, ends with, contains, does not contain), joined by AND or OR. They match as COUNTIF criteria do, wildcards and blanks included.

Column filters now keep through inserted and deleted rows, and move with their columns when columns are inserted, deleted or moved; before, any row or column edit cleared them.

XLSX import reads a worksheet `<autoFilter>`, with value lists, custom filters and non-blank filters, instead of dropping it with a warning; rows the filter hid in Excel become filtered rows, not hidden ones. Export writes `<autoFilter>`, the `_xlnm._FilterDatabase` name and, when it comes from a grid or store, the rows the filter hides, so Excel opens the file filtered.
