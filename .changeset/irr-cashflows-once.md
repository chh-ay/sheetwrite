---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

IRR reads its cash flows once per call instead of on every step of its solver, so IRR formulas recalculate faster. Results are unchanged.
