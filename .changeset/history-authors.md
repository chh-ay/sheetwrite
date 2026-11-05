---
"@sheetwrite/core": minor
---

Version history records who made each change (#228). `SyncCoordinatorOptions.authorId` puts the editor's authenticated ID on each new `PendingCommit` (`authorId`), and `IndexedDbPendingCommitStorage` stores it, so a commit restored after a reload keeps its author. `VersionedOperation` gains `authorId` and `committedAt`; `SyncCoordinator` validates them, keeps them on `remote-applied` events and rejects an atomic batch whose members name different authors. `MemoryPersistenceAdapter.recordHistory(documentId, journal)` records each commit in a `CommitJournal` as the last step of the commit: when the journal rejects, the commit is not applied, published or acknowledged. `HistoryArchive` implements `CommitJournal`, and `HistoryArchive.record` takes the new root type `CommittedTransaction`, which replaces `HistoryCommit` from `@sheetwrite/core/history`.
