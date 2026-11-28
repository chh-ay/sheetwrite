---
"@sheetwrite/wasm": patch
---

Comparing two versions in version history is faster. The diff kernel finds the last writer of the changed cells in one pass over the write log for each window it compares, instead of one pass per changed cell, and hands each page column to JavaScript without copying it. Pages, their order and the cells they show are unchanged.
