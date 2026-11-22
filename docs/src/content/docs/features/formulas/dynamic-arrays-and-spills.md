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

```ts compile runnable title="Create a sequence in a grid"
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

## Conditions over arrays

`IF`, `IFERROR`, `IFNA`, `IFS`, `SWITCH`, and `CHOOSE` take arrays and ranges as Excel does. When the condition of `IF` or `IFS`, the value that `IFERROR` or `IFNA` tests, the expression or a case of `SWITCH`, or the index of `CHOOSE` is an array, the function runs once for each element and returns an array. For example, `=IF(A1:A3>1,"big","small")` spills three results, and `=SUM(IF(A1:A3>1,B1:B3))` adds the values in column B whose condition is TRUE.

The other arguments expand with the same rules as operators: `=IF({TRUE,FALSE},B1:B3,A1:A3)` and `=CHOOSE({1,2},B1:B3,A1:A3)` return a two-column table. A missing `value_if_false` gives `FALSE` and an empty argument gives `0` in each element. An error in the condition stays in its element.

When the condition is one value, the function returns the argument it takes, which can be a range or an array. For example, `=IF(A1>0,A1:A3,0)` spills `A1:A3` when `A1` is positive. The other argument is not evaluated.

## Functions over arrays

A function that takes one value runs once for each element when it gets an array or a range there, as in Excel, and returns an array of the same shape. For example, `=LEN(A1:A3)` spills three lengths, `=ROUND(B1:B3,{0,1})` spills a three-by-two table, and `=SUM(LEN(A1:A3))` adds the lengths. This covers the math, trigonometry, text, date, logical and IS functions, the financial functions `PV`, `FV`, `PMT`, `IPMT`, `PPMT` and `RATE`, and `RANDBETWEEN`, which draws once for each element.

Arguments that take a range are never expanded. `SUM(A1:A3)` adds the range. In `COUNTIF`, `SUMIF` and `AVERAGEIF` only the criteria expand, in `LARGE`, `SMALL`, `PERCENTILE.INC` and `QUARTILE.INC` only `k`, in `LOOKUP` only the lookup value, and in `MATCH`, `XMATCH`, `VLOOKUP` and `HLOOKUP` the lookup value and the number arguments. For example, `=LARGE(A1:A10,{1,2,3})` returns the three largest values.

The arguments expand with the same rules as operators: a single row repeats down, a single column across, and an array with fewer rows or columns than the result, and more than one, gives `#N/A` in the cells outside it. An error stays in its own element: `=ISERROR(A1:A3)` tests each cell.

The full engine (`@sheetwrite/formulas`) applies the same rule to its own functions: for example `=FACT({3,4})`, `=BITAND(A1:A3,12)`, `=TEXTBEFORE(A1:A3,"-")` and the statistical distributions spill one result for each element. Arguments that are lists are not expanded: the delimiters of `TEXTBEFORE` and `TEXTAFTER` are a set to match any of, and `IMSUM`, `SUMSQ` and the regression functions read their whole ranges.

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
Typing a value, filling, or pasting into a projected child keeps the new source value.
That value blocks the array: the anchor shows `#SPILL!`, and the other projected children
disappear. Clear or move the blocking value to let the formula spill again. This follows
Microsoft's [nonblank spill range rule](https://support.microsoft.com/en-us/excel/how-to-correct-a-spill-error).
Structural and metadata changes invalidate ownership and recompute it.

Snapshots serialize only the anchor formula. Children recompute after hydration. XLSX
export marks the anchor as an Excel dynamic array, and a grid's export also writes the
children's values, as Excel does; XLSX import reads Excel's dynamic arrays back as anchor
formulas and drops those values. Internal rich copy preserves the anchor formula while treating children as
derived blanks on paste; external TSV receives the displayed spill values. History snapshots
likewise restore the anchor and recompute children, so undo never persists stale projections.
Legacy OOXML array formulas (Ctrl+Shift+Enter, without the dynamic-array flag) and data-table
formula records remain inert source text with an explicit warning rather than being silently
treated as Sheetwrite spills.

## Editing a spill

The formula belongs to its anchor. Children show calculated output, not separate formulas.
This is distinct from editing the anchor's formula through a child's formula bar; Microsoft
describes that formula text as [not editable](https://support.microsoft.com/en-us/excel/dynamic-array-formulas-and-spilled-array-behavior).

- **Type, fill, or paste:** New source values remain where written. If the anchor remains,
  any nonempty source in its output range blocks the whole spill. A write that replaces the
  anchor removes its formula and all former children.
- **Clear or Delete:** Clearing a projected child or a child-only rectangle does not remove
  calculated output. Clear the anchor to remove the complete spill. A selection that includes
  the anchor can clear it without selecting every child. A blocking value is an ordinary
  source cell, so clearing it restores the spill.
- **Cut:** Cut the anchor, or a selection containing the anchor, to move its formula.
  A child-only cut is not performed and does not replace the clipboard. Use Copy and Paste
  Values when you need independent copies of displayed results.
- **Rows and columns:** Insert and delete operate on sources, then recompute the rectangle.
  Inserting or deleting a child row or column does not create independent child values.
  Removing the anchor's row or column removes the spill. A result that no longer fits the
  sheet shows `#SPILL!`.
- **Undo and redo:** Local commands restore sources and recompute output. Remote changes,
  including an originator's undo or redo, follow the same spill rules. Received operations
  do not enter the receiver's local undo history.

### Sort and filter

Sort commands move the cells, as Excel's Sort does; see [Sort cells in place](/docs/features/data/data-operations/#sort-cells-in-place).
An in-place sort that would move only part of a spill range is refused and changes nothing.

A view sort and filters use displayed cell values, including every projected spill result.
Single-key and multi-key view sorts keep row order stable when the keys are equal. Filtering
selects the displayed rows before sorting them. These view changes leave the anchor,
spill ownership, and formula references unchanged and support undo and redo.

## Spill limits

Each array dimension is capped at Excel's row/column limits, one spill is capped at 1,000,000
cells and 64 MiB of bounded value/intermediate storage, and one dynamic recompute pass is
capped at 2,000,000 cell operations. Materialized spill ownership across the complete store is
also capped at 1,000,000 cells and 64 MiB, including per-child error metadata. Installation
checks that cumulative budget atomically; clearing, shrinking, or removing a spill releases its
ownership. Oversized work returns stable `#NUM!` without partial children, while unstable or
colliding shapes return an explicit error rather than truncating.

The admission check happens before materialization when the shape is statically knowable and is repeated before spill ownership is installed. It accounts source/result copies and per-item auxiliary storage; a shape that could exceed a ceiling is rejected rather than optimistically allocated. A recompute either atomically replaces the complete previous spill or leaves no projected children.

