---
"@sheetwrite/core": patch
---

Delete and `grid.actions.clearContents()` clear the cells' values and keep their formats, as Excel's Delete does and as the API docs say. Before, they also removed the number format, bold and the other styles.
