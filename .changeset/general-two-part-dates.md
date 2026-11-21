---
"@sheetwrite/core": patch
---

A `general` column reads a date of two parts as Excel does: first as day and month of this year, then as month and year. `Jan-26` is 26 January of this year, `Feb-30` is February 1930, and `1/99` and `11/95` are January 1999 and November 1995. Before, `Jan-26` was January 2026 and `1/99` stayed text.
