---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

A dense sheet that would pass the workbook's dense-cell limit now continues in local pages instead of refusing the edit: the engine moves its cells into pages that are never evicted and always loaded, and local sheets share their own workbook-wide cell budget.
