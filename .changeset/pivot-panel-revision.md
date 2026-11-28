---
"@sheetwrite/core": patch
---

An open PivotTable Fields panel no longer reads the pivot's whole source after every edit. A commit that changes only cells re-reads the source fields only when it writes to a sheet the pivot reads, or when those sheets hold formulas or another pivot's output. Other commits compare the definition and data model as before.
