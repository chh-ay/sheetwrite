---
"@sheetwrite/core": minor
---

UI code uses one copy of each shared rule:

- Double-clicking a column border fits the column to all of its rows with their cell fonts, as `grid.autoFitColumns` does, instead of only the rows on screen.
- One cell style check guards hyperlinks, table styles and pasted Sheetwrite cells: font sizes from 1 to 409 points, as in Excel, and `#rrggbb` colors. A pasted style that breaks the check is dropped.
- Anchored popups keep 8 px from the window edge, including the sheet tab menu.
- With several ranges selected, the name box, formula bar, Explain Formula, link, note and PivotTable field commands use the top-left cell of the last range, where Excel keeps the active cell.

Removed: `sanitizeHyperlinkStyle`; use `sanitizeCellStyle` instead.
