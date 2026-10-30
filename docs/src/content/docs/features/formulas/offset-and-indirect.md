---
title: OFFSET and INDIRECT
description: Choose reference targets at calculation time with OFFSET and INDIRECT.
---

```ts prelude="core" partial="requires an initialized grid with the inputs shown below" title="Sum a shifted reference"
grid.store.applyTransaction({
  patches: [
    { op: "set", addr: { sheet: "sheet1", row: 0, col: 2 },
      value: { kind: "formula", src: "=SUM(OFFSET(A1,0,1,3,1))" } },
  ],
});
```

<div class="sw-grid-result" data-caption="Result: OFFSET selects B1:B3 and C1 sums them">

| 1 | 10 | **60** |
| --- | --- | --- |
| 2 | 20 | |
| 3 | 30 | |

</div>

[Try it live — formula showcase](/showcases/formulas/). Edit a formula to try this example.

<details>
<summary>Full setup</summary>

```ts compile title="Sum a shifted reference in a grid"
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
      value: { kind: "formula", src: "=SUM(OFFSET(A1,0,1,3,1))" } },
  ],
});
```

</details>

## Dynamic references

`OFFSET(reference, rows, cols, [height], [width])` returns a reference shifted from the top-left cell of `reference`. Omitted dimensions inherit the original reference's height and width. For example, `=SUM(OFFSET(A1,0,1,3,1))` sums `B1:B3`; `=OFFSET(A1:A3,0,1)` spills those three cells. Offsets truncate toward zero. A result outside the Excel grid returns `#REF!`. Height and width must be positive; nonpositive dimensions, a non-reference first argument or a nonnumeric offset return `#VALUE!`.

`INDIRECT(text, [a1])` resolves reference text at calculation time. The default `a1=TRUE` accepts A1 notation, such as `=INDIRECT("B"&A1)`. With `FALSE`, it accepts R1C1 notation: `=INDIRECT("R1C2",FALSE)` reads `B1`, and `=INDIRECT("R[-1]C",FALSE)` reads the cell one row above the formula. Sheet-qualified references, defined names and table references are supported. Invalid text, missing targets and external workbook references return `#REF!`; evaluation never opens another workbook.

Both functions return references, so they can feed reference-taking functions such as `ROW`, `AREAS`, `SUM` and `FORMULATEXT`; multi-cell formula results spill. They recalculate after each edit, even when the target is chosen at runtime. Runtime dependency cycles return `#CYCLE!`. Existing range and spill limits apply, and reading beyond the loaded sheet returns `#REF!`.

Fill, copy and structural edits rewrite ordinary reference arguments to `OFFSET`. They do not rewrite text inside `INDIRECT`: `"A1"` remains `"A1"` after a row insertion.


## Runtime recalculation

Runtime targets are not added to the static dependency graph. These functions use the volatile index and recalculate on every edit. A sheet recompute with volatile formulas recalculates volatile formulas across the workbook. An unchanged spill does not recalculate its readers.

A one-cell result is a plain scalar, not a one-cell spill, and uses no spill budget. Merged runtime reads do not create a false cycle.

See [volatile functions](/docs/features/formulas/volatile-functions/) for explicit recalculation and [dynamic arrays and spills](/docs/features/formulas/dynamic-arrays-and-spills/) for limits.
