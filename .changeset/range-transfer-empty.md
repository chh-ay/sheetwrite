---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

The engine refuses version-history range bytes that describe a range of no rows or no columns. Before, it accepted them, and restoring that range computed its last row as one before row 0.
