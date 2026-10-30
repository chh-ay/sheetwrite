---
"@sheetwrite/formulas": minor
"@sheetwrite/wasm": patch
---

Add saved pivot-table calculation to the full engine. Share grouping rules with PIVOTBY. Update only affected groups after source edits, and keep MIN, MAX, and DISTINCTCOUNT correct when values are removed. Add SUM and AVERAGE values exactly and round them one time, so edits give the same result as a new calculation. Include pivot caches in memory statistics.

Keep pivot output in spill state, not in formula sources. Retry output after a blocker is cleared. Recalculate formula sources and dependent formulas, retain colliding anchors after structural edits, and rebuild caches after engine memory transfer. The default engine does not include pivot calculation.
