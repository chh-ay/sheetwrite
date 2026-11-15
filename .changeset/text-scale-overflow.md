---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

TEXT returns `#NUM!` when a percent code takes the number past the largest double, for example `=TEXT(1.7E+308,"0%")`. The engine stopped with an error before.
