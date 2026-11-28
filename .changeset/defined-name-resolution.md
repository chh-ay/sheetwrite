---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

Defined names that hold a formula are resolved once for every formula that uses them, not cached per using sheet. A name whose expansion depends on the using cell or sheet is still expanded where it is used. Name results do not change.
