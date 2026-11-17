---
"@sheetwrite/core": patch
---

The shell's name box works as Excel's does:

- It takes every cell the grid shows and lets you edit. Before, it refused a cell right of the sheet's own columns, such as `H2` on a sheet with columns A to G, although the grid showed that column and accepted typing in it.
- It shows and reads the sheet's row numbers, as the row headers do, also while a filter, hidden rows or a view sort change which rows show. Before, it showed and read positions in the view, so under a filter it showed `G3` for the cell in sheet row 6, and `G2:G49` selected 48 shown rows instead of the shown rows among sheet rows 2 to 49. A typed range now selects the rows of it that show; a cell whose row does not show is refused.
