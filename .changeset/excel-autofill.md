---
"@sheetwrite/core": minor
---

The fill handle follows Excel's AutoFill. It continues a series along the drag direction, also to the left and right: one date counts by days, numbers with a constant step continue it and other numbers continue their linear trend, day and month names continue, and text ending in a number counts up. One number, formulas and other text are copied. Filled cells take the source cell's format. Ctrl (Option on a Mac) swaps counting and copying, a double-click on the fill handle fills down as far as the next column's data, and the new `fillDown` (Mod+D) and `fillRight` (Mod+R) keyboard actions copy the selection's first row or column into the rest.
