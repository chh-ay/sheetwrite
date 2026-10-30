---
title: Operators
description: Combine values and references with spreadsheet operators, intersections, unions, and 3-D sheet spans.
---

```ts prelude="core" partial="requires an initialized grid with the inputs shown below" title="Add shared cells and separate areas"
grid.store.applyTransaction({
  patches: [
    { op: "set", addr: { sheet: "sheet1", row: 0, col: 3 },
      value: { kind: "formula", src: "=SUM(A1:C3 B2:C3)" } },
    { op: "set", addr: { sheet: "sheet1", row: 1, col: 3 },
      value: { kind: "formula", src: "=SUM((A1:A2,C1:C2))" } },
  ],
});
```

<div class="sw-grid-result" data-caption="Result: inputs in A1:C3, intersection in D1, union in D2">

| 1 | 2 | 3 | **28** |
| --- | --- | --- | --- |
| 4 | 5 | 6 | **14** |
| 7 | 8 | 9 | |

</div>

**Column D — computed outputs:** `D1` is the intersection total, and `D2` is the union total. Columns A–C contain the inputs.

The intersection adds `B2:C3`: `5 + 6 + 8 + 9 = 28`. The union adds `A1:A2` and `C1:C2`: `1 + 4 + 3 + 6 = 14`.

[Try it live — formula showcase](/showcases/formulas/). Edit a formula to try these operators.

<details>
<summary>Full setup</summary>

```ts compile title="Reference operators in a grid"
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
        { key: "a", header: "A", type: "number", width: 100 },
        { key: "b", header: "B", type: "number", width: 100 },
        { key: "c", header: "C", type: "number", width: 100 },
        { key: "result", header: "Result", type: "number", width: 140 },
      ],
    }],
  },
  data: {
    rowCount: 3,
    columns: { a: [1, 4, 7], b: [2, 5, 8], c: [3, 6, 9], result: [null, null, null] },
  },
});

grid.store.applyTransaction({
  patches: [
    { op: "set", addr: { sheet: "sheet1", row: 0, col: 3 },
      value: { kind: "formula", src: "=SUM(A1:C3 B2:C3)" } },
    { op: "set", addr: { sheet: "sheet1", row: 1, col: 3 },
      value: { kind: "formula", src: "=SUM((A1:A2,C1:C2))" } },
  ],
});
```

</details>

## Precedence

| Precedence, high to low | Operators | Associativity |
| --- | --- | --- |
| Range | `:`, postfix `#` (spill) | — |
| Intersection | space between two references | left |
| Union | `,` inside parentheses that are not a function call | left |
| Unary sign | unary `+`, unary `-` | right |
| Percentage | postfix `%` | left |
| Exponentiation | `^` | left |
| Multiplication | `*`, `/` | left |
| Addition | `+`, `-` | left |
| Concatenation | `&` | left |
| Comparison | `=`, `<>`, `<`, `>`, `<=`, `>=` | one comparison |

This follows Excel's spreadsheet precedence, not programming-language conventions:

- `=-2^2` returns `4`.
- `=2^3^2` returns `64`.
- `=2^-2` returns `0.25`.

Use parentheses when a formula must also work in a non-spreadsheet evaluator.

Percentage divides its operand by 100 and may repeat: `=50%%` returns `0.005`. Concatenation formats numbers, booleans, and blanks as spreadsheet text. Arithmetic and comparison bind before `&`.

Comparisons return native booleans. For example, `=IF(A1 >= 100, A1 * 0.9, A1)` uses a comparison as its condition.

## Intersection

A space between two references is the intersection operator. `=SUM(A1:C3 B2:D4)` adds the shared cells `B2:C3`. Intersection and union apply only to references.

| Position or input | Result |
| --- | --- |
| One-cell intersection in a value position | The value of that cell. |
| Larger intersection at the root of a formula | Spills like a range. |
| Empty intersection | `#NULL!` |
| References on different sheets | `#NULL!` |
| An operand that is not a reference | `#VALUE!` |

Other spaces are not operators. Spaces around other operators, after commas, before `)`, and between a function name and `(` do not change the formula.

## Union

A comma inside parentheses that are not a function call is the union operator. `=SUM((A1:A2,C1:C2))` adds both ranges. `=COUNT((A1,B2,C3))` counts three cells. A comma that separates function arguments is not a union.

Functions that read their arguments as a list of values accept a union. Examples are `SUM`, `COUNT`, `COUNTA`, `AVERAGE`, `MAX`, `MIN`, `PRODUCT`, `SMALL`, `LARGE`, `MEDIAN`, `STDEV.S`, `STDEV.P`, `VAR.S` and `VAR.P`. Other supported list functions include `RANK.EQ`, `MODE.SNGL`, `PERCENTILE.INC`, `QUARTILE.INC` and `GEOMEAN`.

| Function | Union behavior |
| --- | --- |
| `INDEX(reference, row, [column], [area_num])` | Returns from area `area_num`. The first area is `1`, which is the default. An `area_num` after the last area returns `#REF!`. |
| `AREAS(reference)` | Returns the number of union members, or `1` for a cell, range or intersection. |

A union in other positions returns `#VALUE!`. Examples are `=(A1,B1)`, the table of `VLOOKUP`, and `ROWS`.

## 3-D references

A 3-D reference reads the same cell or range on a span of sheets: `=SUM(Jan:Mar!B2)` or `=SUM(Jan:Mar!B2:C5)`. If a sheet name needs quotes, quote the full span: `='Sheet 1:Sheet 3'!A1`. The span includes every sheet from the first endpoint to the last endpoint, in workbook tab order.

These functions accept a 3-D reference: `SUM`, `AVERAGE`, `COUNT`, `COUNTA`, `MAX`, `MIN`, `PRODUCT`, `STDEV.S`, `STDEV.P`, `VAR.S` and `VAR.P`. A 3-D reference in other positions returns `#VALUE!`. On a sheet with a smaller grid, cells outside that grid are blank.

### Sheet edits

Sheet edits change the span as in Excel:

- A sheet that you insert or move between the endpoints joins the span.
- A sheet that you move out of the span leaves it.
- A deleted sheet leaves the span. If it is an endpoint, the endpoint moves to its inner neighbour and the formula text changes.
- If you move an endpoint past the other endpoint, that sheet leaves the span and its inner neighbour becomes the endpoint. For example, `Sheet2:Sheet6` becomes `Sheet3:Sheet6` when `Sheet2` moves after `Sheet6`.
- If you rename an endpoint, the formula text changes.
- If you delete all sheets of the span, the reference returns `#REF!`.

Row and column insertions and deletions on one sheet do not change a 3-D reference. Undo of a tab move restores any formula text that the move rewrote.

## Preservation and dependencies

Intersection dependencies include only the shared cells. Formula text for reference operators survives display, editing, and memory transfer.

XLSX import and export keep the Excel formula text of intersections, unions and 3-D references. Examples are `SUM(Jan:Mar!A1)`, `SUM((A1,B1))` and `SUM(A1:A3 A2:A4)`.

## See also

- [References, ranges, and named ranges](/docs/features/formulas/authoring-and-references/#references-ranges-and-named-ranges)
- [Dynamic arrays and spills](/docs/features/formulas/dynamic-arrays-and-spills/#dynamic-arrays-and-spills)
- [Formula function reference](/docs/reference/formula-functions/)
- [Reference-operator pull request](https://github.com/chh-ay/sheetwrite/pull/187)
