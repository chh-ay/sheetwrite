---
"@sheetwrite/core": patch
---

`rebaseDocumentOperations` copies a local operation only when a remote row or column change rewrites it, and the copy shares the cell payloads the rewrite does not touch. Before, it deep-copied every local operation up front, which was almost all of the time it took. The result can now hold your own operation objects, so treat it as read-only. Your operations are still never modified.
