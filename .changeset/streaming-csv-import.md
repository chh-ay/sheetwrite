---
"@sheetwrite/core": patch
---

CSV import now writes each parsed record straight into its target columns instead of building an intermediate string grid, and the scanner consumes runs of plain ASCII text in one step. A same-process A/B over 200,000 rows by 10 columns measured a 22% median improvement (406 ms to 316 ms).
