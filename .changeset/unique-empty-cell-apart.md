---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

UNIQUE always keeps an empty cell apart from 0, "" and FALSE, as Excel does. Before, they merged only when their hashes happened to collide.
