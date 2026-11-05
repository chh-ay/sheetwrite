---
"@sheetwrite/core": patch
"@sheetwrite/formulas": patch
---

The core build generates the built-in function table from the formula contract inventory instead of reading a committed copy. The published table is unchanged; the packed `@sheetwrite/core` manifest gains a `generate` script, and the `@sheetwrite/formulas` README no longer asks contributors to regenerate docs after adding a function.
