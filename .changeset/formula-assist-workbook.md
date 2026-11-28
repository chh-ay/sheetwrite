---
"@sheetwrite/formula-assist": patch
---

Formula assist also suggests from the rest of the workbook. The nearest formula in the same column, inside the same block of filled cells, is proposed even when only one side has it, and the workbook's most common formulas, counted by shape, complete what you type once one of them holds most of the formulas that fit. These two show only from 98% measured confidence. The add-on counts the formulas of visible sheets in idle time after the grid mounts, never during the page's first load, keeps the count current as cells change, and keeps it in memory only (at most 100,000 formula cells and 5,000 different formulas per workbook). On 50 whole Enron workbooks it was never tuned on, it saves 62.0% of keystrokes with 0.7% of suggestions wrong; before, it saved 50.2% with 0.6% wrong on the same formulas.
