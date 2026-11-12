---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

Text functions and the `&` operator read their text arguments in place instead of copying each one first, and `LEFT`, `RIGHT` and `MID` copy only the part they return. Formulas such as `=A1&" "&B1` or `=MID(A1,5,1)` recalculate about a quarter faster. Results do not change.
