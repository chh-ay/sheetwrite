---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

The formula rewrites that follow tab moves, row and column edits, sheet renames, table changes and sheet removal share one walk over a formula's child expressions, which lists every node kind (part of #250). A new kind of formula node can no longer be skipped silently by a catch-all arm.
