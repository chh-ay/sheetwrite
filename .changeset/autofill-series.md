---
"@sheetwrite/core": patch
---

The fill handle continues Excel's other built-in series. Quarters wrap after 4 (`Qtr3` fills `Qtr4`, `Qtr1`, `Qtr2`; also `Q3`, `Quarter 3` and `3rd Qtr`). Text that starts with an ordinal counts up (`1st Period` fills `2nd Period`, `3rd Period`). One time steps by an hour, and dates on the same day of the month (or each on the last day of its month) step by months, as `Jan-99, Apr-99` fills `Jul-99, Oct-99`. In a mixed source, each text with a number counts up once per repeat (`text1, textA` fills `text2, textA, text3`).
