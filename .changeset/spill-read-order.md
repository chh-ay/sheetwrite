---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

Fix a spill that reads another spill showing the previous values. When the spill it reads is placed later in the same recalculation, the reading spill is now calculated again. Spills that read each other show #CYCLE!.
