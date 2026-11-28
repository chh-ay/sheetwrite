---
"@sheetwrite/formulas": patch
---

The full engine's functions that take one value run once for each element of an array or a range, as in Excel and as the built-in functions do: `=FACT({3,4})` spills 6 and 24, and `=TEXTBEFORE(A1:A3,"-")` one result for each cell. Before, both showed only the first result.

- Each family declares which arguments take one value: every argument of the engineering, complex-number (except IMSUM and IMPRODUCT), Bessel, unit, byte-text, distribution, depreciation and security functions; `k` and `x` of the percentile and rank functions; the rates and values of the financial functions, but not their cash flows or schedules.
- Lists are not expanded: the delimiters of TEXTBEFORE and TEXTAFTER match any of their elements, and SUMSQ, MULTINOMIAL, IMSUM and the regression functions read their whole ranges.
- REGEXEXTRACT and TEXTSPLIT keep their own array results.
