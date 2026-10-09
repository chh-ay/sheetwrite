---
"@sheetwrite/core": patch
---

A theme change now also repaints the built-in toolbar, find bar, and context menu. Before, `setTheme` and `replaceTheme` updated only the canvas, so after a switch to dark these widgets kept the light colours.
