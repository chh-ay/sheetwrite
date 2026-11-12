---
"@sheetwrite/core": patch
---

Scrolling, moving with the arrow keys and editing a cell no longer make the browser recalculate styles and layout in the middle of a step. The grid writes its screen-reader mirror once per frame, after the paint has read the scroll position and placed the editor, and the cell editor reads its line height, padding and borders once when it opens instead of after every change of its size. A move that keeps the cell's size only sets the editor's position. The mirror shows the same rows, cells, notes and selection in the same frame as before; after `grid.refresh()`, which paints at once, it updates in the next frame.
