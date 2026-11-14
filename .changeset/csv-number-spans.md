---
"@sheetwrite/core": patch
---

`fromCsv` reads a plain number in a number, currency or date column straight from the input text, without building a string for it first. Imported values, quoting, `=` handling and resource errors are unchanged.
