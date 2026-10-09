---
"@sheetwrite/core": patch
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

Keep painted and frozen cells resident during unrelated bulk reads. Load the same-sheet formula dependencies of frozen cells and reached merge anchors, and retain the bounded formula closure while its window is visible. Give bulk reads transient pins separate from the viewport's residency protection.
