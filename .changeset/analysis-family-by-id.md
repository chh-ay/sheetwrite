---
"@sheetwrite/formulas": patch
---

Analysis functions in the full engine (for example `SUMSQ`, `AGGREGATE`, `FORECAST.LINEAR`, `TEXTBEFORE` and `GETPIVOTDATA`) find their implementation from the function's number instead of searching by its name, two to four times per call. Formulas that use them recalculate faster.
