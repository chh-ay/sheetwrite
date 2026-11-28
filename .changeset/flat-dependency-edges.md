---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

Store formula dependency edges in flat arrays with numeric formula ids instead of hash maps of cell lists. Exact readers are kept per source column in row bands, range readers in one array, and the depth and cycle checks use indexed state. Dependency memory is smaller, and small formula edits patch the index in place.
