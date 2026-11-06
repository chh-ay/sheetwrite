---
"@sheetwrite/core": minor
"@sheetwrite/charts": minor
"@sheetwrite/xlsx": minor
"@sheetwrite/formulas": patch
"@sheetwrite/react": minor
"@sheetwrite/vue": minor
"@sheetwrite/svelte": minor
---

**Breaking:** add-ons install through one entry point, `initSheetwrite({ engine, source, addons })`.

- Core exports one `SheetwriteAddon` type: a `name`, a `setup(context)` hook that gives core the add-on's parts, and an optional `grid({ grid, settings })` hook that runs for each new grid and may return a cleanup that runs when that grid is destroyed.
- `initSheetwrite` takes one options object. `engine` selects the engine (the default engine otherwise), `source` gives explicit WASM bytes or a URL, and `addons` lists add-ons. Setup runs once per add-on, in list order, after the engine loads. A name listed twice in one call rejects with `invalid-argument` before any setup runs. A name installed by an earlier call is kept, so repeated calls, as framework adapters make, change nothing.
- `createGrid(host, { addons: { [name]: settings } })` passes per-grid settings to an installed add-on. Settings for a name that `initSheetwrite` did not install reject with `invalid-argument` before the grid is built.
- `@sheetwrite/charts` exports `chartsAddon()` and `@sheetwrite/xlsx` exports `xlsxAddon()`. Both root entries stay free of side effects.
- The React, Vue and Svelte grid components take an `addons` prop with the same per-grid settings. A change to it recreates the grid, like the other options that apply at creation.

Removed: the `@sheetwrite/charts/register` entry; use `initSheetwrite({ addons: [chartsAddon()] })` instead.
Removed: `registerChartsBackend()` from `@sheetwrite/charts`; use `initSheetwrite({ addons: [chartsAddon()] })` instead.
Removed: the `@sheetwrite/xlsx/register` entry; use `initSheetwrite({ addons: [xlsxAddon()] })` instead.
Removed: `registerXlsxBackends()` from `@sheetwrite/xlsx`; use `initSheetwrite({ addons: [xlsxAddon()] })` instead.
Removed: `setChartRendererFactory` and `setChartViewProviderFactory` from `@sheetwrite/core`; use an add-on whose `setup` calls `context.charts({ views, renderer })` instead.
Removed: `setXlsxWorkbookBackend`, `setXlsxTableImportBackend` and `setXlsxTableExportBackend` from `@sheetwrite/core`; use an add-on whose `setup` calls `context.xlsx({ workbook, tableImport, tableExport })` instead.
Removed: the positional arguments of `initSheetwrite(source, engine)`; use `initSheetwrite({ source, engine })` instead.
