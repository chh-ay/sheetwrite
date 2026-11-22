---
"@sheetwrite/formulas": patch
"@sheetwrite/wasm": patch
---

Formulas that name another sheet look up ASCII sheet names without decoding them character by character. Loading 100,000 `=Data!A1+Data!B1` formulas takes about 5% fewer instructions.
