---
"@sheetwrite/core": minor
---

Core failures have one shape. Bad host input and passed limits on public paths now throw a `SheetwriteError` with a code instead of a plain `Error`, `TypeError` or `RangeError`: simple columns, row bridge options and row IDs, `CellRenderer.dom()` results, store options, resource reports, restore blocks, transaction limits, datasource pages and unknown sheet IDs. `isSheetwriteError` checks the shape only, so it also accepts codes from a newer release. A failure stays small: its message and the strings in its `context` are cut to 8 KiB, a `context` over 1,024 entries becomes `{ truncated: true }` instead of making the constructor throw, and `SnapshotValidationError.errors` keeps the first 64 issues. `SyncProtocolError` keeps the original failure as its `cause`.

Upgrade checklist:

- If you catch `RangeError` or `TypeError` from `resolveTransactionResourceLimits`, `validateTransactionResources`, `createRowBridge`, `createSimpleGridInput`, `legacyFullWidthDataSource`, `decodeStoreMemoryStats`, `assertRuntimeResourceSnapshot` or a custom `CellRenderer`, check `isSheetwriteError(error)` and `error.code` instead. The new code is `invalid-argument`; the new operations are `store`, `transaction`, `render`, `row-bridge` and `resource-diagnostics`.
- An unknown sheet ID throws `not-found` with operation `store` and `context.sheet`. Do not match the message.
- A bad limit override throws `invalid-limits` everywhere, also from `IndexedDbPendingCommitStorage.load` (was `limit`) and direct workbook allocation (was `TypeError`).
- The operation `comments` is now `comment`, and the grid export operation `export-xlsx` is now `xlsx-export`.
- `datasource-error` contexts no longer copy column keys: they hold `columnBandCount` and the `start` and `end` of the first 64 bands. Read the keys from `event.request`.
- If you `switch` over `SheetwriteErrorCode` or `SheetwriteErrorOperation` without a default case, add the new values.
