---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

Loading formulas in address order appends to the formula index without a search, and reads the stored entry by its id. Dense columns and large workbooks reserve whole index and slot pages, so loading copies less.
