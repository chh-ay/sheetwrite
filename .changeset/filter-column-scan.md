---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

Combined column filters are faster. Each filter now reads its own column down the rows the earlier filters kept, literal cells of a dense column are answered from their stored kind and value, and a value list matches literal text by its pool id. On 1,000,000 rows, a contains filter combined with another takes about 24% less time.
