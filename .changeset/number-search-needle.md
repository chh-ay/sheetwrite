---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

Search and filter skip writing a number cell out as text when the search text has a character no number's text contains, such as a letter, so searching numeric columns for text is several times faster. Numbers with many significant digits are also written as text faster in formula text, search and filter. Results and matches are unchanged.
