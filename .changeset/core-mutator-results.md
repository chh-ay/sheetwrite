---
"@sheetwrite/core": minor
---

Synchronous sort, filter, hidden-row, row-group and view-clear methods now return the same `ApplyTransactionResult` as `applyTransaction`. Hosts can see when one of these calls is rejected or makes no change.

Upgrade checklist:

- `Grid.sortBy` and `Grid.sortByMulti` return `ApplyTransactionResult` instead of `void`.
- `SheetwriteStore.sortBy`, `sortByMulti`, `setColumnFilter`, `filterBy`, `hideRows`, `showRows`, `groupRows`, `ungroupRows`, `setGroupCollapsed` and `clearView` return `ApplyTransactionResult` instead of `void`.
- If your code implements these method types or assigns them to a callback type that returns `void`, update the declared return type.

Changed: `store.setColumnFilter`, `filterBy`, `hideRows`, `showRows`, `groupRows`, `ungroupRows`, `setGroupCollapsed`, `clearView` and `grid.sortBy` return `ApplyTransactionResult` instead of `void`.
