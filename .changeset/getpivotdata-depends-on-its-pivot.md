---
"@sheetwrite/formulas": patch
---

`GETPIVOTDATA` is no longer volatile. It depends on its pivot, as in Excel: it recalculates when the pivot's output changes (a source edit, a refresh or a new field layout), not on every edit. An edit that leaves every pivot unchanged recalculates no `GETPIVOTDATA` formula.
