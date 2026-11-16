---
"@sheetwrite/xlsx": patch
---

XLSX files with a sheet named History open and save again. Since 0.7.0 refuses History as a new sheet name, reading or writing such a file failed with `reserved`; only a rename refuses the name now, as in Excel.
