---
"@sheetwrite/core": patch
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

Filters are faster in workbooks without SUBTOTAL or AGGREGATE. A filter or hidden row used to send the rows it hides to the engine on every change, for formulas that skip hidden rows. The store now keeps them until a formula that may read them is entered, and sends the latest rows then. On 10,000 rows a column filter takes about 10% less time.
