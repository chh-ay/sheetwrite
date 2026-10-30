---
"@sheetwrite/core": minor
---

Show and edit cell notes in the grid, as in Excel. Rest the pointer on a cell with a note to see the note in a card (`.sheetwrite-note`). `grid.actions.editNote()` and Shift+F2 (the new rebindable `editNote` keyboard action) open a note editor (`.sheetwrite-note-editor`) on the focus cell: Ctrl or Cmd+Enter or leaving the editor saves the note as one undoable step, empty text removes it, and Escape cancels. `grid.actions.deleteNote()` removes the focus cell's note. The context menu accepts the new `editNote` and `deleteNote` actions.
