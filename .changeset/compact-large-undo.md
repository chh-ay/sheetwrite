---
"@sheetwrite/core": minor
---

Restore large cleared ranges with a lossless `restoreBlock` document operation. If compact encoding still cannot fit, split restores into an atomic multi-version batch. Undo remains one history step and one change event. Each version keeps the default 8 MiB payload limit.

Add optional `PersistenceAdapter.commitBatch`, batch positions on `VersionedOperation`, and durable version operation counts. Servers must apply and publish all members or none. Peers wait for every member before applying the batch. Batches have fixed ceilings of 16 versions and 64 MiB.

Validate compressed values, formulas, references, styles, and envelope fields before mutation. A restore block can decode to at most 64 MiB of JSON and 4,000,000 cells. Hosts must support `restoreBlock` and batch metadata before accepting new clients. Snapshot schema version 1 and host transaction results do not change.

Core now depends on `fflate` 0.8.3 for the `restoreBlock` DEFLATE codec. It is the same pinned version that `@sheetwrite/xlsx` uses. Core still does not depend on `@sheetwrite/xlsx`.
