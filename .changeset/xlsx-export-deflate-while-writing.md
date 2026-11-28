---
"@sheetwrite/xlsx": patch
---

`toXlsxWorkbook` deflates a worksheet longer than 1 MiB as it writes it, instead of keeping the whole sheet XML and a copy of it until the archive is assembled. Export uses less memory and writes the same bytes.
