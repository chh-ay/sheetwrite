---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

In Node, `initSheetwrite()` and `createEngine()` read the bundled engine file synchronously. The asynchronous read waited on Node's thread pool four times (open, size, read, close) before the engine could compile, which made a cold start about 2 ms slower in the median and up to 20 ms slower in its slowest runs on a busy core.
