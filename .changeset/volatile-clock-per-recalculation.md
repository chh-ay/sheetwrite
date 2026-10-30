---
"@sheetwrite/wasm": minor
"@sheetwrite/formulas": minor
"@sheetwrite/core": patch
---

`TODAY` and `NOW` now read the clock once in each recalculation, as in Excel. Every `TODAY` and `NOW` in one recalculation uses the same time. Before, they used only the time from the last `recalculateVolatile` call. `recalculateVolatile(date)` still uses the time you give it, until the next edit.
