---
title: Lookup, criteria, and financial formulas
description: Find values, aggregate matching cells, and calculate cash flows with explicit shape and error rules.
---

```ts prelude="core" partial="requires an initialized grid with the inputs shown below" title="Sum matching amounts"
grid.store.applyTransaction({
  patches: [
    { op: "set", addr: { sheet: "sheet1", row: 0, col: 2 },
      value: { kind: "formula", src: "=SUMIF(A1:A3,\">1\",B1:B3)" } },
  ],
});
```

<div class="sw-grid-result" data-caption="Result: C1 adds B2 and B3 because A2 and A3 exceed 1">

| 1 | 10 | **50** |
| --- | --- | --- |
| 2 | 20 | |
| 3 | 30 | |

</div>

[Try it live — formula showcase](/showcases/formulas/). Edit a formula to try this example.

<details>
<summary>Full setup</summary>

```ts compile title="Sum matching amounts in a grid"
import { createGrid, initSheetwrite } from "@sheetwrite/core";
import "@sheetwrite/core/styles.css";

const host = document.querySelector<HTMLElement>("#grid");
if (host === null) throw new Error("Missing #grid host");
host.style.height = "320px";

await initSheetwrite();
const grid = createGrid(host, {
  workbook: {
    activeSheet: "sheet1",
    sheets: [{
      id: "sheet1", name: "Sheet1", rowCount: 3,
      columns: [
        { key: "a", header: "A", type: "number", width: 120 },
        { key: "b", header: "B", type: "number", width: 120 },
        { key: "result", header: "Result", type: "number", width: 120 },
      ],
    }],
  },
  data: { rowCount: 3, columns: { a: [1, 2, 3], b: [10, 20, 30], result: [null, null, null] } },
});

grid.store.applyTransaction({
  patches: [
    { op: "set", addr: { sheet: "sheet1", row: 0, col: 2 },
      value: { kind: "formula", src: "=SUMIF(A1:A3,\">1\",B1:B3)" } },
  ],
});
```

</details>

## Criteria semantics and shapes

Criteria strings may begin with `=`, `<>`, `<`, `<=`, `>`, or `>=`. Numeric and boolean operands are parsed before text comparison. Plain text comparisons are case-insensitive. `*` matches zero or more characters, `?` matches one character, and `~` escapes the next wildcard. Wildcards apply to equality/inequality text criteria. Criteria are parsed once per formula evaluation, not once per cell.

Shapes are exact row-by-column dimensions; equal cell counts with different dimensions do not match:

- `COUNTIF(criteria_range, criterion)` accepts one matrix and one scalar criterion.
- `COUNTIFS(criteria_range1, criterion1, …)` requires one or more range/criterion pairs. Every criteria range must have exactly the shape of the first.
- `SUMIF(criteria_range, criterion, [value_range])` and `AVERAGEIF(...)` use `criteria_range` as the value range when the third argument is omitted. When supplied, `value_range` must have exactly the same shape; Sheetwrite does not implement Excel's top-left range extension.
- `SUMIFS(value_range, criteria_range1, criterion1, …)`, `AVERAGEIFS`, `MAXIFS`, and `MINIFS` require one or more pairs after the value range. Every criteria range must exactly match the value range.

A mismatch or malformed pair list returns `#VALUE!`. Matching result-range errors propagate. Text, booleans, and blanks in a numeric result range are ignored. A criteria sum with no numeric matches is `0`; an average is `#DIV/0!`; `MAXIFS`/`MINIFS` return `0`.

## SUMPRODUCT and SUBTOTAL

`SUMPRODUCT(array1, [array2, …])` requires at least one argument. Every argument must have the same exact row-by-column shape; a scalar is a 1×1 shape, and a dimensional mismatch returns `#VALUE!`. It multiplies corresponding cells and sums the products. Text, booleans, and blanks reached through ranges contribute zero; directly supplied numeric text and booleans use ordinary scalar numeric coercion. Errors propagate, and a non-finite product or total returns `#NUM!`.

`SUBTOTAL(function_number, reference1, [reference2, …])` accepts codes `1`–`11`: `AVERAGE`, `COUNT`, `COUNTA`, `MAX`, `MIN`, `PRODUCT`, `STDEV.S`, `STDEV.P`, `SUM`, `VAR.S`, and `VAR.P`. It accepts up to 253 reference arguments and uses the corresponding aggregate's range coercion/error rules. Codes `101`–`111` are deliberately unsupported and return `#VALUE!` pending hidden-row provenance in formula range values. Nested-subtotal and filtered/hidden-row exclusion must not be inferred.

## Financial functions

`PV`, `FV`, `PMT`, `NPV`, `IRR`, `RATE`, `IPMT`, and `PPMT` use binary64 arithmetic, fixed defaults from the generated signatures, and explicit domain errors. `NPV` discounts its first cash flow at period 1 and uses compensated summation. Range cash flows ignore text and blanks; errors propagate.

`IRR` requires at least one positive and one negative cash flow. `IRR` and `RATE` use the caller's guess (default `0.1`), 14 deterministic bracket steps, at most 100 deterministic solve steps, fixed absolute/relative tolerances of `1e-12`, and a finite transformed search domain. Invalid domains or failure to converge return `#NUM!`; no random seed, host locale, wall clock, or platform-specific iteration budget is used.

## Lookup semantics

- `INDEX(range, row, [column], [area_num])` uses 1-based indices and returns one scalar. Zero/negative indices return `#VALUE!`; array-return row/column projections are not implemented. `area_num` selects an area of a union, such as `=INDEX((A1:B2,D1:E2),1,1,2)`; an `area_num` after the last area returns `#REF!`.
- `MATCH(key, range, 0)` is exact. Match type `1` returns the largest value less than or equal to the key from ascending data. `-1` returns the smallest value greater than or equal to the key from descending data. Invalid ordering returns `#N/A` rather than a plausible wrong row.
- `VLOOKUP`/`HLOOKUP` use exact matching when the final argument is false. The omitted/true mode uses correctly ordered approximate data and returns the largest value less than or equal to the key.
- `XLOOKUP` supports exact, next-smaller (`-1`), next-larger (`1`), and wildcard (`2`) match modes; forward/reverse and ordered binary-search modes are accepted. `if_not_found` is optional. If it is omitted—including via an interior empty argument—the result is `#N/A`.

Lookup errors in the scanned range propagate. Approximate modes validate ordering and do not silently return a result from unsorted input.

