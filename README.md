# Sheetwrite

A canvas spreadsheet and data grid backed by a Rust/WASM columnar engine, with an imperative core and React, Vue, and Svelte adapters.

[Documentation](https://www.sheetwrite.dev/docs/) ·
[Live showcases](https://www.sheetwrite.dev/showcases/) ·
[Release notes](https://www.sheetwrite.dev/docs/releases/) ·
[npm](https://www.npmjs.com/package/@sheetwrite/core)

## Use a framework adapter

Install one adapter. The core and the WASM engine install with it.

```sh
npm install @sheetwrite/react   # or: pnpm add, yarn add, bun add
```

```tsx
import { Sheetwrite } from "@sheetwrite/react";
import "@sheetwrite/react/styles.css";

<Sheetwrite
  columns={[
    { key: "name", title: "Name" },
    { key: "price", title: "Price", type: "currency" },
  ]}
  defaultRows={products}
  height={500}
  onGridChange={(event) => console.log(event.source, event.transaction.patches)}
/>;
```

Use the equivalent `Sheetwrite` export and package-local `styles.css` from `@sheetwrite/vue` or `@sheetwrite/svelte`. Framework components initialize WASM automatically on client mount.

`defaultRows` is an uncontrolled seed. Sheetwrite never mutates it; edits live in the grid. Changing its identity deliberately replaces the grid and creates a new readiness generation. Use `height` for fixed sizing or `fill` inside an ancestor that already has available height.

`onGridChange` is an observation hook, not an acknowledgement protocol. For
durable/versioned writes use `SyncCoordinator`; do not persist only
`event.changes`, which omits non-cell document operations.

`SheetwriteGrid` remains the advanced component for explicit `workbook` plus `data`/`datasource`. Reset-bound inputs are `workbook`, `data`, `datasource`, `datasourceStorage`, `renderer`, `workerUrl`, and `renderers`. Live inputs are `theme`, `readOnly`, `config`, `overscan`, and `minColumns`.

Readiness reports `{ grid, generation, reason }`, where reason is `initial`, `input-reset`, or `renderer-reset`. Grid events use collision-free names: `onGridChange`/`grid-change`, `onViewportChange`/`viewport-change`, selection, edit, search, and active-sheet variants. Native host change and scroll events remain available.

## Use the core without a framework

```sh
npm install @sheetwrite/core
```

```ts
import { createGrid, initSheetwrite, type Workbook } from "@sheetwrite/core";
import "@sheetwrite/core/styles.css";

await initSheetwrite();

const workbook: Workbook = {
  activeSheet: "sheet1",
  sheets: [
    {
      id: "sheet1",
      name: "Products",
      rowCount: 2,
      columns: [
        { key: "name", header: "Name", width: 180, type: "text" },
        { key: "price", header: "Price", width: 100, type: "currency" },
      ],
    },
  ],
};

const grid = createGrid(document.querySelector("#grid")!, {
  workbook,
  data: {
    rowCount: 2,
    columns: { name: ["Notebook", "Pen"], price: [12.5, 2.25] },
  },
});
```

Call `initSheetwrite()` with no arguments; you can call it more than once. To load the WASM file yourself, for example with a bundler that cannot resolve it, see [Installation](https://www.sheetwrite.dev/docs/start/installation/).

## Choose a formula engine

The default engine, `@sheetwrite/wasm`, installs with the core. It has the standard functions and the smaller download. Install the full engine when the app needs analysis functions such as `GROUPBY`, `PIVOTBY`, `LAMBDA`, statistics, regression, and finance:

```sh
npm install @sheetwrite/formulas
```

```ts
import { initSheetwrite } from "@sheetwrite/core";
import * as formulas from "@sheetwrite/formulas";

await initSheetwrite(undefined, formulas);
```

Both engines have the same API. Select one before you create a Grid or a store. See [Choose an engine](https://www.sheetwrite.dev/docs/start/choose-an-engine/), [Analysis formulas](https://www.sheetwrite.dev/docs/features/formulas/analysis-formulas/) and the [function reference](https://www.sheetwrite.dev/docs/reference/formula-functions/).

## Optional XLSX backend

Core and every framework adapter install without a concrete XLSX codec. Add the
optional backend only when the application chooses XLSX support:

```sh
npm install @sheetwrite/xlsx
```

```ts
import "@sheetwrite/xlsx/register";
import {
  fromXlsxTable,
  fromXlsxWorkbook,
  toXlsxTable,
  toXlsxWorkbook,
} from "@sheetwrite/core";
```

`grid.exportXlsx()` and framework toolbar XLSX actions use the table backend and
therefore require registration. `toXlsxTable` / `fromXlsxTable` provide
first-row-header, first-sheet interchange; `toXlsxWorkbook` /
`fromXlsxWorkbook` preserve multi-sheet snapshots, formula source, native
workbook tables and structured references, safe HTTPS/mailto or internal
hyperlinks, and the declared bounded conditional-format subset. Unsupported
OOXML table/format extensions emit structured warnings instead of silently
flattening into supported behavior. Calling any XLSX function without
registration throws an error naming the exact package and registration import.
CSV and TSV remain core-only. See [XLSX export](https://www.sheetwrite.dev/docs/import-export/xlsx-export/)
and the [detailed compatibility results](https://www.sheetwrite.dev/docs/reference/compatibility-results/)
for the exact supported features, limits, and test evidence.

## Persistence

Snapshots are the authoritative, JSON-safe persistence boundary. Hosts own
storage; core never embeds a database or endpoint:

```ts
import { createGridFromSnapshot, SyncCoordinator } from "@sheetwrite/core";

const snapshot = await adapter.load("products");
const grid = createGridFromSnapshot(document.querySelector("#grid")!, snapshot);
const sync = new SyncCoordinator(grid, adapter, {
  documentId: "products",
  serverVersion: snapshot.version ?? 0,
});

await sync.ready();
const unsubscribeRemote = sync.subscribe(remoteOperationSource);
saveButton.onclick = () => void sync.flush(); // ordered mutation IDs + acknowledgements

const backup = grid.exportSnapshot();
grid.applyRemoteOperations(remoteOperations); // observable, not dirty or undoable
```

See [Collaboration](https://www.sheetwrite.dev/docs/features/collaboration/)
for the host adapter, pending queue, conflict reload, conservative rebase,
presence, comments, and revisions.

## Packages

| Package | Purpose |
|---|---|
| `@sheetwrite/core` | Imperative grid, ribbon, store, formulas, views, export, theming |
| `@sheetwrite/wasm` | Default Rust/WASM engine; installs with the core |
| `@sheetwrite/formulas` | Optional full formula engine with analysis functions |
| `@sheetwrite/xlsx` | Optional concrete XLSX table/workbook backends and explicit registration |
| `@sheetwrite/charts` | Optional live chart views that a chart renderer reads |
| `@sheetwrite/react` | React `Sheetwrite` and `SheetwriteGrid` |
| `@sheetwrite/vue` | Vue `Sheetwrite` and `SheetwriteGrid` |
| `@sheetwrite/svelte` | Svelte `Sheetwrite` and `SheetwriteGrid` |

## New in 0.6.0

- **Ribbon.** An opt-in Excel-style ribbon with Home, Insert, Data and View tabs, in `@sheetwrite/core`. See [Toolbar and ribbon](https://www.sheetwrite.dev/docs/features/grid/toolbar-and-ribbon/).
- **Status bar.** The shell shows the Average, Count and Sum of the selection. `Grid.summarizeSelection()` gives the totals to your own status bar. See [Status bar](https://www.sheetwrite.dev/docs/features/grid/status-bar/).
- **Formulas.** Both engines add `RAND`, `RANDBETWEEN`, `FORMULATEXT`, `ISFORMULA`, `HYPERLINK`, `CELL`, `OFFSET`, `INDIRECT` and `AREAS`. Volatile formulas recalculate after each cell-changing transaction. Formulas accept intersection, union and 3-D references. Opt-in iterative calculation supports circular references; multi-cell spills inside a cycle still return `#CYCLE!`. See [Volatile functions](https://www.sheetwrite.dev/docs/features/formulas/volatile-functions/), [OFFSET and INDIRECT](https://www.sheetwrite.dev/docs/features/formulas/offset-and-indirect/), [Operators](https://www.sheetwrite.dev/docs/features/formulas/operators/) and [Iterative calculation](https://www.sheetwrite.dev/docs/features/formulas/iterative-calculation/).
- **XLSX.** Workbook import and export keep unmodeled parts within resource limits. Cell edits drop kept charts and pivot tables with a warning; structural edits drop affected images. CSV, TSV and XLSX export can stream, and workbook import can read a `Blob`. LibreOffice round-trip fixes cover alignment, dimensions and link text. See [Kept parts and round trips](https://www.sheetwrite.dev/docs/import-export/kept-parts-and-round-trips/), [Large files and streaming](https://www.sheetwrite.dev/docs/import-export/large-files-and-streaming/) and [LibreOffice compatibility](https://www.sheetwrite.dev/docs/import-export/libreoffice-compatibility/).
- **Undo and sync.** Undo of a large range is faster and uses less memory. A local commit costs the same at any offline queue depth. See [Editing and clipboard](https://www.sheetwrite.dev/docs/features/grid/editing-and-clipboard/) and [Collaboration](https://www.sheetwrite.dev/docs/features/collaboration/).
- **Charts.** A charts package is planned. See [issue #192](https://github.com/chh-ay/sheetwrite/issues/192).

## Compatibility

2,350 checked examples cover worksheet operations, formulas, workbook tables and
structured references, links, and conditional formatting. Each example is an
original Sheetwrite test or links to the public specification that it uses. The
results show what Sheetwrite does; they do not claim full Excel or Google Sheets
compatibility. See the
[detailed compatibility results](https://www.sheetwrite.dev/docs/reference/compatibility-results/)
and [compatibility limits](https://www.sheetwrite.dev/docs/reference/compatibility-limits/).

## Releases

The [release notes](https://www.sheetwrite.dev/docs/releases/) list new features,
measured performance and upgrade steps. Each package also has a `CHANGELOG.md`,
linked from the root [changelog](CHANGELOG.md). Contributor release instructions
are in [CONTRIBUTING](CONTRIBUTING.md).

## Development

Contributor and CI tooling is pinned to Bun 1.4.4, Rust 1.99.0 with the
`wasm32-unknown-unknown` target, wasm-pack 0.15.0, and cargo-audit 0.22.2.
The Bun engine range in `package.json` describes supported consumers; the
`packageManager` field and `rust-toolchain.toml` define the exact contributor
toolchain. Node 26.12.1 is the CI and development runtime. Vercel hosts the tested
static docs output; it does not install the toolchain or run a build.

Bun 1.4.4 and Node 26.12.1 include the Brotli decoder fix for
[CVE-2026-111497](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases).
The Node 24 consumer target is 24.22.1, which also includes the fix.

```sh
rustup toolchain install
bun install --frozen-lockfile
bun run toolchain:install-wasm-pack
cargo install cargo-audit --version 0.22.2 --locked
```

The canonical clean-output proof builds in a temporary source export and never
deletes working-tree files:

```sh
bun run verify:clean-build
```

For the complete local CI graph, install the browsers once, then run the
non-browser graph and the browser tests. `browser:install` installs Chromium,
Firefox, and WebKit with their operating-system dependencies.

```sh
bun run browser:install
bun run verify:ci
bun run test:browser
```

Focused contributor commands remain available:

```sh
bun run build:packages
bun run typecheck
bun run lint
bun test
bun run build:examples
bun run verify:packed
bun run verify:bundlers
bun run size:report
```

`size:report` records package, bundle, stylesheet, and WASM sizes without enforcing a release ceiling.

The documentation site is available at [www.sheetwrite.dev](https://www.sheetwrite.dev/). See the [changelog](CHANGELOG.md), [support](SUPPORT.md), [security](SECURITY.md), and [contributing](CONTRIBUTING.md) policies in this repository.

For AI-assisted development, point your agent at [`/llms.txt`](https://www.sheetwrite.dev/llms.txt). It links the task-oriented documentation index and [`/llms-full.txt`](https://www.sheetwrite.dev/llms-full.txt), containing every authored guide and all generated API declarations.

Docs deployment uses the tested CI output. See [deployment setup](CONTRIBUTING.md#documentation-deployment)
for the required GitHub secrets and the production branch.
