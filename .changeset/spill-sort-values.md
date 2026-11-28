---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

Sort spill rows by their displayed values instead of treating projected children as blank sources. Preserve stable ties, multi-key ordering, and filter-then-sort behavior without adding a sort cache or per-row ownership lookup.
