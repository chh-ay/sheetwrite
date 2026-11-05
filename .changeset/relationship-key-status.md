---
"@sheetwrite/core": minor
"@sheetwrite/formulas": minor
---

Check the keys of table relationships in the full engine (#229).

- New `SheetwriteStore.getRelationshipStatus(id)` returns a `RelationshipStatus`: `ok` with the count of unmatched many-side keys, `missingTable`, `missingColumn`, `typeMismatch` (side and row), `duplicateKey` (both one-side rows), or `unavailable` on the default engine and for an unknown ID.
- Keys match as pivot group keys do: numbers by value and text without case. A blank key matches nothing. The one-side keys must be unique, and both columns must hold only numbers or only text.
- The engine checks keys with a sorted index of the one-side keys: one sort, then one binary search per many-side key. It builds the index for each check and keeps nothing between checks, so a workbook with relationships holds only their IDs in the engine.
