---
"@sheetwrite/core": patch
---

Paste and Paste Special apply the limits of pasted text to a table copied as HTML and to a copy from another Sheetwrite grid: 32 MiB, 1,000,000 rows, 16,384 columns and 1,000,000 cells. Before, only plain text had limits, so a web page could put a table of millions of cells on the clipboard.

- The size is checked before the table is parsed, and the rows, columns and cells while it is read.
- HTML past the limits gives way to the copied text, when the clipboard holds some. Otherwise the paste is refused with `DelimitedTextResourceError`, as too large a text is.
- A copy from the same grid pastes whatever its size. Its cells are in memory, so only the token at the start of its payload is read.
