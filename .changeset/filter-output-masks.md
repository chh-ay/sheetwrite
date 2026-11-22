---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

A contains filter is faster: the engine collects the rows it keeps 64 at a time through a bit mask instead of deciding each push separately. On 1,000,000 rows it takes about 19% less time.
