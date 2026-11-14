---
"@sheetwrite/wasm": patch
---

Sorting rows is about twice as fast for text, mixed and multi-column keys, and for number columns under 4,096 rows, and the engine is about 5 KB smaller (Brotli). Rows keep the same order.
