---
title: Calculation engine
description: "How Sheetwrite calculates formulas: two engine builds, incremental recalculation, spills, paged data, errors, and limits."
---

Sheetwrite calculates formulas in a Rust engine compiled to WebAssembly. The
TypeScript core sends edits to the engine as transactions, and the engine keeps
every formula result current. This page explains the model. The
[formulas guide](/docs/guides/formulas/) has the exact syntax and semantics.

## One engine, two builds

| Build | Package | Use it when |
| --- | --- | --- |
| Default | `@sheetwrite/wasm` | The app needs the standard functions: math, lookup, text, logic, dates, dynamic arrays, and `LET`. It is the smallest download. |
| Full | `@sheetwrite/formulas` | The app needs analysis functions: `GROUPBY`, `PIVOTBY`, `LAMBDA`, statistics, regression, finance, regex, and more. |

Both builds compile from the same source and have the same API, storage, and
limits. The full build only registers more functions. An app selects one build
one time, before it creates a Grid or a store, and cannot change it later. See
[Full formula engine](/docs/start/installation/#full-formula-engine) and the
[analysis formulas guide](/docs/guides/analysis-formulas/).

## What happens on an edit

1. The Grid or the host submits a transaction, for example a `set` operation.
2. The engine stores the new values and marks the changed cells dirty.
3. A dependency index records which formulas read which cells and ranges. The
   engine uses it to find every formula that the dirty cells affect, also
   through other formulas.
4. Only those formulas calculate again. A formula that no change reaches keeps
   its result.
5. The transaction returns after the calculation. `store.getCell(address).resolved`
   gives the new result at once, and the `change` event and the next paint show it.

The dependency index changes only when formula reads change. If you rewrite a
formula and its cell and range reads stay the same, for example a new constant,
the index stays valid.

## Spills

A formula that returns an array, such as `=SORT(A2:A100)` or `={1,2;3,4}`,
**spills**: the formula cell is the anchor, and the result fills the cells to
its right and below. Spills are atomic. If any destination cell is not empty,
the anchor shows `#SPILL!` and no partial result appears.

`A1#` refers to the current spill of `A1` and follows it when it grows or
shrinks. When one spill reads another, the engine calculates them in dependency
order, so the reader always sees current values. Spills that read each other
show `#CYCLE!`. See [Dynamic arrays and spills](/docs/guides/formulas/#dynamic-arrays-and-spills).

## Paged data and `#LOADING!`

With a windowed datasource, only some rows are in memory. A formula that reads
cells that are not loaded yet shows `#LOADING!` and calculates again when they
arrive. For visible formulas, the Grid asks the engine which same-sheet cells
they read and loads those cells with the window, within a cell budget. See
[Cells that visible formulas read](/docs/guides/configuration/#cells-that-visible-formulas-read).

## Errors are values

A formula error is a result, not an exception: `#DIV/0!`, `#N/A`, `#NAME?`,
`#REF!`, `#VALUE!`, `#NUM!`, `#SPILL!`, `#CALC!`, `#CYCLE!`, and `#LOADING!`.
Errors flow to dependent formulas, and `IFERROR` can replace them. An unknown
function returns `#NAME?`, and its source stays in the document, so a later
engine build can calculate it. See [Scalars, coercion, and errors](/docs/guides/formulas/#scalars-coercion-and-errors).

## Limits

Every formula runs inside fixed resource limits. When a formula reaches a limit,
it returns an error, usually `#NUM!`, and never a partial result:

- one range can hold at most 1,000,000 cells;
- one spill can hold at most 1,000,000 cells and 64 MiB;
- one dynamic-array calculation can do at most 2,000,000 cell operations;
- dependencies and nested expressions can be at most 256 levels deep.

The [compatibility limits](/docs/reference/compatibility-limits/#formula-evaluation)
list every limit, its unit, and its behavior.

## No network, no custom code

Formula calculation makes no network request and runs no JavaScript from the
document. Functions that need external data, such as `WEBSERVICE` or
`GOOGLEFINANCE`, are not supported. `TODAY` and `NOW` change only when the host
calls `store.recalculateVolatile(date)`.
