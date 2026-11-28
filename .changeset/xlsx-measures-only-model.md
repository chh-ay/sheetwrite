---
"@sheetwrite/xlsx": patch
---

XLSX import keeps a data model that has measures but no relationships (#230). Such a model is written to the Sheetwrite metadata part; on import, its measures were dropped.
