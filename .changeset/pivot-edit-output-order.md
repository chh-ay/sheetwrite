---
"@sheetwrite/formulas": patch
---

A source edit under a pivot table writes the changed output cells in output order, so marking them for recalculation needs no sort. Value edits under a 100,000-row pivot take about 3% fewer instructions, and key edits about 7% fewer.
