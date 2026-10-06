---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

An edit that changes only formula constants keeps the dependency index, so the
next recompute does not rebuild it for the whole workbook. Sparse, packed, and
scalar writes now share one source-replacement module.
