---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

Use coordinate-keyed hashing for engine cell indexes while retaining randomized hashing for workbook text. Small content clears preserve unrelated calculated values and recalculate only dependent formulas. Style-only clears no longer invalidate calculations.
