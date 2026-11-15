---
"@sheetwrite/core": patch
---

XLSX export and import skip the external-workbook formula scan for formulas that cannot name another workbook or call a live external-data function. Export of 100,000 formulas is about 6% faster (#624).
