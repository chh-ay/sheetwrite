---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

Every function reads number text and wildcard patterns with one rule (part of #250):

- Arithmetic and number arguments read text the way `VALUE` does: `="1,000"+0` is 1000, `="50%"*2` is 1 and `="2024-01-31"+0` is 45322. Before, they gave `#VALUE!`. Excel converts text "in a format that would usually be accepted for a number" wherever an operator expects one, and reads date text the same way (`="6/1/2001"-"5/1/2001"` is 31): see Microsoft's [Calculation operators and precedence in Excel](https://support.microsoft.com/en-us/excel/calculation-operators-and-precedence-in-excel), "How Excel converts values in formulas".
- Date text must be the whole text, or a date followed by a time: `="2024-01-31 12:00"+0` is 45322.5 and `=VALUE("2024-01-31T06:00")` is 45322.25, but `="2024-01-31 notes"+0`, `=VALUE("2024-01-31 notes")` and `=DAY("2024-01-31 notes")` are `#VALUE!`. Before, `VALUE` and date arguments read the date and ignored the rest of the text.
- A space inside a number is text, as in Excel: `=VALUE("1 234")` is `#VALUE!`; before, it was 1234. `NUMBERVALUE` still ignores spaces, as documented.
- A criterion of `inf` or `nan` is text, as in Excel: `=COUNTIF(A1,"inf")` counts a cell with the text `inf`. Before, it compared with an infinite number and counted nothing.
- In criteria (`COUNTIF`, `SUMIFS`, the database functions) and wildcard lookups (`XLOOKUP` and `XMATCH` match mode 2), `?` matches one character as written, and case folds one character at a time, as in `SEARCH`: `=COUNTIF(A1,"?")` counts `İ`, and `=XMATCH("CAFÉ",A1:A9,2)` finds `café`.
