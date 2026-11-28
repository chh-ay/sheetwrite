---
"@sheetwrite/queries": patch
"@sheetwrite/core": patch
---

Query column names and query names now count as the same name when they differ only in Unicode form, such as "Ä" typed as one character or as "A" with a combining diaeresis, as table names and headers already do. A query whose output columns differ only that way is refused with `duplicate-column` when it is defined, instead of failing later when a refresh writes its table. Two saved queries named that way are refused as duplicates, and the Power Query export renames the second one.
