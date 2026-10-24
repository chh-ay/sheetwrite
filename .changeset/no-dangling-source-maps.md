---
"@sheetwrite/core": patch
"@sheetwrite/xlsx": patch
"@sheetwrite/react": patch
"@sheetwrite/vue": patch
---

Remove `sourceMappingURL` comments that pointed to source map files the packages do not publish. Debuggers and bundlers no longer try to load missing maps.
