---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

Cells waiting for the next recalculation are kept in a flat sorted list instead of a hash set. Formulas made only of values, cell references and operators (`=A1+1`) skip the four metadata walks over their parsed tree that other formulas still need. Loading and editing such formulas, and small edits that start a recalculation, do less work. No formula result changes.
