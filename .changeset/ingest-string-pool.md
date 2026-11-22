---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

Loading columnar data is faster. After a load in which every text is still in use, the string pool keeps its ids and only releases spare capacity, instead of storing every text again and rewriting every cell; a sheet without text skips the step. A block without formulas or text no longer allocates scratch arrays for them.
