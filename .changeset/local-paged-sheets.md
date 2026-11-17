---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
"@sheetwrite/core": minor
---

A dense sheet that would pass the workbook's dense-cell limit now continues in local pages instead of refusing the edit: the engine moves its cells into pages that are never evicted and always loaded, and the sheet still behaves as a dense sheet. A snapshot that places sheets past `maxDenseCells` loads them the same way. Local sheets share a new workbook-wide limit, `maxLocalPagedCells` (20,000,000 cells by default); an insert past it is rejected with a `local-paged-cells` resource-limit issue, which replaces `dense-cells`. The store gives `maxDenseCells` and `maxLocalPagedCells` to the engine, capped at its ceilings of 5,000,000 and 20,000,000, so core and engine place and refuse sheets the same way. With the default limits an untrusted dense-storage snapshot can now make the engine hold up to 25,000,000 cells instead of 5,000,000; `maxLocalPagedCells: 0` keeps the old ceiling. Releasing engine memory now also returns paged pages that evictions, row deletes or a shrinking local sheet left free.
