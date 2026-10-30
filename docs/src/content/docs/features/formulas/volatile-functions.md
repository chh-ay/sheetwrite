---
title: Volatile functions
description: Recalculate random values and runtime references on edits, or supply a fixed UTC clock instant.
---

```ts prelude="core" partial="requires an initialized grid with the inputs shown below" title="Read a fixed clock"
grid.store.applyTransaction({
  patches: [
    { op: "set", addr: { sheet: "sheet1", row: 0, col: 0 },
      value: { kind: "formula", src: "=TEXT(NOW(),\"yyyy-mm-dd hh:mm\")" } },
  ],
});
grid.store.recalculateVolatile(new Date("2026-07-13T18:00:00.000Z"));
```

<div class="sw-grid-result" data-caption="Result: A1 uses the fixed UTC instant">

| **2026-07-13 18:00** |
| --- |

</div>

[Try it live — formula showcase](/showcases/formulas/). Edit a formula to try this example.

<details>
<summary>Full setup</summary>

```ts compile title="Read a fixed clock in a grid"
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
      id: "sheet1", name: "Sheet1", rowCount: 1,
      columns: [
        { key: "result", header: "Result", type: "number", width: 120 },
      ],
    }],
  },
  data: { rowCount: 1, columns: { result: [null] } },
});

grid.store.applyTransaction({
  patches: [
    { op: "set", addr: { sheet: "sheet1", row: 0, col: 0 },
      value: { kind: "formula", src: "=TEXT(NOW(),\"yyyy-mm-dd hh:mm\")" } },
  ],
});
grid.store.recalculateVolatile(new Date("2026-07-13T18:00:00.000Z"));
```

</details>

## Recalculation and clock

`OFFSET`, `INDIRECT`, `RAND`, `RANDBETWEEN`, `TODAY` and `NOW` are volatile. Each edit recalculates them and their dependents, as in Excel. A transaction without source changes recalculates nothing. `TODAY` and `NOW` read the clock once per recalculation, never during paint or a dependency read, so every formula in one recalculation sees the same time. To recalculate without an edit, or to use a fixed time, the host passes one absolute instant to a barrier:

```ts prelude="core" partial="requires surrounding host state" title="Partial example"
store.recalculateVolatile(new Date("2026-07-13T18:00:00.000Z"));
```

The default uses `new Date()`. The instant is converted to a UTC serial, so a fixed `Date` produces identical results in every host timezone. The next edit reads the clock again. `TODAY` returns its whole-day component; `NOW` retains the fraction.

`RAND()` returns a number in `[0, 1)`. `RANDBETWEEN(bottom, top)` returns an integer in `[bottom, top]`. It rounds `bottom` up and `top` down; if the result is an empty interval, it returns `#NUM!`, and a non-numeric bound returns `#VALUE!`. Each engine instance seeds its own generator. The generator is not cryptographic.

## Work and limits

The engine creates a per-sheet volatile index only while that sheet has volatile formulas, and frees it with the last one. Sheets without volatile formulas do no extra work for this index.

An unused `LET` binding does not mark a formula volatile. See [LET bindings](/docs/features/formulas/authoring-and-references/#let-bindings).

Volatile functions inside an iterative cycle run on each iteration. Random values can keep a cycle from settling. See [iterative calculation](/docs/features/formulas/iterative-calculation/).

`OFFSET` and `INDIRECT` select targets at runtime. See [OFFSET and INDIRECT](/docs/features/formulas/offset-and-indirect/).
