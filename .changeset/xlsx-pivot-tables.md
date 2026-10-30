---
"@sheetwrite/xlsx": minor
---

XLSX import now reads pivot tables into pivot definitions on the sheet that holds them. The reader reads the source range, table or workbook range name, the row, column and value fields, hidden items and page fields as filters, grand totals, subtotals, a descending sort and the compact or tabular layout. Excel `count` becomes `COUNTA` and `countNums` becomes `COUNT`. The reader captures Excel's rendered values as saved pivot output before removing them from ordinary source cells. The default engine shows those values and makes them available to formulas. The full engine calculates fresh output. XLSX export writes saved output back when no fresh rendered values replace it.

When a pivot uses a feature that a pivot definition cannot hold, for example "show values as", Show All Items, a product summary, calculated or grouped fields, value filters, a custom manual item order or the outline layout, the reader keeps the pivot as an opaque part, as before, and gives an `unsupported-feature` warning.

XLSX export writes each pivot as a pivot table part and a pivot cache definition. The cache lists the field names and items from the source cells, has no records and has `refreshOnLoad="1"`, so Excel and LibreOffice calculate the output when they open the file. A pivot that OOXML cannot express, such as a `DISTINCTCOUNT` value or a deleted source, stays only in the Sheetwrite metadata and gives a warning. A workbook without pivots has no extra export cost.
