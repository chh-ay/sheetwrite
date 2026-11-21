---
"@sheetwrite/core": patch
"@sheetwrite/queries": patch
---

Refreshing a saved query writes its table faster. A packed block interns each entry of its style table once, on first use, instead of once per cell, and the queries package lays out the output block without an object per cell. Cells, styles and style ids do not change.
