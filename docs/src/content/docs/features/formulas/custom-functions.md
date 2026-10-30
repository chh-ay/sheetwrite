---
title: Custom functions
description: Register synchronous JavaScript functions that formulas can call, with metadata that formula help reads.
---

```ts prelude="core" partial="requires an initialized grid with the inputs shown below" title="Register a host function"
import { registerFunction } from "@sheetwrite/core/functions";

registerFunction(
  grid.store,
  {
    name: "TAXRATE",
    description: "Sales tax rate of a region.",
    arguments: [{ name: "region", types: ["text"] }],
    returnKind: "number",
    examples: ['=TAXRATE("EU")'],
  },
  (region) => (region === "EU" ? 0.2 : 0.07),
);
grid.store.applyTransaction({
  patches: [
    { op: "set", addr: { sheet: "sheet1", row: 0, col: 0 }, value: { kind: "literal", value: "EU" } },
    { op: "set", addr: { sheet: "sheet1", row: 0, col: 1 },
      value: { kind: "formula", src: "=TAXRATE(A1)*100" } },
  ],
});
```

<div class="sw-grid-result" data-caption="Result: B1 calls the host function">

| EU | **20** |
| --- | --- |

</div>

<details>
<summary>Full setup</summary>

```ts compile title="Register a host function in a grid"
import { createGrid, initSheetwrite } from "@sheetwrite/core";
import { registerFunction } from "@sheetwrite/core/functions";
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
        { key: "region", header: "Region", type: "text", width: 120 },
        { key: "rate", header: "Rate %", type: "number", width: 120 },
      ],
    }],
  },
  data: { rowCount: 1, columns: { region: [null], rate: [null] } },
});

registerFunction(
  grid.store,
  {
    name: "TAXRATE",
    description: "Sales tax rate of a region.",
    arguments: [{ name: "region", types: ["text"] }],
    returnKind: "number",
    examples: ['=TAXRATE("EU")'],
  },
  (region) => (region === "EU" ? 0.2 : 0.07),
);
grid.store.applyTransaction({
  patches: [
    { op: "set", addr: { sheet: "sheet1", row: 0, col: 0 }, value: { kind: "literal", value: "EU" } },
    { op: "set", addr: { sheet: "sheet1", row: 0, col: 1 },
      value: { kind: "formula", src: "=TAXRATE(A1)*100" } },
  ],
});
```

</details>

## Registration

Import the functions from `@sheetwrite/core/functions`. An application that does not import this entry carries none of its JavaScript.

`registerFunction(store, metadata, implementation)` adds a function to one store and recalculates every formula. Registering the same name again replaces the function. `unregisterFunction(store, name)` removes it, and formulas that call it show `#NAME?`. Names are not case-sensitive.

A name must start with a letter or `_` and contain only letters, digits, `_` and `.`. The store refuses a name that is a built-in function of the active engine or a cell reference, such as `A1` or `R1C1`. A refused name or malformed metadata throws a `SheetwriteError` with code `invalid-function`.

## Arguments and results

The function is synchronous. The engine calls it during recalculation.

- A scalar argument or a single cell arrives as a number, text, boolean, or `null` for an empty cell.
- A range or an array of more than one cell arrives as an array of rows.
- An omitted argument arrives as `null`.
- An argument that is an error, or a range that contains an error, skips the call. The formula shows that error.

The function returns a number, text, boolean, or `null` for an empty result. A thrown error, a promise, or any other value shows `#VALUE!`. A number that is not finite shows `#NUM!`. A failure never stops recalculation.

The function must not read calculated cells or change the store. The store is busy while it calculates. Reads that need the engine, such as `getCell`, and changes such as `applyTransaction` throw a `SheetwriteError` with code `blocked` before they reach the engine. If the function does not catch it, the formula shows `#VALUE!`. The document stays as it was. Use the arguments instead.

## Volatility

Set `volatile: true` in the metadata for a function whose result can change without a change in its arguments. A volatile function runs again on every edit and on `store.recalculateVolatile()`, as [`RAND`](/docs/features/formulas/volatile-functions/) does. Other functions run again only when their arguments change.

## Snapshots and collaboration

Snapshots, history and collaboration keep only the formula text. A store loaded from a snapshot shows `#NAME?` for a host function until the host registers it again. Each client calculates host functions locally, so each client must register the same functions to show the same values.

## Function metadata

`await listFunctions(store)` returns one list of `FormulaFunctionMetadata`: the built-in functions of the active engine, then the host functions of the store in registration order. The table of built-in functions loads on the first call, so an application that never asks for it does not download it. Built-in and host functions use the same fields:

| Field | Meaning |
| --- | --- |
| `name` | Upper-case function name. |
| `description` | One sentence about the function. For a built-in function, it names the function family. |
| `arguments` | `name`, `types`, `optional` and `repeating` for each argument. |
| `returnKind` | The kind of result, for example `number` or `text`. |
| `examples` | Optional example formulas. |
| `volatile` | Whether the function runs again on every edit. |
