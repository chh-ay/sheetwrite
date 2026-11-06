---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

Parse formulas in one pass: the parser reads tokens as it lexes them and climbs operator precedence in one loop, and ingest resolves sheets, defined names and table references only for formulas that hold them. Formula loading gets faster; parsed formulas, errors and formula-help messages are unchanged.
