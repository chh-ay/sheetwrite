---
"@sheetwrite/core": patch
---

A `setSheetMeta` operation whose conditional format has a `stopIfTrue` that is not a boolean is now rejected, as it already was in a snapshot. Snapshots and operations check a conditional format with the same function.
