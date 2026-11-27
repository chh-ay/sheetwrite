---
"@sheetwrite/queries": patch
---

Power Query import keeps a CSV query as text when the `Columns` option of `Csv.Document` gives a different column count than the query declares, instead of ignoring the option.
