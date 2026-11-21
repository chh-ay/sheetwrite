---
"@sheetwrite/xlsx": patch
---

XLSX export writes cells faster. Each cell style is looked up once per column and style, and text that needs no XML escaping is not copied. The output bytes do not change.
