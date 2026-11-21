---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

IF takes an array or a range as its condition, as in Excel. `=IF(A1:A3>1,"big","small")` spills one result for each cell, and `=SUM(IF(A1:A3>1,B1:B3))` adds the values whose condition is TRUE. Before, both gave `#VALUE!`.

- The condition and both branches broadcast to one shape. A single value, row or column repeats; an array with fewer rows or columns than the result, and more than one, gives `#N/A` in the cells outside it. A missing `value_if_false` gives FALSE and an empty branch gives 0 in each cell. An error in the condition stays in its own cell.
- IFERROR, IFNA, IFS, SWITCH and CHOOSE take arrays the same way: `=IFERROR(A1:A3/B1:B3,0)`, `=SWITCH(A1:A3,1,"one","other")` and `=CHOOSE({1,2},B1:B3,A1:A3)` spill one result for each element.
- A branch can be a range or an array: `=IF(A1>0,A1:A3,0)` spills the range when A1 is positive. A scalar condition still evaluates only the branch it takes.
