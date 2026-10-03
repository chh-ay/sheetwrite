---
"@sheetwrite/xlsx": patch
---

Faster XLSX import with lower peak memory. Worksheet rows and shared strings are read as they are parsed instead of being kept in a full XML tree, start tags and attributes are scanned without regular expressions or temporary arrays, the ZIP checksum loop no longer goes through the iterator protocol, and each cell style is copied once instead of twice. On the 1 MB benchmark workbook, a same-process A/B measured a 38% median improvement (1,675 ms to 1,039 ms) and peak memory fell from 476 MiB to 312 MiB. The imported snapshot is unchanged.
