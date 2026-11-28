---
"@sheetwrite/core": patch
"@sheetwrite/formulas": minor
---

The Relationships panel checks a relationship's keys before it saves it. It saved the relationship, checked the keys, and undid the save when they did not resolve: that sent the change to collaborators for a moment, left a redo step, and the undo was not tied to the save, so it could undo a different change. A refused relationship is now never committed. The full engine adds `CellStore.relationshipKeyStatus`, which checks the keys of a relationship that is not saved.
