---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

The engines are smaller: `WORKDAY`, `NETWORKDAYS`, `MODE.SNGL`, `TRIMMEAN` and the full engine's function-name list sort through the engine's shared sorts instead of compiling their own. The default engine's WASM is 1.7 KB smaller and the full engine's 3.3 KB (Brotli). Results don't change.
