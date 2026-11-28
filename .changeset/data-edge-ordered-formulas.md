---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

Ctrl+Arrow on a sorted or filtered sheet stops at a formula whose result is blank, as it already did on an unsorted sheet and as Excel does. Before, the sorted and filtered views skipped such a formula as if the cell were empty.
