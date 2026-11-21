---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

Defining a chain of names over a name that one sheet redefines, and entering a formula that uses the chain, no longer take time that doubles with each link. A workbook could freeze a tab this way.
