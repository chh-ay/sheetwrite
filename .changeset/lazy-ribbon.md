---
"@sheetwrite/core": patch
---

The ribbon now loads as its own chunk when `config.ribbon` (or the shell's `ribbon: true`) asks for it, so grids without a ribbon no longer download it: about 25 KB less minified JavaScript for every `createGrid` app. The grid reserves the ribbon's height while it loads, so nothing moves when it arrives.
