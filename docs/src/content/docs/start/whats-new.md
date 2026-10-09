---
title: What's new in 0.5.0
description: The full formula engine, spill references, large undo, faster loading and import, and the upgrade checklist for Sheetwrite 0.5.0.
---

Sheetwrite 0.5.0 adds an optional full formula engine and makes large documents
faster to load, edit, and undo. All seven packages release as 0.5.0. Most apps
upgrade with no code change; read the [upgrade checklist](#upgrade-checklist) if
you run a persistence server or use `@sheetwrite/wasm` directly.

## Full formula engine

`@sheetwrite/formulas` is the same Rust engine as `@sheetwrite/wasm`, built with
the analysis families. It has the same API and loaders. Select it one time,
before you create a Grid:

```ts prelude="core" partial="requires surrounding host state" title="Select the full engine"
import { initSheetwrite } from "@sheetwrite/core";
import * as formulas from "@sheetwrite/formulas";

await initSheetwrite(undefined, formulas);
```

It adds grouping and pivot tables (`GROUPBY`, `PIVOTBY`, `PERCENTOF`), `LAMBDA`
and its helpers, 36 distribution functions, descriptive statistics, regression
(`LINEST`, `TREND`, `FORECAST.LINEAR`), finance and working-day functions,
`TEXTSPLIT` and regex, reshaping (`VSTACK`, `WRAPROWS`, `SORTBY`), database
functions, and matrices. The default engine does not change: its function set
stays the same, and formula assist suggests only the functions of the selected
engine.

- [Analysis formulas guide](/docs/guides/analysis-formulas/): one worked task per family.
- [Formula function contract](/docs/reference/formula-functions/): every function and its build.
- [Formula analysis showcase](/showcases/formulas/): thirteen panels recalculate live over 20,000 orders.

## Formulas in both engines

- **Spill references.** `=SUM(A1#)` refers to the current spill of `A1` and
  follows it when it changes size. XLSX files store it as `_xlfn.ANCHORARRAY`.
  See [Spill references](/docs/guides/formulas/#spill-references).
- **Array constants.** `={1,2;3,4}` spills two rows and two columns, and array
  constants work as function arguments. See
  [Array constants](/docs/guides/formulas/#array-constants).
- **Correct spill order.** A spill that reads another spill now shows its
  current values. Spills that read each other show `#CYCLE!`.
- **Off-screen formula reads.** With a windowed datasource, a visible formula
  that reads an off-screen column no longer stays `#LOADING!`. See
  [Cells that visible formulas read](/docs/guides/configuration/#cells-that-visible-formulas-read).

## Large undo

Undo of a very large clear now works and stays one history step. The Grid sends
the restore as one compressed `restoreBlock` operation. If that still needs more
than one server version, it uses an atomic batch through the new optional
`PersistenceAdapter.commitBatch`. An undo above every limit changes nothing and
emits `mutation-rejected`, and older edits stay undoable. See
[Undo and redo](/docs/guides/interaction/#undo-and-redo).

## Faster loading, editing, and import

- Bulk loading uses packed block writes: loading 100,000 to 1,000,000 rows was
  26–35% faster in the release measurements.
- Large `setBlock` writes, row inserts through a row bridge, collaboration
  rebase, and scrolling with wrapped text or number formats are faster.
- XLSX import streams worksheet rows and shared strings, with lower peak memory.
  CSV import writes records straight into columns.
- Lookups (`VLOOKUP`, `XLOOKUP`, `MATCH`) reuse one decoded range per
  recalculation, and many statistics, array, text, date, and finance functions
  do less work. Results do not change.

The [performance page](/docs/guides/performance-resources/) has the measured
results and the package sizes of both engines.

## Smaller changes

- The toolbar text and fill colour swatches show the theme's real colours.
  `grid.getTheme()` and the `theme-change` event are new. See
  [Theme](/docs/guides/styling/#resolution-order).
- Sheet tabs no longer scroll the page, and the sheet menu stays open when an
  unrelated part of the page scrolls.
- Row numbers no longer paint into the header corner while you scroll.

## Upgrade checklist

| You | Do this |
| --- | --- |
| Use Sheetwrite through `@sheetwrite/core` or an adapter | Nothing. Upgrade all `@sheetwrite/*` packages to 0.5.0 together. |
| Want the analysis functions | Install `@sheetwrite/formulas` and select it before you create a Grid. |
| Run a persistence or collaboration server | Accept `restoreBlock` operations before you accept 0.5.0 clients. Optional: implement `commitBatch` for undo that needs more than one version. See [Large undo and atomic batches](/docs/guides/collaboration/#large-undo-and-atomic-batches). |
| Call `CellStore.setBlock` from `@sheetwrite/wasm` directly | **Breaking.** Use `setBlockPacked` (row-major) or `setColumnBlockPacked` (column-major). They take all string cells as one UTF-8 buffer plus byte offsets. |
| Check dependency licenses or lockfiles | `@sheetwrite/core` now depends on `fflate` 0.8.3 for the restore codec. Your package manager installs it; you do not add it yourself. |

The full list of changes is in each package's `CHANGELOG.md`.
