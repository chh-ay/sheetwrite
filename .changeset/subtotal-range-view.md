---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

SUBTOTAL over references is faster on sheets with hidden or filtered rows: it steps over hidden rows a block at a time and only checks formula cells for a nested SUBTOTAL. AGGREGATE skips hidden rows the same way. Results are unchanged.
