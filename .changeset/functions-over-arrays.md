---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

A function that takes one value runs once for each element when it gets an array or a range, as in Excel, and spills an array of the same shape. `=LEN(A1:A3)` spills three lengths and `=ROUND(IF(A1:A3>1,A1:A3,0),0)` three rounded values. Before, both showed only the first result.

- Covered: the math, trigonometry, text, date, logical and IS functions, PV, FV, PMT, IPMT, PPMT, RATE and RANDBETWEEN, the criteria of COUNTIF, SUMIF and AVERAGEIF, `k` of LARGE, SMALL, PERCENTILE.INC and QUARTILE.INC, and the lookup value of MATCH, XMATCH, VLOOKUP and HLOOKUP.
- Arguments that take a range are not expanded: `=SUM(A1:A3)` and `=COUNTIF(A1:A3,">1")` still give one result.
- The arguments broadcast as operators do: a single row or column repeats, and an array smaller than the result gives `#N/A` outside itself. An error stays in its own cell.
- Functions over such a call see every element: `=SUM(ABS({-1,2}))` gives 3. Before, it gave 1.
