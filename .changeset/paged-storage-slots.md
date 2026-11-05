---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

Store paged sheets in flat page, dirty-block and calculated-block directories instead of hash maps. Paged edits, acknowledgements, cache eviction and range reads through formulas get faster. Edit, acknowledgement, eviction and unloaded-cell behavior is unchanged.
