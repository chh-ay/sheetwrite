---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

TEXT chooses the section of a number format by its condition, such as `[>=100]` or `[=1]`, as Excel and the grid do: `=TEXT(50,"[>=100]0;0.00")` is "50.00" and `=TEXT(3,"[=1]0"" day"";0"" days""")` is "3 days".
