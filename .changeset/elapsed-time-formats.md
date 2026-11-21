---
"@sheetwrite/core": patch
---

Number formats show elapsed time, as Excel does: `[h]:mm:ss` shows 1.5 days as `36:00:00`, and `[mm]` and `[ss]` count minutes and seconds. Before, `[h]` showed the hour of the day in brackets, so a typed `25:00` showed as `[1]:00:00`.
