---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

Formulas load faster: the engine reads tokens, cell references and whole numbers in formula text with fewer steps. Loading 100,000 formulas takes about 7% less time.
