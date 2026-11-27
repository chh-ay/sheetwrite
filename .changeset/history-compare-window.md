---
"@sheetwrite/wasm": patch
---

Version history skips a compare request whose piece lies outside the loaded cells, instead of stopping on an out-of-range read.
