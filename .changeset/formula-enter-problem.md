---
"@sheetwrite/core": patch
---

Enter no longer stores a formula that does not parse, as in Excel. It shows "There's a problem with this formula." with the problem, then keeps the cell editor (or the formula bar) open with the problem selected. When only closing parentheses are missing at the end, Enter adds them: `=SUM(A1:A3` stores `=SUM(A1:A3)`.
