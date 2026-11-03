---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

Reuse the first selected dirty set in each recalculation pass. This avoids allocating another set and hashing the same formula keys again. Later seed sheets still add their affected formulas and spill anchors.
