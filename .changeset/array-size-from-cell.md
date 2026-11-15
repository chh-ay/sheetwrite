---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

Array formulas whose size comes from a cell, such as `=SEQUENCE(C1)`, now spill in every formula of a recalculation; the third and later ones no longer show `#NUM!`.
