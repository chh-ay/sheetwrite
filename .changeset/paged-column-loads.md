---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

Page loads write paged columns a page at a time instead of one cell at a time. Inserting or deleting columns on a paged sheet renumbers its pages in place, keeping local edits, page pins and access order instead of rebuilding every loaded cell.
