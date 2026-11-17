---
"@sheetwrite/core": patch
---

Merging a range in which more than one cell holds a value from the toolbar, the ribbon's Merge & Center or the context menu warns first, as Excel does: "Merging cells only keeps the upper-left value and discards other values." OK merges, as one undoable step; Cancel or Escape leaves the cells as they were. From code, `grid.actions.merge()` and `mergeAndCenter()` merge before they return and keep only the upper-left value, as Excel's `Range.Merge` does in a macro with `DisplayAlerts = False`; `merge({ ask: true })` and `mergeAndCenter({ ask: true })` warn first, as the toolbar does. The warning's code, with its modal dialog, loads with the first merge that asks, and keys pressed meanwhile wait and then reach it. Tab stays inside the dialog, Enter chooses OK, Escape cancels, and the grid gets its focus back when it closes. Its styles are in `styles/grid.css`, themed with the widget variables.
