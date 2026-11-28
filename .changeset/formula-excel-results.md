---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

More functions give the Excel result:

- `ROUND`, `ROUNDUP`, `ROUNDDOWN`, `FIXED` and `DOLLAR` round the decimal value that Excel shows: `=ROUND(1.005,2)` is 1.01.
- A number becomes text with 15 significant digits, as in Excel: `=(0.1+0.2)&""` is `0.3`.
- `TEXT` applies number format codes: percent, thousands separators, digit placeholders, scientific notation, quoted text and sections (`=TEXT(0.5,"0%")` is `50%`).
- `CHOOSE`, `INDEX`, `ADDRESS` and other position arguments ignore a fraction: `=CHOOSE(1.5,"a","b")` is `a`. `INDEX` with a zero row or column returns the whole column or row.
- `ADDRESS`, `MATCH`, `XMATCH` and `XLOOKUP` return an error from an argument instead of `#VALUE!`.
- `COUNTIF(range,"<>")` and other not-equal criteria count values of another type.
- `SUMIF` and `AVERAGEIF` read as many sum cells as the criteria range has, from the top-left sum cell.
- `YEAR(0)`, `MONTH(0)` and `DAY(0)` are 1900, 1 and 0. `DATE` before serial 0 and date parts of a negative serial are `#NUM!`.
- `FLOOR` and `CEILING` need two arguments, give `#NUM!` for a positive number with a negative significance, and `FLOOR(0.3,0.1)` is 0.3. `CEILING(x,0)` is 0.
- `REPLACE` with a start past the end appends the new text. `TRIM` removes only spaces, as in Excel.
- In the full engine, an error argument of a `LAMBDA` reaches its body, so `=LAMBDA(x,IFERROR(x,0))(1/0)` is 0.
