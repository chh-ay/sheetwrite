---
"@sheetwrite/charts": patch
---

Scatter charts no longer draw their first x-axis label into the lowest y-axis label where the two axes meet. The first x label starts at the left edge of the plot, and is left out when it would then reach the next x label.
