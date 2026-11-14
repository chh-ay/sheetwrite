---
"@sheetwrite/core": patch
---

The cell editor and the shell's formula bar share one draft during an edit, as in Excel: every keystroke, paste, IME step, undo or picked reference in either shows in the other at once, Escape in either restores both, and moving focus between them keeps the edit open.
