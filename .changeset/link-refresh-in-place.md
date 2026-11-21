---
"@sheetwrite/core": patch
---

Updating linked workbooks (Edit Links' Update All, or any `setExternalLinks` change) recalculates only the formulas that read a value that changed. A link that keeps its book, sheet names, names and sheet extents keeps its sheets in the engine, and only its changed cells are written. Before, every update removed and added every link sheet, and each of those steps relinked every formula in the workbook and recalculated every formula on the sheets that read a link. With 10 links read by 10,000 formulas, an update took 444 ms; now it takes about 24 ms. A link whose sheets, names or extents change takes the old path. Values do not change.
