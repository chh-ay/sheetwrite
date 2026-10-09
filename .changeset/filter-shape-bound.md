---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

Fix FILTER in debug builds when its input array has fewer cells than its static size bound. FILTER uses the evaluated array size for its result.
