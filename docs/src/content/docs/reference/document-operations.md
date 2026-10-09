---
title: Document operations
description: Transaction boundaries, local and remote application, snapshot validation, and conservative rebase.
---

`DocumentOp` is the exhaustive serializable mutation union used by Store/Grid transactions, persistence, sync, undo/redo, and document rebase. Operations address stable sheet IDs and explicit row/column coordinates; structural operations also rebase formula references and related metadata.

## Local transactions

`grid.applyTransaction({ patches })` participates in read-only/protection policy, undo/redo, and committed `change` events. Its `ApplyTransactionResult` is `applied`, `rejected`, `conflict`, or `noop`, with warnings/rejections where applicable. `store.applyTransaction` is the lower-level epoch boundary and intentionally bypasses Grid policy/history.

## Remote input

Apply sequenced host input through the remote operation path so events carry `source: "remote"` and are not re-enqueued as local output. Versions must be contiguous: gaps require reload or an explicit `SyncVersionGapRequest` recovery flow.

### Large restores

Undo can emit `restoreBlock` when the ordinary `setBlock` payload exceeds the transaction byte limit. This operation has `range`, `encoding: "deflate-json-v1"`, `decodedBytes`, and `data` fields. `data` is canonical base64 of a raw DEFLATE stream. Its decoded bytes contain UTF-8 JSON for a `PackedCellBlock`, not another operation or transaction.

Persist and replay the operation unchanged. Servers and peers must validate the encoding and decoded block before applying it. The encoded operation still uses the normal transaction and version payload limits. A block can expand to at most 64 MiB of JSON and 4,000,000 cells. Invalid streams or blocks are rejected before mutation. Snapshot schema version 1 remains unchanged because snapshots store the resulting cells, not restore streams.

The operation has the same range, formula, reference, style, protection, and conservative rebase behavior as `setBlock`. The Grid emits one change event and sync submits one version. Hosts that dispatch over the exhaustive `DocumentOp` union must add `restoreBlock` support before accepting new clients.

### Atomic multi-version batches

If a restore still cannot fit one version, the Grid splits packed blocks into smaller ranges. It applies those operations as one transaction and emits one `change` event. Ordinary host `applyTransaction` limits and result fields do not change.

The persistence adapter must implement `commitBatch`. Its request carries the usual commit fields plus `versionOperationCounts`. Each count selects the next consecutive operations for one version. Counts must be positive, cover all operations, and describe at least two versions. Every version must pass the normal operation and byte limits. A batch has at most 16 versions and 64 MiB of encoded operations.

The server must validate all versions and apply all operations in one database transaction. It must publish all versions or none. Versions run from `baseVersion + 1` to `baseVersion + versionOperationCounts.length`. Each published version carries `batch: { index, count }` with a zero-based index and the same mutation ID. The response acknowledges the last version. Retry uses the same mutation ID for the whole batch.

Peers hold batch members until all consecutive versions arrive. They validate and apply the combined operations once. A rejected member leaves the peer document and server-version cursor unchanged. Missing versions use the normal gap recovery path. Pending IndexedDB records retain `versionOperationCounts` across reload. Rebase preserves batch boundaries and rejects ambiguous range, formula, or reference changes with a typed conflict. Adapters without `commitBatch` reject an oversized local step before mutation.

Malformed pending batch counts raise `IndexedDbPendingCommitStorageError` with code `transaction`. The memory adapter reports rejected document application with `PersistenceError` code `commit-rejected`. Invalid remote batch metadata uses `SyncProtocolError` code `invalid-batch`; a batch ceiling uses `batch-limit`. A complete batch rejected by the Grid uses `remote-operations-rejected`.

XLSX export reads the restored document cells. It does not store restore streams or batch metadata.

## Snapshots and rebase

Validate untrusted JSON with the snapshot validator before hydration. `SnapshotValidationError` identifies the failing path. `rebaseDocumentOperations` accepts only cases it can establish as non-overlapping; conflicts preserve the original pending queue for host resolution.

- [`DocumentOp`](/docs/api/core/document-op/)
- [`Grid.applyTransaction`](/docs/api/core/grid/#applytransaction)
- [`ApplyTransactionResult`](/docs/api/core/apply-transaction-result/)
- [`WorkbookSnapshot`](/docs/api/core/workbook-snapshot/)
- [Persistence and recovery](/docs/guides/persistence/)
