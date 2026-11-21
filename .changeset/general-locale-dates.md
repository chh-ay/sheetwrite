---
"@sheetwrite/core": patch
---

In a `general` column, dates follow the column's `numberLocale`, as Excel follows the region's short date. The editor opens a date as `15.01.2026` in `de-DE`, `15/01/2026` in `en-GB` and `1/15/2026` in `en-US` (the default). Typing reads a date in numbers in the same order, so typing back what the editor shows keeps the value. Before, dates always read and opened month first.
