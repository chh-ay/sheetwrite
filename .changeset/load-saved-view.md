---
"@sheetwrite/core": patch
---

A workbook or snapshot that loads with hidden rows, collapsed row groups, filters or sort keys now shows its saved view at once. Before, the store view (`hasView`, `viewRowCount`, `viewRowOf`) ignored them until the first row or filter change on that sheet, and `SUBTOTAL` counted the rows that a saved filter hides. A sheet added from a snapshot, for example when you undo a sheet removal, also gets its saved view.
