---
"@sheetwrite/wasm": minor
"@sheetwrite/formulas": minor
"@sheetwrite/core": minor
---

Formula help previews the result of a formula while you type. The engines add `previewFormula`, which evaluates a formula text in a cell without changing the store, and `@sheetwrite/core/functions` exports `previewFormula` for host editors. RAND, RANDBETWEEN and host functions are never run for a preview, and a preview that would read or build too much returns `cost-limit`.
