---
"@sheetwrite/core": patch
---

A paste that runs past the sheet's last row or column adds the rows and columns it needs, and a moved cut adds the rows it needs, in one undo step, as Excel's sheet holds them. Before, a paste of 2,000 rows into a new sheet of 1,000 rows kept the first 1,000 and dropped the rest without a word, and columns past the last one the grid showed were dropped too. A paste that would end past the sheet's row limit (1,000,000 rows) changes nothing, and the grid says why.
