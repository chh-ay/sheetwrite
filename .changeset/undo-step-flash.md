---
"@sheetwrite/core": minor
---

Undo and redo show what they changed. The changed cells flash for a moment, and the spreadsheet shell's status bar names the step and its cells, such as "Undo: Paste in B2:D9" or "Redo: Insert Rows", until the selection changes. Steps are named as in Excel's undo list: Typing, Paste, Clear, Auto Fill, Replace, Sort, Format Cells, Insert Rows and so on. Excel changes the cells silently, so a change spread over many cells, or one out of view, was hard to check. The new `history-step` grid event, `{ direction, step, range }`, reports each step for a status bar of your own.
