---
"@sheetwrite/core": patch
---

Core data paths use one copy of each shared rule:

- Operation, snapshot and history size checks count JSON bytes with one walker. A `toJSON` field that is not a function is ordinary data, as it is for `JSON.stringify`; symbol-keyed fields, which JSON drops, are rejected.
- The IndexedDB pending queue rejects a batch of more than 16 versions, and a durable queue record whose version counts have holes is rejected, like every other invalid batch.
- `grid.hideRows` and `grid.showRows` skip rows that are not whole numbers, as the store's methods do, and `grid.clearView()` or removing a filter that is not set commits nothing.
