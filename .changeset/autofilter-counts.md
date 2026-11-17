---
"@sheetwrite/core": minor
"@sheetwrite/wasm": minor
---

The AutoFilter dropdown counts rows. Each value shows how many rows hold it ("North 12"), as do a date column's years, months and days, and OK counts the rows the choice keeps, live: "OK (12 of 48 rows)". The engine returns the counts with the distinct values, in the same scan. A column whose own filter is a value list no longer scans the column a second time to tick its values.
