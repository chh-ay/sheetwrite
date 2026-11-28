# @sheetwrite/vue

## 0.7.0

### Minor Changes

- [#622](https://github.com/chh-ay/sheetwrite/pull/622) [`5ddb4b4`](https://github.com/chh-ay/sheetwrite/commit/5ddb4b458a11733138ec0a8eb9b48f9522aeb400) Thanks [@chh-ay](https://github.com/chh-ay)! - **Breaking:** the simple `Sheetwrite` component has one size rule in React, Vue and Svelte: give exactly one of `height` or `fill`.
  
  - All three check it the same way, while rendering and before a grid mounts. Both or neither throws `SheetwriteError` with code `invalid-argument` and operation `create-grid`. React used to accept both or neither at run time and let `fill` win. Svelte checked after the grid had mounted.
  - Vue types `fill` as `fill?: true`, like React and Svelte, and its `SheetwriteProps` is now a type alias whose `height` and `fill` exclude each other. Code that extends the `SheetwriteProps` interface must use the type instead, and TypeScript code that passes `fill: false` must leave `fill` out.
  - The Svelte `Sheetwrite` declaration keeps the `Row` and `Id` generics, so `columns`, `getRowId` and the row callbacks are typed from your `defaultRows`.

- [#466](https://github.com/chh-ay/sheetwrite/pull/466) [`2800304`](https://github.com/chh-ay/sheetwrite/commit/28003040e4c0eed510d19bf960f65021bb522239) Thanks [@chh-ay](https://github.com/chh-ay)! - **Breaking:** add-ons install through one entry point, `initSheetwrite({ engine, source, addons })`.
  
  - Core exports one `SheetwriteAddon` type: a `name`, an optional `setup(context)` hook that gives core the add-on's page-wide parts, and an optional `grid({ grid, settings })` hook that runs for each new grid and may return a cleanup that runs when that grid is destroyed.
  - `initSheetwrite` takes one options object. `engine` selects the engine (the default engine otherwise), `source` gives explicit WASM bytes or a URL, and `addons` lists add-ons. Setup runs once per add-on, in list order, after the engine loads. A name listed twice in one call rejects with `invalid-argument` before any setup runs. A name installed by an earlier call is kept, so repeated calls, as framework adapters make, change nothing. The registry code loads only when a page installs an add-on.
  - `createGrid(host, { addons: { [name]: settings } })` and `createGridFromSnapshot` pass per-grid settings to an installed add-on. Settings for a name that `initSheetwrite` did not install reject with `invalid-argument` before the grid is built. A grid hook that throws destroys the grid.
  - Each add-on package exports one factory named `<name>Addon`, and each loads its heavy code on first use:
    - `chartsAddon()` from `@sheetwrite/charts`: the SVG drawing code loads when a grid is created.
    - `xlsxAddon()` from `@sheetwrite/xlsx`: the codec loads on the first XLSX call.
    - `functionsAddon([{ metadata, implementation }])` from `@sheetwrite/core/functions`: functions given at init apply to every grid; `addons: { functions: [...] }` adds functions to one grid and replaces init functions of the same name there. Functions register when a grid is created; there is no runtime add or remove.
    - `queriesAddon({ fetchSource })` from `@sheetwrite/queries`: each grid with a `fetchSource` gets a query session, which `querySessionOf(grid)` resolves to. The engine loads in the background when such a grid is created.
    - `historyAddon()` from `@sheetwrite/core/history`: a grid with `addons: { history: { archive, authorId } }` shows Version History and Save Version.
    - `externalLinksAddon({ resolve })` from `@sheetwrite/core/external-links`: gives each grid's Edit Links panel its Update Values resolver.
  - The React, Vue and Svelte grid components take an `addons` prop with the same per-grid settings. A change to it recreates the grid, like the other options that apply at creation.
  
  Removed: the `@sheetwrite/charts/register` entry; use `initSheetwrite({ addons: [chartsAddon()] })` instead.
  Removed: `registerChartsBackend()` from `@sheetwrite/charts`; use `initSheetwrite({ addons: [chartsAddon()] })` instead.
  Removed: the `@sheetwrite/xlsx/register` entry; use `initSheetwrite({ addons: [xlsxAddon()] })` instead.
  Removed: `registerXlsxBackends()` from `@sheetwrite/xlsx`; use `initSheetwrite({ addons: [xlsxAddon()] })` instead.
  Removed: `setChartRendererFactory` and `setChartViewProviderFactory` from `@sheetwrite/core`; use an add-on whose `setup` calls `context.charts({ views, renderer })` instead.
  Removed: `setXlsxWorkbookBackend`, `setXlsxTableImportBackend` and `setXlsxTableExportBackend` from `@sheetwrite/core`; use an add-on whose `setup` calls `context.xlsx({ workbook, tableImport, tableExport })` instead.
  Removed: the positional arguments of `initSheetwrite(source, engine)`; use `initSheetwrite({ source, engine })` instead.
  Removed: `registerFunction` from `@sheetwrite/core/functions`; use `functionsAddon([...])` at init or `createGrid(host, { addons: { functions: [...] } })` instead.
  Removed: `unregisterFunction` from `@sheetwrite/core/functions`; use a grid created without the function instead.
  Removed: `createQuerySession` from `@sheetwrite/queries`; use `queriesAddon({ fetchSource })` and `querySessionOf(grid)` instead.
  Removed: `registerQueryCommands` from `@sheetwrite/core`; use an add-on whose `grid` hook calls `context.queryCommands(commands)` instead.
  Removed: `createHistoryCommands` from `@sheetwrite/core/history` and `GridConfig.history`; use `historyAddon()` and `createGrid(host, { addons: { history: { archive, authorId } } })` instead.
  Removed: `HistoryCommandsOptions` from `@sheetwrite/core/history`; use `HistoryAddonOptions` instead.
  Removed: `connectExternalLinks` from `@sheetwrite/core/external-links`; use `externalLinksAddon({ resolve })` instead.

- [#543](https://github.com/chh-ay/sheetwrite/pull/543) [`9a85f26`](https://github.com/chh-ay/sheetwrite/commit/9a85f26aecb57b42ff10f8f4702d2f833c5ea259) Thanks [@chh-ay](https://github.com/chh-ay)! - The stylesheet ships in parts under `@sheetwrite/core/styles/`: `grid.css` (always needed), `formula-help.css`, `find.css`, `ribbon.css`, `panels.css`, `context-menu.css`, `tabs.css`, `charts.css`, `icons.css` and `dashboard.css`. A grid with only `grid.css` ships about 5 KB of CSS instead of 89.5 KB. `styles.css` imports every part, so an app that imports it looks the same as before. The framework adapters have the same parts, for example `@sheetwrite/react/styles/ribbon.css`. In a development build, a widget whose part is missing logs one warning that names the part.
  
  The command icon sheet is now its own file, `styles/icons.svg`, which `icons.css` loads, instead of a `data:` URL inside the stylesheet. Only pages that show icons download it, and the browser caches it. `@sheetwrite/core/icons.svg` still points at the same sheet.
  
  Upgrade checklist:
  
  - Nothing to do if you import `styles.css` with Vite, webpack or Next.js: they copy `icons.svg` into the build.
  - With esbuild, give `.svg` files a loader, for example `loader: { ".svg": "file" }`. Without one, the build fails with `No loader is configured for ".svg" files: icons.svg`.
  - If you set `--sheetwrite-icon-sheet` only because your Content Security Policy blocks `data:` images, you can remove it: the default sheet is now a file from your own origin.
  - To ship less CSS, replace `styles.css` with the parts your grid uses, `grid.css` first. The docs page on styles lists which part each widget needs.

- [#888](https://github.com/chh-ay/sheetwrite/pull/888) [`202525e`](https://github.com/chh-ay/sheetwrite/commit/202525e5609ff968522c4171a874cce1ca76f067) Thanks [@chh-ay](https://github.com/chh-ay)! - Users can change the grid's keys in a Keyboard shortcuts panel ([#802](https://github.com/chh-ay/sheetwrite/issues/802)). Excel's keys stay the defaults.
  
  - `config.keyboardSettings: true` turns the panel on. It opens from File › Options › Keyboard Shortcuts in the ribbon, from a gear in the compact ribbon, and from `grid.openKeyboardSettings()`. Its code loads on first use.
  - The user searches commands by name or keys, or presses keys to find the command that owns them. Each row shows the keys beside Excel's default.
  - The user records new keys, swaps or replaces keys another command owns, and resets one command or all of them. Undo reverts the last change, and Export and Import move the bindings as JSON. Each change applies at once.
  - Keys that type, move in the sheet, or never reach the page are refused with the reason. Examples: Ctrl+W in Chrome, and ⌘⇧3 on a Mac.
  - The grid emits `key-bindings-change` with the bindings that differ from Excel's. The host stores them and passes them back through `config.keyboard.bindings`. The adapters forward the event as `onKeyBindingsChange` in React and Svelte, and as `@key-bindings-change` in Vue.
  - `keyboardSettings: { locked: [...] }` shows commands read-only. New types: `KeyBindings` and `KeyboardSettingsOptions`.

### Patch Changes

- [#1340](https://github.com/chh-ay/sheetwrite/pull/1340) [`ea391f5`](https://github.com/chh-ay/sheetwrite/commit/ea391f5e510e9fbfc6dde9369b2f076d62da215d) Thanks [@chh-ay](https://github.com/chh-ay)! - A React or Vue grid mounted on a page whose WASM is already initialized no longer renders its fallback before the grid appears, as the Svelte grid already did. Both rendered the fallback first and removed it once the grid was created. During server rendering and hydration the fallback still shows, because the server has no WASM.

- [#320](https://github.com/chh-ay/sheetwrite/pull/320) [`5409cb5`](https://github.com/chh-ay/sheetwrite/commit/5409cb525b6a0946f890b2c4cf3b897512b3ce9f) Thanks [@chh-ay](https://github.com/chh-ay)! - Unmounting a React, Vue or Svelte grid destroys it and aborts its pending summaries, lazy chrome, clipboard work and built-in saves without an error event. Late initialization and publication failures from an unmounted or replaced grid are not reported. Shared WASM initialization continues for other mounted grids.
  
  **Upgrade checklist:** treat an `AbortError` from `grid.summarizeSelection()` after unmount as cancellation. Destroy host-created sync and collaboration coordinators yourself when the view is removed.

- [#320](https://github.com/chh-ay/sheetwrite/pull/320) [`5409cb5`](https://github.com/chh-ay/sheetwrite/commit/5409cb525b6a0946f890b2c4cf3b897512b3ce9f) Thanks [@chh-ay](https://github.com/chh-ay)! - `<Sheetwrite>` reports an invalid `height`/`fill` combination as `SheetwriteError` with code `invalid-argument` and operation `create-grid`.
  
  **Upgrade checklist:** code that caught this as a plain `Error` by message should check `error.code === "invalid-argument"`.
- Updated dependencies: @sheetwrite/core@0.7.0

## 0.6.1

### Patch Changes

- Updated dependencies [[`c29a25a`](https://github.com/chh-ay/sheetwrite/commit/c29a25a65c4ff01ae32ad89fc6b32dde4798ffde)]:
  - @sheetwrite/core@0.6.1

## 0.6.0

### Minor Changes

- fbdd6db: Release with the other packages, so all eight packages share version 0.6.0 and the adapters depend on `@sheetwrite/core` 0.6.0. The adapter APIs do not change.

### Patch Changes

- 8d70aae: Package READMEs and API doc comments link to the restructured documentation pages.
- 3bdb073: The packages are smaller to install. The code is not minified and stays readable.
  
  - `@sheetwrite/core` is 1.83 MB → 1.55 MB unpacked (387 KB → 350 KB packed), with 214 → 157 files.
  - The packages publish only the type declarations that their entry points use. Core no longer ships 57 internal declaration files (117 KB), and `@sheetwrite/xlsx` no longer ships 8. You cannot import these files through the package `exports`, so no types change.
  - The published JavaScript uses 2-space indentation instead of 4. This saves 155 KB in core and 20 KB in `@sheetwrite/xlsx`.
  - `@sheetwrite/wasm` and `@sheetwrite/formulas` no longer publish `pkg/sheetwrite_wasm_bg.wasm.d.ts` (14 KB each). No entry point refers to it, and `sheetwrite_wasm.d.ts` has the same types.
- Updated dependencies [cbcf0b8]
- Updated dependencies [81e45e3]
- Updated dependencies [92dcd37]
- Updated dependencies [d99f762]
- Updated dependencies [b159a35]
- Updated dependencies [b159a35]
- Updated dependencies [b159a35]
- Updated dependencies [92dcd37]
- Updated dependencies [92dcd37]
- Updated dependencies [b6f333c]
- Updated dependencies [8d70aae]
- Updated dependencies [9dc3ab1]
- Updated dependencies [03ad409]
- Updated dependencies [286ac93]
- Updated dependencies [ec8e0ee]
- Updated dependencies [0b5cc2d]
- Updated dependencies [ec8e0ee]
- Updated dependencies [78665d3]
- Updated dependencies [60590f9]
- Updated dependencies [c56a350]
- Updated dependencies [c0f9c00]
- Updated dependencies [0f36fda]
- Updated dependencies [92dcd37]
- Updated dependencies [c56a350]
- Updated dependencies [3bdb073]
- Updated dependencies [ec8e0ee]
- Updated dependencies [bcfe991]
- Updated dependencies [bcfe991]
- Updated dependencies [2984b0b]
- Updated dependencies [5308206]
  - @sheetwrite/core@0.6.0

## 0.5.4

### Patch Changes

- cb8a609: Remove `sourceMappingURL` comments that pointed to source map files the packages do not publish. Debuggers and bundlers no longer try to load missing maps.
- Updated dependencies [cb8a609]
  - @sheetwrite/core@0.5.4

## 0.5.3

### Patch Changes

- 885b764: Package READMEs show npm, pnpm, Yarn, and Bun install commands, and the core and WASM READMEs explain how to select the full formula engine.
- 222a3f8: Publish readable JavaScript again. 0.5.2 removed whitespace from the published files, so stack traces pointed into one long line and the code in `node_modules` was hard to read and debug. Your bundler still minifies your app build. Module paths, exports, and type documentation do not change.
- Updated dependencies [885b764]
- Updated dependencies [222a3f8]
  - @sheetwrite/core@0.5.3

## 0.5.2

### Patch Changes

- 2e4231c: Remove comments and extra whitespace from published JavaScript to reduce package download and installed sizes. Keep module paths, exported names, type documentation, and WebAssembly binaries unchanged.
- Updated dependencies [e09f014]
- Updated dependencies [f836aba]
- Updated dependencies [2e4231c]
  - @sheetwrite/core@0.5.2

## 0.5.1

### Patch Changes

- 7d9b52a: Add checked API examples and links for grid setup, data, synchronization, framework components, engine selection, and XLSX import and export.
- Updated dependencies [1f50d09]
- Updated dependencies [7d9b52a]
- Updated dependencies [edb091d]
  - @sheetwrite/core@0.5.1

## 0.5.0

### Minor Changes

- 4e5b8e2: Align the framework adapters and XLSX integration with the coordinated Sheetwrite 0.5.0 release.
- e6b6dbb: Share adapter initialization, reset classification, Grid generation publication, and retirement through `createAdapterGridController` in `@sheetwrite/core/adapter`. Apply pending live options before readiness, retire a new Grid when publication or readiness callbacks throw, preserve first-source loader diagnostics without replacing healthy Grids, and treat omitted and canvas renderers as the same input.

### Patch Changes

- ed66b6d: Faster large edits, scrolling and collaboration paths. Results are unchanged; numbers are medians from alternating runs.
  
  - A large `setBlock` measures its payload once per commit instead of three times: a 1,000,000-cell block write is 60% faster (1,364 ms to 545 ms), 50% faster with detailed change capture.
  - Number and date cells reuse their formatted text, and wrapped text stops laying out lines that cannot be drawn: wrapped-text scrolling is 39% faster and number-format scrolling 14% faster.
  - Inserting rows with a row bridge checks duplicate IDs with a set: inserting 10,000 rows into 1,000,000 fell from 34.7 s to 5 ms.
  - Framework adapters subscribe to command state only while a command-state handler exists, so selection skips the per-cell summary otherwise (24% faster selection without a handler).
  - Rebasing operations no longer clones them a second time (98% faster for a large block), and sparse writes skip validation rules outside the written area (22% faster with 100 unrelated rules).
  - A search highlight or note on a partly visible top row is no longer dropped, and a command-state handler installed inside a selection or change callback now receives the following emission.
- cb78a4b: Exclude source maps from published library packages to reduce download and install size. Keep maps in local builds for development and size analysis.
  
  Declare only CSS files as side effects in the React, Vue, and Svelte adapters. Bundlers can remove unused JavaScript and keep imported stylesheets.
- Updated dependencies [a490186]
- Updated dependencies [b2379eb]
- Updated dependencies [fca4622]
- Updated dependencies [be6b618]
- Updated dependencies [ed66b6d]
- Updated dependencies [a9a3c5f]
- Updated dependencies [9915236]
- Updated dependencies [11e9336]
- Updated dependencies [b8dbb50]
- Updated dependencies [a767c8b]
- Updated dependencies [26a3552]
- Updated dependencies [0f4b9da]
- Updated dependencies [d1d34b9]
- Updated dependencies [cf1a10c]
- Updated dependencies [48be92d]
- Updated dependencies [ef2b0f5]
- Updated dependencies [2c03528]
- Updated dependencies [2b5f1eb]
- Updated dependencies [cb12daa]
- Updated dependencies [73cb52a]
- Updated dependencies [4d4b204]
- Updated dependencies [be093cd]
- Updated dependencies [43b0e9c]
- Updated dependencies [7221484]
- Updated dependencies [b54b29a]
- Updated dependencies [e6b6dbb]
- Updated dependencies [e725d98]
- Updated dependencies [eb1c786]
- Updated dependencies [bc7bc53]
- Updated dependencies [59e8d1a]
- Updated dependencies [fdc14ce]
- Updated dependencies [99435f8]
  - @sheetwrite/core@0.5.0

## 0.4.0

### Minor Changes

- Align the framework adapters and XLSX integration with the coordinated Sheetwrite 0.4.0 release.

### Patch Changes

- Updated dependencies [8457eca]
- Updated dependencies [dac694a]
- Updated dependencies [0e09ecc]
- Updated dependencies [41f6749]
- Updated dependencies [41f6749]
- Updated dependencies [41f6749]
- Updated dependencies [41f6749]
- Updated dependencies [55b1f35]
- Updated dependencies [b225783]
- Updated dependencies [41f6749]
- Updated dependencies [ce1e404]
  - @sheetwrite/core@0.4.0

## 0.3.1

### Patch Changes

- Correct the Vue adapter release metadata and package-specific changelog without changing runtime behavior.
- Updated dependencies
  - @sheetwrite/core@0.3.1

## 0.3.0

### Minor Changes

- e551eb0: Emit typed `SheetwriteError` failures through the `initialization-error` event while preserving Vue grid readiness and input-reset lifecycle behavior.

### Patch Changes

- Updated dependencies [e551eb0]
  - @sheetwrite/core@0.3.0

## 0.2.0

### Minor Changes

- 6ed7572: Harden collaboration, persistence, paged datasource, snapshot, and spreadsheet interchange boundaries; add bounded XLSX import/export with independent producer coverage; improve large-dataset cache behavior and browser rendering; and ship complete framework, database, collaboration, interoperability, and performance showcases.
- 87fadb7: Strengthen collaboration recovery, bounded persistence and paging, snapshot resource enforcement, and framework adapter contracts.

  Replace the optional XLSX implementation with a bounded OOXML codec, broaden workbook fidelity and producer conformance, and add deterministic performance evidence.

  Ship searchable capability-owned evaluation surfaces for framework integration, database lifecycle, collaboration, interoperability, and million-row performance.

### Patch Changes

- Updated dependencies [6ed7572]
- Updated dependencies [87fadb7]
  - @sheetwrite/core@0.2.0
