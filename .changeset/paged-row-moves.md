---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

Move loaded paged rows in place when inserting or deleting rows, retaining local edits, page pins and access order instead of rebuilding every loaded cell. Range load checks scan loaded bits without reading cell values or changing eviction order.
