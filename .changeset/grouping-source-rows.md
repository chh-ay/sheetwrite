---
"@sheetwrite/formulas": patch
---

`GROUPBY` and `PIVOTBY` no longer return `#NUM!` for large sources that Excel computes. Their source rows stop counting against the 2,000,000-operation limit, so a `PIVOTBY` over 70,000 rows or a `GROUPBY` over 120,000 rows now returns its result. The groups, sorting, result cells and `LAMBDA` aggregates still count, and a new limit of 16,777,216 group placements bounds the row lists. Grouping also finds each row's group one key level at a time, so wide keys cost one lookup per level.
