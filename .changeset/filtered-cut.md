---
"@sheetwrite/core": patch
---

A cut over a filtered range moves every row from the first selected row to the last, the rows the filter hides too, as Excel's cut does. Before, such a cut did nothing. Copy, delete, formatting and the fill handle still act only on the rows the filter shows.
