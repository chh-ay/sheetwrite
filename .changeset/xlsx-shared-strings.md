---
"@sheetwrite/xlsx": patch
---

XLSX export writes text cells through a shared string table, as Excel does, so each distinct text is written once. Files are smaller and export and import faster; the cell values are the same.
