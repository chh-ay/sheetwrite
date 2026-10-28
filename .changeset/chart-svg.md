---
"@sheetwrite/charts": minor
---

Draw charts as SVG: column, bar, line, area, pie, doughnut and scatter, with axes in the source cells' number formats, titles and a legend. Empty and non-numeric cells are gaps; a truncated or deleted source shows a note. Dense line, area and scatter series keep the lowest and highest value in each pixel, so 10,000 points draw fast. Each chart is an image named by its title and kind, and it redraws only when its own data changes. `registerChartsBackend()` now registers the renderer as well as the live views.
