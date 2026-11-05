---
"@sheetwrite/core": minor
"@sheetwrite/formulas": minor
---

The full engine adds Excel's `CONVERT` function (#274). It converts between the units of Excel's 13 unit groups. Metric units take decimal prefixes, and `bit` and `byte` also take binary prefixes. Each factor is the exact definition of the unit, so a result can differ from Excel in the last digits.

The default engine does not change.
