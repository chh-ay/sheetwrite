---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

Changing a defined name no longer binds again and recalculates the formulas that use another name whose LET has a variable of the same spelling. Inside its LET, such a variable reads its own value, as in Excel, so those formulas do not depend on the changed name.
