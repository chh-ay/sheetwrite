---
"@sheetwrite/wasm": patch
---

The full engine is about 2 KB smaller (Brotli): SORTBY, GROUPBY, PIVOTBY, FREQUENCY, MODE.MULT and pivot tables sort through the shared sorts instead of their own copies. Results are unchanged, except that pivot child groups which compare equal now keep the order they were first seen in.
