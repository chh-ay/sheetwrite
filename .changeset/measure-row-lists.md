---
"@sheetwrite/formulas": patch
---

Data-model measures in a pivot read each column at the cell's rows in place instead of copying its values for every cell, and a `CALCULATE` that only removes inner pivot levels, such as a region's share of its quarter, reads the rows of a group the pivot already has instead of sorting the table's rows on every update.
