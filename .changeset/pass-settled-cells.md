---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

A formula that reads another formula already recalculated in the same pass reads its value straight from the cell, instead of first looking the formula up by address. Chains and other formulas that read formulas recalculate with fewer steps. No formula result changes.
