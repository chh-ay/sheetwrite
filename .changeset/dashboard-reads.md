---
"@sheetwrite/core": patch
---

A dashboard reads each item from the engine once per update, and a slicer click builds the dashboard once. KPI cards and measure pivots compute their measures on every read, so an edit under a dashboard over 100,000 rows takes less than half the time, and a slicer click about 40% less.
