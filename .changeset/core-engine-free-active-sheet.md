---
"@sheetwrite/core": patch
---

A store whose snapshot fails late in loading, in its pivots or its columnar data, now frees its engine memory before it throws, as earlier failures already did. When a document is replaced, or a collaborator's change leaves the active sheet hidden, the grid now shows the nearest visible sheet next to it, as it does when a grid opens on a hidden sheet, instead of the first visible sheet.
