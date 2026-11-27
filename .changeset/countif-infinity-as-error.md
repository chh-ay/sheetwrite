---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

COUNTIF over a column that holds only numbers no longer counts a stored infinity under a criterion such as `">0"` or `"<0"`. Such a cell reads as `#NUM!`, as it already did for paged sheets and for COUNTIFS, SUMIF, AVERAGEIF, MAXIFS and MINIFS.
