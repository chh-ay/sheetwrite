---
"@sheetwrite/core": patch
---

Reading a long entry in a `general` column takes linear time. A pasted or stored string such as a digit, thousands of spaces and a letter made the date-and-time reading backtrack in quadratic time, which froze the grid on paste, on Enter and whenever the formula bar showed the cell. Text longer than 40 characters now skips the fraction, time and date forms, none of which is that long; it stays text, as before.
