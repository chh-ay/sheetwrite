---
"@sheetwrite/core": minor
---

The cell editor and the formula bar share one draft during an edit, as in Excel: every keystroke, paste, IME step, undo or picked reference in either shows in the other at once, Escape in either restores both, and moving focus between them keeps the edit open. The grid adds `edit-input` and `edit-end` events and `setEditText`, `commitEdit` and `cancelEdit`, so a host formula bar can do the same.
