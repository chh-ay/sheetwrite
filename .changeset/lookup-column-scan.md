---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

An exact `XLOOKUP`, `XMATCH`, `MATCH`, `VLOOKUP` or `HLOOKUP` for a number in a range of typed-in values compares the stored numbers directly instead of building a value per cell. Checking that a lookup range holds only typed-in values reads each column in one pass and counts text sizes only when the column holds text. No formula result changes.
