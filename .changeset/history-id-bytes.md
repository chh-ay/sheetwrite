---
"@sheetwrite/core": patch
---

Version history bounds the mutation, author and restored version IDs of a commit it records by their UTF-8 bytes, at most 256, as sync bounds mutation and author IDs. It counted UTF-16 code units, so it accepted IDs of up to 768 bytes that sync refuses. IDs already in an archive, and document IDs, keep the earlier bound of 256 UTF-16 code units, so archives written by earlier versions still open and replay.
