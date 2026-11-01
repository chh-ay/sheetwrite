# @sheetwrite/vue

Vue 3 components for Sheetwrite.

## Install

```sh
npm install @sheetwrite/vue   # or: pnpm add, yarn add, bun add
```

Vue 3.4 or newer is a peer dependency. Core and WASM arrive transitively.

## Data-first component

```vue
<script setup lang="ts">
import { Sheetwrite } from "@sheetwrite/vue";
import "@sheetwrite/vue/styles.css";
</script>

<template>
  <Sheetwrite
    :columns="columns"
    :default-rows="products"
    height="500px"
    @grid-change="(event) => console.log(event.source, event.transaction.patches)"
  />
</template>
```

`defaultRows` seeds an uncontrolled grid and is never mutated. A new array identity deliberately creates a new generation. Use `height` or `fill`; `fill` requires an already-sized ancestor.

`grid-change` observes the complete transaction. Do not persist only
`event.changes`; use `event.transaction.patches` or attach `SyncCoordinator` to
the exposed `Grid` for mutation IDs, acknowledgements, retry, and remote ordering.

WASM initializes on client mount. Supply a `#fallback` slot while loading, observe `@initialization-error`, and use `wasm-source` only for explicit asset control.

## New in 0.6.0

- Enable the opt-in ribbon with `:config="{ ribbon: true }"`. It loads only when requested. See [Toolbar and ribbon](https://www.sheetwrite.dev/docs/features/grid/toolbar-and-ribbon/).
- Use the exposed `Grid` and `grid.summarizeSelection(signal?)` for a custom status bar. The core shell shows Average, Count and Sum. See [Status bar](https://www.sheetwrite.dev/docs/features/grid/status-bar/).
- Core adds packed large undo and sync commits that do not scan the pending queue. Both formula engines add volatile functions, reference operators and iterative calculation. See [Editing and clipboard](https://www.sheetwrite.dev/docs/features/grid/editing-and-clipboard/), [Collaboration](https://www.sheetwrite.dev/docs/features/collaboration/) and [Choose an engine](https://www.sheetwrite.dev/docs/start/choose-an-engine/).

## Advanced component

```vue
<SheetwriteGrid
  ref="gridComponent"
  :workbook="workbook"
  :data="data"
  presentation="data-grid"
  :editors="editors"
  fill
/>
```

The exposed `grid` handle is published before
`@ready="({ grid, generation, reason }) => …"` and clears during
replacement/unmount. Reset-bound inputs are `workbook`, `data`, `datasource`,
`datasourceStorage`, `presentation`, `editors`, `protectionResolver`,
`mutationPolicy`, `transactionResourceLimits`, `renderer`, `workerUrl`, and
`renderers`; `theme`, `readOnly`, `config`, `overscan`, and `minColumns` update
live.

Readiness observes the latest committed live options. A throwing ready callback
retires the new Grid; consumer errors are not initialization failures.
Omitted `renderer` and `"canvas"` are equivalent. Changing an explicit
`wasmSource` after readiness preserves the Grid and retains the loader's
first-source warning.

Events are `grid-change`, `viewport-change`, `selection-change`, `edit-begin`, `edit-commit`, `search`, `command-state-change`, `active-sheet-change`, `mutation-rejected`, `renderer-fallback`, `datasource-error`, `export-error`, `ready`, and `initialization-error`. Native DOM change/scroll listeners remain available on the host.

For vanilla/preload control, use `initSheetwrite()` and `createGrid()` from `@sheetwrite/core`. See [installation](https://www.sheetwrite.dev/docs/start/installation/), [Vue tutorial](https://www.sheetwrite.dev/docs/tutorials/excel-in-vue/), and [collaboration](https://www.sheetwrite.dev/docs/features/collaboration/).

XLSX is not installed by this adapter. If the toolbar configuration enables
XLSX export, install `@sheetwrite/xlsx` and import
`@sheetwrite/xlsx/register` before the action (or lazily inside its handler).
CSV/TSV require no optional package.

For workbook streaming and kept XLSX parts, use the registered core workbook
APIs. See [Large files and streaming](https://www.sheetwrite.dev/docs/import-export/large-files-and-streaming/)
and [Kept parts and round trips](https://www.sheetwrite.dev/docs/import-export/kept-parts-and-round-trips/).
