---
"@sheetwrite/core": patch
---

Charts and PivotCharts over the cells take their background, text, line and font from the grid's theme, so a `theme` option or `setTheme` reaches them as it does the cells. Before, they kept the stylesheet's colours, such as the dark theme's `#0b0b0c`, on a grid of any other background.
