---
"@sheetwrite/wasm": minor
"@sheetwrite/formulas": minor
"@sheetwrite/core": patch
"@sheetwrite/xlsx": patch
---

Batch XLSX formula conversion now passes one joined string and cumulative UTF-16 ends into the engine and returns only the changed formulas. Unchanged strings stay in JavaScript, which removes the per-formula WASM string transfer cost on XLSX export (#624).

Breaking for direct engine callers: `convertXlsxFormulas(sources, exporting)` becomes `convertXlsxFormulas(sources.join(""), ends, exporting, changedIndices)`. Each end is the sum of JavaScript string lengths through that source, so a surrogate pair counts as two units. `changedIndices` is a `Uint32Array` with at least one slot per source; the call returns only the changed formulas and writes their input positions to the front of `changedIndices`. Empty input passes `""` and empty arrays.

Before:

```js
const converted = engine.convertXlsxFormulas(sources, true);
```

After:

```js
let end = 0;
const ends = Uint32Array.from(sources, (source) => (end += source.length));
const changedIndices = new Uint32Array(sources.length);
const changed = engine.convertXlsxFormulas(sources.join(""), ends, true, changedIndices);
const converted = sources.slice();
changed.forEach((formula, position) => { converted[changedIndices[position]] = formula; });
```

The scalar `formulaToXlsx` and `formulaFromXlsx` exports are removed. Use the batch call with one source, `exporting` set to `true` or `false`, and keep the source when the result is empty. Core's `XlsxFormulaEngine.convert` keeps its array interface.
