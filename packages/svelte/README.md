# @sheetwrite/svelte

Svelte 5 components for Sheetwrite.

## Install

```sh
npm install @sheetwrite/svelte   # or: pnpm add, yarn add, bun add
```

Svelte 5 is a peer dependency. Core and WASM arrive transitively.

## Data-first component

```svelte
<script lang="ts">
import { Sheetwrite } from "@sheetwrite/svelte";
import "@sheetwrite/svelte/styles.css";
</script>

<Sheetwrite
  {columns}
  defaultRows={products}
  height="500px"
  onGridChange={(event) => console.log(event.source, event.transaction.patches)}
/>
```

`defaultRows` seeds an uncontrolled grid and is never mutated. Changing its identity intentionally creates a new generation. Use `height` or `fill`; `fill` requires an already-sized ancestor.

`onGridChange` carries the complete transaction. Persist `event.transaction.patches`, not only `event.changes`; use `SyncCoordinator` for acknowledgements, retry, and remote ordering.

WASM initializes on client mount. Use `fallback` while loading, `onInitializationError` for failures, and `wasmSource` for an explicit source.

## New in 0.6.0

- Enable the opt-in ribbon with `config={{ ribbon: true }}`. It loads only when requested. See [Toolbar and ribbon](https://sheetwrite.vercel.app/docs/features/grid/toolbar-and-ribbon/).
- Use the bound `Grid` and `grid.summarizeSelection(signal?)` for a custom status bar. The core shell shows Average, Count and Sum. See [Status bar](https://sheetwrite.vercel.app/docs/features/grid/status-bar/).
- Core adds packed large undo and sync commits that do not scan the pending queue. Both formula engines add volatile functions, reference operators and iterative calculation. See [Editing and clipboard](https://sheetwrite.vercel.app/docs/features/grid/editing-and-clipboard/), [Collaboration](https://sheetwrite.vercel.app/docs/features/collaboration/) and [Choose an engine](https://sheetwrite.vercel.app/docs/start/choose-an-engine/).

## Advanced component

```svelte
<SheetwriteGrid
  bind:grid
  {workbook}
  {data}
  presentation="data-grid"
  {editors}
  fill
/>
```

The bindable `grid` is published before
`onReady({ grid, generation, reason })` and clears during replacement or
unmount. Reset-bound inputs are `workbook`, `data`, `datasource`,
`datasourceStorage`, `presentation`, `editors`, `protectionResolver`,
`mutationPolicy`, `transactionResourceLimits`, `renderer`, `workerUrl`, and
`renderers`; `theme`, `readOnly`, `config`, `overscan`, and `minColumns` update
live.

Readiness observes the latest committed live options, including changes while
WASM initialization is pending. A throwing ready callback retires the new Grid;
consumer errors are not initialization failures. Omitted `renderer` and
`"canvas"` are equivalent. Changing an explicit `wasmSource` after readiness
preserves the Grid and retains the loader's first-source warning.

Grid callbacks are `onGridChange`, `onViewportChange`, `onSelectionChange`, `onEditBegin`, `onEditCommit`, `onSearch`, `onCommandStateChange`, `onActiveSheetChange`, `onMutationRejected`, `onRendererFallback`, `onDatasourceError`, and `onExportError`.

For vanilla/preload control, use `initSheetwrite()` and `createGrid()` from `@sheetwrite/core`. See [installation](https://sheetwrite.vercel.app/docs/start/installation/), [Svelte tutorial](https://sheetwrite.vercel.app/docs/tutorials/excel-in-svelte/), and [collaboration](https://sheetwrite.vercel.app/docs/features/collaboration/).

XLSX is not installed by this adapter. If the toolbar configuration enables
XLSX export, install `@sheetwrite/xlsx` and import
`@sheetwrite/xlsx/register` before the action (or lazily inside its handler).
CSV/TSV require no optional package.

For workbook streaming and kept XLSX parts, use the registered core workbook
APIs. See [Large files and streaming](https://sheetwrite.vercel.app/docs/import-export/large-files-and-streaming/)
and [Kept parts and round trips](https://sheetwrite.vercel.app/docs/import-export/kept-parts-and-round-trips/).
