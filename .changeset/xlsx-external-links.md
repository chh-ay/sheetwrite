---
"@sheetwrite/core": minor
"@sheetwrite/xlsx": minor
---

Workbooks keep the saved values of linked workbooks, and XLSX files keep their external links (#226). A snapshot holds them in `workbook.externalLinks`: for each linked workbook, its file name (`book`), its location (`target`) and the saved cells of its sheets (`ExternalLink`, `ExternalLinkSheet`, `ExternalLinkCell`, `ExternalLinkValue`). The store gives them to the engine before formulas load, so `[Budget.xlsx]Annual!C10` shows the saved value in both engines. `validateWorkbookSnapshot` checks the shape of the links only (unique book names, targets, named sheets with cell arrays). The store checks each saved cell when it loads the snapshot, and an invalid cell fails the load with `invalid-snapshot`.

XLSX import reads Excel's external link parts. Formulas that read a link, such as `'[1]Annual Plan'!C10` in the file, stay live as `'[Budget 2024.xlsx]Annual Plan'!C10`; before, they were kept as text. XLSX export writes the `[n]` form back. An unchanged link part is written byte for byte, a changed link is written from its saved values, and a workbook that a formula names without a link gets a link with no values. Formulas that name a defined name of another workbook, and DDE and OLE links, are still kept as text or dropped with a warning, as before.
