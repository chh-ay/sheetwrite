---
"@sheetwrite/core": patch
---

A date-formatted cell holding serial 60 shows 29 February 1900, as Excel does and as `DAY`, `MONTH` and `TEXT` already did. Every date code agrees: `yyyy-mm-dd` gives `1900-02-29`, `d mmm yyyy` gives `29 Feb 1900`, and `dddd` gives `Wednesday`. Typing `1900-02-29` into a date column stores serial 60. Other serials, including dates from 1904 date system workbooks, display as before.
