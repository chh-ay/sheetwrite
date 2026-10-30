---
"@sheetwrite/core": minor
---

Add an opt-in Excel-style ribbon (`config.ribbon: true`, or `createRibbon` and `ribbon: true` in the shell) with Home, Insert, Data and View tabs. Groups shrink, then fold into dropdowns, as the grid narrows, and the panel can be hidden to its tab row.

New `GridActions`: `setBorders` (Excel border presets that keep each cell's other sides), `setFontFamily`, `setFontSize`, `stepFontSize`, `setVerticalAlign`, `toggleWrap`, `setNumberFormat`, `stepDecimals`, `mergeAndCenter`, `clearAll`, `autoSum`, `find` and `freezePanes`. `setTextColor` and `setFillColor` now accept `null` for Automatic and No Fill. New `Grid.getFocusCellStyle()`, and command state for `alignTop`, `alignMiddle`, `alignBottom` and `wrap`.
