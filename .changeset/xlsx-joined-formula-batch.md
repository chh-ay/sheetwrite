---
"@sheetwrite/wasm": minor
"@sheetwrite/formulas": minor
"@sheetwrite/core": patch
"@sheetwrite/xlsx": patch
---

Batch XLSX formula conversion now passes one joined string and cumulative UTF-16 ends into the engine and returns only changed formulas. Unchanged strings stay in JavaScript. This removes the per-formula WASM string transfer cost on XLSX export (#624).

Breaking for direct engine callers: replace `convertXlsxFormulas(sources, exporting)` with `convertXlsxFormulas(sources.join(""), ends, exporting)`. Each end is the sum of JavaScript string lengths through that source, so surrogate pairs count as two units. Read `changes.takeIndices()` first, then consume the result with `changes.takeFormulas()`; replace those input positions and keep the rest unchanged. The result is consumed, so do not call `free()` afterward. Empty input passes `""` and an empty `Uint32Array`.

Before:

```js
const converted = engine.convertXlsxFormulas(sources, true);
```

After:

```js
let end = 0;
const ends = Uint32Array.from(sources, (source) => (end += source.length));
const changes = engine.convertXlsxFormulas(sources.join(""), ends, true);
const indices = changes.takeIndices();
const replacements = changes.takeFormulas();
const converted = sources.slice();
indices.forEach((index, position) => { converted[index] = replacements[position]; });
```

The scalar `formulaToXlsx` and `formulaFromXlsx` exports are removed. Use the same batch call with one source and `exporting` set to `true` or `false`, respectively. Core's `XlsxFormulaEngine.convert` keeps its array-based interface.
