---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

A LET whose bindings are plain calculations (constants, operators, cells and other bindings) reads its bindings from slots resolved when the formula is entered, instead of copying each binding's expression into every use on every recalculation. Such a LET recalculates with about a quarter of the work and without heap allocations; formulas, written text and results do not change.
