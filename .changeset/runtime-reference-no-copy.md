---
"@sheetwrite/formulas": patch
"@sheetwrite/wasm": patch
---

Recalculating OFFSET and INDIRECT formulas no longer copies each formula's tree twice. 100,000 `=OFFSET(…)` or `=INDIRECT(…)` cells recalculate about 25–30% faster.
