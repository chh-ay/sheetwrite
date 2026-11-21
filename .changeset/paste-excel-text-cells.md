---
"@sheetwrite/core": patch
---

A paste from Excel keeps the cells in Excel's Text format as text, as Excel does. Excel marks them in the HTML it copies (`mso-number-format:"\@"` or `x:str`); before, a new sheet or an imported column read them as typed entries, so `007` became 7 and a text `1/15/2026` became a date. Such a cell also takes the Text format `@`, except with Paste Values. Plain text from Excel still reads as typed entries, as it does in Excel.
