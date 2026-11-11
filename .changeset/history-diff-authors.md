---
"@sheetwrite/wasm": patch
---

Comparing two versions in version history is faster. The diff kernel finds the last writer of every changed cell on a page in one pass over the write log instead of one pass per cell, compares cells a strip of rows at a time in the order the engine stores them, and hands each page column to JavaScript without copying it. Pages, their order and the cells they show are unchanged.
