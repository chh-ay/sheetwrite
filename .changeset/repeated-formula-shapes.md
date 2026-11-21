---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

Workbooks with repeated formulas load faster. A formula that repeats an earlier one with other cell references, as in a filled column, gets a copy of that formula's parsed form instead of being read again. Loading 100,000 such formulas takes about 40% less time.
