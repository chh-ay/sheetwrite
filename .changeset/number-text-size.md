---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

Write number text with a purpose-built decimal digit writer instead of Rust's float formatting, so both engines download less: about 7 KB less for the default engine and 5.5 KB less for the full engine after Brotli compression. Results are unchanged: ROUND, ROUNDUP, ROUNDDOWN, FLOOR, CEILING, TEXT, `&`, FIXED, DOLLAR and BAHTTEXT, formulas written back after an edit, and search and filter matches on numbers.
