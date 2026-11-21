---
"@sheetwrite/core": patch
"@sheetwrite/xlsx": patch
---

A new column type, `general`, reads what a user types as Excel's General format does: `42` is a number, `15%` is 0.15 shown as `0%`, `$4.50` is 4.5 shown as `$#,##0.00`, `1/15/2026` is a date shown as `m/d/yyyy`, `9:30 PM` is a time, and `'007` is the text `007`. New sheets, `addSheet` without `columns`, the empty columns right of a sheet's own, XLSX imports without one number format per column, and an adapter's column without `type` are `general`. Before, they were `text`, so a typed number or date in a new sheet or an opened XLSX file stayed text, and `SUM` skipped it. A column typed `text` still keeps typed text.
