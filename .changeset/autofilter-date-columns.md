---
"@sheetwrite/core": minor
"@sheetwrite/wasm": minor
"@sheetwrite/xlsx": minor
---

The AutoFilter treats a date column as Excel does. A number whose cell has a date format is a date, and a column of mostly dates offers Date Filters. The value list groups dates by year, month and day, and each value shows as its cell shows it (`$39.50`, not `39.5`). Before, only the column's own type and format counted.

Date Filters adds Excel's periods: Tomorrow, Today, Yesterday, the next, this and last week, month, quarter and year, Year to Date, and All Dates in the Period. They are the new `ColumnFilter` kind `{ kind: "dynamic", type }`, typed `DynamicDateFilter`, with Excel's XLSX `dynamicFilter` names; `isDynamicDateFilter(name)` checks a name. XLSX import and export keep them, and export names a value list's numbers by their cells' text.
