---
title: Dynamic arrays and spills
description: Return rectangular formula results and reference their derived spill cells.
---

```ts prelude="core" partial="requires an initialized grid with the inputs shown below" title="Create a sequence"
grid.store.applyTransaction({
  patches: [
    { op: "set", addr: { sheet: "sheet1", row: 0, col: 0 },
      value: { kind: "formula", src: "=SEQUENCE(3,2,1,1)" } },
  ],
});
```

<div class="sw-grid-result" data-caption="Result: A1 anchors a three-row, two-column spill">

| **1** | **2** |
| --- | --- |
| **3** | **4** |
| **5** | **6** |

</div>

[Try it live — formula showcase](/showcases/formulas/). Edit a formula to try this example.

<details>
<summary>Full setup</summary>

```ts compile title="Create a sequence in a grid"
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
      ],
    }],
  },
  data: { rowCount: 3, columns: { a: [null, null, null], b: [null, null, null] } },
});

grid.store.applyTransaction({
  patches: [
    { op: "set", addr: { sheet: "sheet1", row: 0, col: 0 },
      value: { kind: "formula", src: "=SEQUENCE(3,2,1,1)" } },
  ],
});
```

</details>

## Array constants

Both engines accept array constants in braces. Commas separate columns and semicolons separate rows: `={1,2;3,4}` spills into two rows and two columns. `={1,2,3}` is one row; `={1;2;3}` is one column. Normal spill limits and collision rules apply.

Elements can be numbers with an optional sign, quoted text, `TRUE`, `FALSE`, or error constants such as `#N/A`. Every row must have the same length. Empty arrays, references, and expressions inside braces are invalid and return `#VALUE!`.

Functions that accept arrays can use these values directly, for example `=SUM({1,2,3})` returns `6` and `=INDEX({1,2;3,4},2,1)` returns `3`. Copy and structural edits preserve constants and their text elements. XLSX import and export preserve the formula source.

## Spill references

Put `#` after a cell reference to refer to the whole spill of the formula in that cell. If `A1` contains `=SEQUENCE(D1)`, then `=SUM(A1#)` adds all the values in the spill, and `=SORT(A1#,1,-1)` spills them in reverse order. When the spill changes size, formulas that use `A1#` use the new range. A sheet name is permitted: `='Report'!B2#`.

`A1#` returns `#REF!` when the cell does not hold a spill: for example, the cell contains a value, or a collision blocks the spill (`#SPILL!`). If you delete the row or column of the anchor cell, the reference becomes `#REF!`. Both engines support spill references. XLSX files store `A1#` as `_xlfn.ANCHORARRAY(A1)`; import and export convert between the two forms.

Arithmetic on a whole spill applies to each element. For example, `=A1#*10` multiplies each value in the spill by 10 and spills the result.

## Array arithmetic

Operators apply to each element of a range, array constant, spill reference, or dynamic-array result. This includes arithmetic (`+`, `-`, `*`, `/`, `^`), text concatenation (`&`), comparisons, unary `+` and `-`, and `%`.

For example, `=A1:A3*10` spills three results. `=FILTER(A1:A5,B1:B5>2)` uses a comparison array to select rows. `=SUMPRODUCT((A1:A5>2)*B1:B5)` multiplies the comparison results by the values in column B.

A scalar applies to every element. Rows and columns expand separately. A size of one expands to match the other operand. For example, `={1,2,3}+{10;20}` returns `{11,12,13;21,22,23}`. If two sizes differ and neither is one, the result uses the larger size. Positions outside the smaller operand return `#N/A`.

Each element uses the scalar rules for values and errors. An error affects its element, not the whole array. Functions that accept arrays use the results directly. For example, `=SUM(A1:A3*B1:B3)` returns one sum. A top-level array result spills into adjacent cells. A blocked spill returns `#SPILL!`. Array size and memory limits still apply.

## Dynamic arrays and spills

`FILTER`, `SORT`, `UNIQUE`, `TRANSPOSE`, `SEQUENCE`, `TAKE`, `DROP`, `CHOOSECOLS`, and `CHOOSEROWS` return rectangular values. A direct range formula such as `=A1:B4` also spills:

- `FILTER(array, include, [if_empty])` accepts a one-column include range matching the array's rows or a one-row include range matching its columns. Shape mismatches are `#VALUE!`. No selected values returns `if_empty`, or `#CALC!` when omitted.
- `SORT(array, [sort_index], [sort_order], [by_col])` defaults to the first column, ascending. `sort_index` selects the row/column key; `sort_order` is `1` or `-1`; `by_col=TRUE` sorts columns instead of rows. For several keys, use `SORTBY` in the full engine.
- `UNIQUE(array, [by_col], [exactly_once])` preserves first-seen order. `by_col=TRUE` compares columns; `exactly_once=TRUE` keeps only items occurring once. An empty result is `#CALC!`.
- `TRANSPOSE(array)` swaps rows and columns.
- `SEQUENCE(rows, [columns], [start], [step])` requires positive integer dimensions and defaults to one column, start `1`, step `1`; values fill row-major.
- `TAKE`/`DROP(array, rows, [columns])` use positive counts from the start and negative counts from the end. A zero or empty result is `#CALC!`; counts beyond an axis clamp to that axis.
- `CHOOSECOLS`/`CHOOSEROWS(array, index1, …)` use 1-based positive indices and end-relative negative indices. Repeated indices repeat output axes; zero/out-of-range indices return `#VALUE!`.

Errors inside a returned array stay at their corresponding spill children; a mixed result such
as `{1;#N/A;2}` does not collapse to an anchor-only error.

The formula cell is the **anchor** and owns the complete runtime rectangle. Spill children
have no formula source or persisted document identity. `store.getSpillAnchor(address)` returns
the anchor for either the anchor or a child, and returns `null` for an ordinary cell.

Spills publish atomically. Any nonempty destination, another spill, merge, validation or
protected range, unloaded paged cell, or sheet boundary makes the anchor `#SPILL!`; no partial
children remain. Styles, conditional formatting, and hidden rows/columns do not obstruct.
Editing a projected child through canonical core mutations is rejected. Edit or clear the
anchor instead. Structural and metadata changes invalidate ownership and recompute it.

Snapshots and XLSX export serialize only the anchor formula. Children recompute after
hydration. Internal rich copy preserves the anchor formula while treating children as
derived blanks on paste; external TSV receives the displayed spill values. History snapshots
likewise restore the anchor and recompute children, so undo never persists stale projections.
Unsupported OOXML array/data-table formula records remain inert source text with an explicit
warning rather than being silently treated as Sheetwrite spills.

Each array dimension is capped at Excel's row/column limits, one spill is capped at 1,000,000
cells and 64 MiB of bounded value/intermediate storage, and one dynamic recompute pass is
capped at 2,000,000 cell operations. Materialized spill ownership across the complete store is
also capped at 1,000,000 cells and 64 MiB, including per-child error metadata. Installation
checks that cumulative budget atomically; clearing, shrinking, or removing a spill releases its
ownership. Oversized work returns stable `#NUM!` without partial children, while unstable or
colliding shapes return an explicit error rather than truncating.

The admission check happens before materialization when the shape is statically knowable and is repeated before spill ownership is installed. It accounts source/result copies and per-item auxiliary storage; a shape that could exceed a ceiling is rejected rather than optimistically allocated. A recompute either atomically replaces the complete previous spill or leaves no projected children.

