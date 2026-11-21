---
"@sheetwrite/xlsx": patch
---

XLSX import inflates ZIP entries with the runtime's `DecompressionStream` when it has one and checks CRC-32 eight bytes at a time. The files that import, the errors and the limits stay the same.
