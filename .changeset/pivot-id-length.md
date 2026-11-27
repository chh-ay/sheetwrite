---
"@sheetwrite/core": patch
---

A pivot ID is at most 128 characters, the bound tables, table columns, charts and hyperlinks already have. It was 255. A snapshot or document operation with a pivot ID of 129 to 255 characters, which 0.6 accepted, is now refused: shorten such IDs before loading the document in 0.7.
