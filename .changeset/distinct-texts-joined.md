---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
"@sheetwrite/core": patch
---

Distinct-value reads hand their texts to JavaScript as one string with each text's length, instead of one string per value, so JavaScript decodes them in one call. AutoComplete's first typed key, the AutoFilter dropdown of a text column and `grid.distinctValues` read many distinct texts faster. `DistinctColumn` gains `takeTextJoined()` and `takeTextLengths()`; `takeTexts()` is unchanged.
