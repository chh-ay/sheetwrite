---
"@sheetwrite/core": patch
---

Keep row and column resize previews out of the document until release, then record one undoable change. Cancel active pointer gestures on sheet, view, structure, or read-only changes and ignore other pointers during a drag. Keep all editors bound to their original document cell through sorting and filtering. Notify selection changes before edit-begin, prevent reentrant handlers from reopening stale editors, and leave selection unchanged when a fill is rejected.
