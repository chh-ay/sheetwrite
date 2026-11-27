---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

A formula preview of CORREL or COVARIANCE over two ranges where one holds a formula charges the cells once. Before, they were charged twice, so a preview of up to 1,000,000 cells could stop with a cost limit at half that size.
