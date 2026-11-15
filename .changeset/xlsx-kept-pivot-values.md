---
"@sheetwrite/core": patch
"@sheetwrite/xlsx": patch
---

XLSX export writes the current output of a pivot it keeps in Sheetwrite metadata, such as a pivot over the data model with measures, as cells at the pivot's place with its number formats, so Excel shows the values (#495). Sheetwrite reopens the pivot live, removing those cells on import unless another application changed them. The pivot keeps its one export warning, which now says its values were written as cells.
