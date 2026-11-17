---
"@sheetwrite/core": patch
---

Find and Replace search only the selection when more than one cell is selected, as Excel does. Before, `grid.search` and the find bar searched the whole sheet, so Replace all also changed cells outside the selection. With one cell selected, or one merged cell, they still search the whole sheet. The selection stays while you step through matches: Find Next moves the active cell inside it.
