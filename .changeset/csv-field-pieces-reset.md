---
"@sheetwrite/core": patch
---

Reading CSV and pasted text is faster. The parser that `fromCsv`, `parseCsv` and paste share cleared its list of quoted-field pieces after every field, which costs time even when the list is already empty; it now clears the list only when a quoted field used it. `fromCsv` of 200,000 rows by 10 columns takes about a fifth less time, and parsing a pasted block of 1,000 rows by 10 columns about a third less.
