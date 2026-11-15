---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

Conditional-format formula rules evaluate their parsed formula in place at each visible cell instead of copying it for every cell. A window read no longer allocates for the formula at each cell. Results do not change.
