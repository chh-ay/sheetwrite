---
"@sheetwrite/core": patch
---

Scrolling sideways does less work per frame, most visibly in Firefox. The canvas reuses the columns still on screen and paints only the ones a scroll brings in, as it already did for rows. While text in view spills into an empty cell or a cell in view has a border, a sideways scroll still repaints the whole canvas, so every frame matches a full repaint pixel for pixel. The screen-reader mirror keeps the cells of the rows and columns that stay in view and only adds and removes the ones that enter or leave, instead of rebuilding or rewriting every cell, and it is laid out on its own (`contain: strict`), so its changes no longer lay out the page around the grid. What the canvas shows and what the mirror holds do not change.
