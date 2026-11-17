---
"@sheetwrite/core": patch
---

Merging a range in which more than one cell holds a value warns first, as Excel does: "Merging cells only keeps the upper-left value and discards other values." OK merges, as one undoable step; Cancel or Escape leaves the cells as they were. Merge, Merge & Center, the context menu and `grid.actions.merge()` all ask. The merge command and the warning, a modal dialog, load on first use, so a merge lands a moment after the call. Tab stays inside the dialog, Enter chooses OK, Escape cancels, and the grid gets its focus back when it closes. Its styles are in `styles/grid.css`, themed with the widget variables.
