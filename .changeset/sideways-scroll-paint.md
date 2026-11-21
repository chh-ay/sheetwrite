---
"@sheetwrite/core": patch
---

Scrolling sideways does less work per frame, most visibly in Firefox. The canvas reuses the columns still on screen and paints only the ones a scroll brings in, as it already did for rows. The screen-reader mirror keeps the cells of the rows and columns that stay in view and only adds and removes the ones that enter or leave, instead of rebuilding or rewriting every cell. What the canvas shows and what the mirror holds do not change.
