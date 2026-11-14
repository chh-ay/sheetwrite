---
"@sheetwrite/bench": patch
---

The render bench's Sheetwrite `repaint()` paints a frame again. It called `renderCoordinator`, an internal that the 0.5.0 release removed, through an optional lookup, so since then `formatted-paint.top-left`, `merge-heavy.paint` and `formula-dense.paint` timed a refresh that drew nothing against Handsontable's full `hot.render()`. A repaint now reads the visible window again and paints the canvas, and the adapter fails at mount when an internal it drives is missing, and on any repaint that draws no canvas frame.
