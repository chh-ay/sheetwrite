---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

Single-cell named ranges and table references now return scalar results without creating a one-cell spill owner. References spanning several cells still spill.
