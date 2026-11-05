---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

Store formula entries in workbook-owned slots with stable numeric ids. Recalculation collects affected ids in a bitset and one flat worklist. Indexed pass state replaces the formula result map and visiting set. Row and column edits keep surviving formula ids, and memory transfers continue to use cell addresses.

Vacant slots hold the free-list links without separate list allocations.

Entry storage grows in small pages, so loading formulas does not repeatedly move the whole formula table.
