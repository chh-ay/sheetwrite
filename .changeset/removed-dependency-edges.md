---
"@sheetwrite/wasm": patch
---

A batch of formula edits no longer leaves a removed dependency behind. When one recalculation followed more than 16 formula changes reading cells in the same 256-row block of a column, a formula that stopped reading a cell below the others could still be recalculated whenever that cell changed.
