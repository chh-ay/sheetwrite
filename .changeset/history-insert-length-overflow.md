---
"@sheetwrite/wasm": patch
---

Version history ignores a row or column insert that would make a sheet longer than its row or column limit can count, instead of stopping on an overflow.
