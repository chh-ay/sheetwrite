---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

`COUNTIF` with a number criterion (`=COUNTIF(A1:A100000,">5")`) is now 6–10 times faster when its range holds only number values. It compares the stored numbers directly instead of reading each cell. Ranges with text, blanks, formulas or paged storage, and text or wildcard criteria, use the cell reader as before. No formula result changes.
