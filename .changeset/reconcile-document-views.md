---
"@sheetwrite/core": patch
---

Reconcile displayed rows, selection, and scrolling before change listeners run when transactions, remote operations, or undo/redo change filters, sorting, hidden rows, or row groups, including structural edits that clear a query. Keep filtered row geometry bounded when row heights change or a sheet is activated.
