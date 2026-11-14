---
"@sheetwrite/wasm": patch
---

The full engine is about 3 KB smaller (Brotli): SORTBY, GROUPBY, PIVOTBY, FREQUENCY, MODE.MULT and pivot tables sort through the shared sorts instead of their own copies. Results are unchanged.
