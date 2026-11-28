---
"@sheetwrite/core": patch
"@sheetwrite/xlsx": patch
---

Loading `@sheetwrite/xlsx` without the grid is faster and uses less memory: the codec takes the core values it needs from the internal `@sheetwrite/core/codec` entry point instead of the main entry point, so it no longer loads the grid, the canvas painters and the rest of the UI. A process that only converts or refuses XLSX files loads 83 modules instead of 198.
