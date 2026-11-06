---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

Search and filter skip writing a number cell out as text when the search text has a character no number's text contains, such as a letter. Searching numeric columns for text is several times faster; matches are unchanged.
