---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

Restoring engine memory refuses a cell kind the store cannot hold in paged storage too, as it already did for dense storage.
