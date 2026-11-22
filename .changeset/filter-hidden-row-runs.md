---
"@sheetwrite/core": patch
---

Filtering a large sheet is faster again. Since SUBTOTAL and AGGREGATE learned to skip filtered rows, each filter change listed the rows it hides through a growing JavaScript array; it now writes them straight into one typed array. On 1,000,000 rows a contains filter takes about 38% less time, and two combined filters about 18% less.
