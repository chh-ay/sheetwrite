---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

`SUMPRODUCT` over ranges of typed-in values, such as `=SUMPRODUCT(A1:A100000,B1:B100000)`, is now about 4 times faster and no longer copies its ranges into lists first (about 10 MB less temporary memory for two 100,000-row ranges). Ranges with formulas, spilled values or paged storage, and computed arguments, use the existing path. No formula result changes.
