---
"@sheetwrite/core": patch
---

An imported XLSX workbook is freed as soon as the page drops it. Before, checking the imported snapshot could keep the whole workbook in memory for dozens of garbage collections: 35 MB for the XLSX benchmark corpus.
