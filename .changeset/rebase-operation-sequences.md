---
"@sheetwrite/core": patch
---

Fix `rebaseDocumentOperations` for pending work with more than one operation. Each server operation is now moved past the earlier local operations before it is compared with a later one. Before, an edit written after a local row or column insert or delete could land on the wrong row, and an edit to a row the server deleted could be written onto a different row instead of returning a `structural-overlap` conflict. A pending move that reorders cells a server operation targets now returns an `unsupported-structural` conflict.
