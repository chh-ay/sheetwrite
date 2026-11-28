---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

Formula string literals share their text with evaluated values instead of allocating and copying it on each recalculation. This makes formulas such as `=A1&" "&B1` faster without changing their results. Formula memory accounting includes the shared string's reference counts.
