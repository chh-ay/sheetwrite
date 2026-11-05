---
"@sheetwrite/core": minor
"@sheetwrite/xlsx": minor
---

Sort round trips with XLSX as in Excel.

- An in-place sort of a table body records the table `sortState` in the same transaction, so Excel shows the sort on the table.
- An imported worksheet `sortState` is kept as `Sheet.sortState` and written back on export, but no longer applied as a view sort: Excel writes it after a sort whose cells it already moved. A live view sort comes only from Sheetwrite's own metadata.
- Removed: the "sortState did not cover every Sheetwrite data row" import warning; an imported worksheet `sortState` is now kept whatever rows it covers.
- On export, a kept worksheet `sortState` that no longer fits the sheet is dropped with an `unsupported-feature` warning.
