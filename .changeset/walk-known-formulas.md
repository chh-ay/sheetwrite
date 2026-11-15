---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

Ordering a recalculation of formulas that read other formulas no longer looks up the address of every formula it orders. A formula that a row or column insert would move onto another formula's cell is now removed instead of being left behind outside the sheet's formula list. No formula result changes.
