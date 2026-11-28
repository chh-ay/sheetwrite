---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

Reading a paged cell now only stamps its page. The eviction order is kept up to date when pages load, are unpinned or are evicted, so paged reads are cheaper while the same pages are evicted in the same order.
