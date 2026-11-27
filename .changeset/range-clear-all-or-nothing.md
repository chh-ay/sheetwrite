---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

Clearing a range and changing the styles of a range on a sheet that loads its rows from a data source now change every cell or none. When memory ran out part of the way through, the engine reported that nothing happened but kept the cells it had already changed, and those changes were never recorded or sent.
