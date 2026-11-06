---
"@sheetwrite/core": patch
---

A grid destroyed while optional code loads no longer calls its freed engine. A chart over a pivot that starts loading the pivot views, an XLSX export that loads the pivot export code, Insert › New Dashboard, the panels that the ribbon, Edit Links, Queries & Connections and Version History open, and `updateExternalLinks` waiting on its resolver now check whether the grid or its store is gone when the wait ends. The export and `updateExternalLinks` then reject with an `aborted` error, `loadPanels` rejects with the grid's `AbortError`, and the others do nothing. Before, the engine could fail with "null pointer passed to rust".
