---
"@sheetwrite/core": patch
---

Version history bounds a document, mutation, author or version ID by its UTF-8 bytes, at most 256, as sync bounds mutation and author IDs. It counted UTF-16 code units, so it accepted IDs of up to 768 bytes that sync refuses.
