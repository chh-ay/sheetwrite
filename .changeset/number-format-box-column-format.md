---
"@sheetwrite/core": patch
---

The ribbon's and toolbar's number-format box shows the format a cell displays: its column's `numberFormat` when no style sets one, as in Excel. Before, a cell in a percentage column showed "General". `getFocusCellStyle()` now includes that column format.
