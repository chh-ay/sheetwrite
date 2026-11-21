---
"@sheetwrite/charts": patch
---

A column or bar chart with more categories than pixels along its category axis draws each series as one path that holds all its bars, with the same geometry. A chart of three 10,000-point series redraws after an edit in a fraction of the time, because the page holds three shapes instead of 30,000 rectangles.
