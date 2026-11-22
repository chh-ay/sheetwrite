---
"@sheetwrite/core": patch
---

Loading columnar data with many numbers is faster: a `Float64Array` column is copied in one call, and a number cell skips the text parsing. Loading the data bench's 100,000 rows takes about 14% less time.
