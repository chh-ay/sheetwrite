---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

Recalculation evaluates formulas in dependency order and writes each result straight to its cell. The per-pass result table is gone, which saves about 4.5 B of retained memory per formula, and formula chains recalculate up to 1.15× faster. Results are unchanged.
