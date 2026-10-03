---
"@sheetwrite/core": minor
---

Show the real default colors in the toolbar color swatches. Before, the text color and fill color swatches always showed black until the user picked a color. Now they show the grid theme's text and cell background colors, and they follow theme changes until the user picks a color.

Add `grid.getTheme()`, which returns a copy of the base theme, and the `theme-change` event, which the Grid emits after `setTheme` or `replaceTheme`.
