---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

Fix a hang when a chain of defined names uses each next name more than once. Each name is expanded once per formula again, and definitions are resolved in dependency order.
