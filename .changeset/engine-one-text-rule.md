---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

Every function reads number text and wildcard patterns with one rule (part of #250):

- Arithmetic and number arguments read text the way `VALUE` does: `="1,000"+1` is 1001, `="50%"*2` is 1 and `="2024-01-31"+0` is 45322. Before, they gave `#VALUE!`.
- A space inside a number is text, as in Excel: `=VALUE("1 234")` is `#VALUE!`; before, it was 1234. `NUMBERVALUE` still ignores spaces, as documented.
- A criterion of `inf` or `nan` is text, as in Excel: `=COUNTIF(A1,"inf")` counts a cell with the text `inf`. Before, it compared with an infinite number and counted nothing.
- In criteria (`COUNTIF`, `SUMIFS`, the database functions) and wildcard lookups (`XLOOKUP` and `XMATCH` match mode 2), `?` matches one character as written, and case folds one character at a time, as in `SEARCH`: `=COUNTIF(A1,"?")` counts `İ`, and `=XMATCH("CAFÉ",A1:A9,2)` finds `café`.
