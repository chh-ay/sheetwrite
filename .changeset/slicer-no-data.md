---
"@sheetwrite/core": minor
---

Slicers mark values with no data, as Excel does (#231). A slicer dims each value that no row has under the other slicers; `itemsWithNoData: "hide"` hides those values and `"show"` shows every value plainly, matching Excel's slicer settings. The engine computes this in the normal pivot pass, with one hidden pivot per slicer.
