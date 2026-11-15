---
"@sheetwrite/formulas": patch
---

`GETPIVOTDATA` compares the data field, field names and value captions without case and without copying them, and finds a pivot group's output position in a flat table instead of a hash map. Formulas that read pivots with it recalculate faster.
