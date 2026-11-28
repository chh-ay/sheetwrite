---
"@sheetwrite/formulas": patch
"@sheetwrite/wasm": patch
---

Restoring an engine from its saved memory state reads the input's length once instead of asking JavaScript on every read. Restoring 100,000 formulas is about 10% faster.
