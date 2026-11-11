---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

Loading a snapshot, editing or pasting cells, and loading datasource pages are faster: plain values (numbers, text, `TRUE`/`FALSE` and blanks) are now written one column at a time instead of one cell at a time. Results are unchanged. Writes that include formulas or cell references, sheets that show spilled formula results, and paged datasources still write one cell at a time.
