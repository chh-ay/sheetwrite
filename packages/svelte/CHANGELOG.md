# @sheetwrite/svelte

## 0.7.0

### Minor Changes

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

### Patch Changes

- [#318](https://github.com/chh-ay/sheetwrite/pull/318) [`3644d27`](https://github.com/chh-ay/sheetwrite/commit/3644d278220a06a4701bb53e9ad98efb5a108353) Thanks [@chh-ay](https://github.com/chh-ay)! - Remove redundant formula-transfer work, share criteria aggregation rules, and remove unused XLSX and declaration code. Correct engine safety and XLSX ownership comments without changing public behavior.

- [#320](https://github.com/chh-ay/sheetwrite/pull/320) [`5409cb5`](https://github.com/chh-ay/sheetwrite/commit/5409cb525b6a0946f890b2c4cf3b897512b3ce9f) Thanks [@chh-ay](https://github.com/chh-ay)! - Unmounting a React, Vue or Svelte grid destroys it and aborts its pending summaries, lazy chrome, clipboard work and built-in saves without an error event. Late initialization and publication failures from an unmounted or replaced grid are not reported. Shared WASM initialization continues for other mounted grids.
  
  **Upgrade checklist:** treat an `AbortError` from `grid.summarizeSelection()` after unmount as cancellation. Destroy host-created sync and collaboration coordinators yourself when the view is removed.

- [#320](https://github.com/chh-ay/sheetwrite/pull/320) [`5409cb5`](https://github.com/chh-ay/sheetwrite/commit/5409cb525b6a0946f890b2c4cf3b897512b3ce9f) Thanks [@chh-ay](https://github.com/chh-ay)! - `<Sheetwrite>` reports an invalid `height`/`fill` combination as `SheetwriteError` with code `invalid-argument` and operation `create-grid`.
  
  **Upgrade checklist:** code that caught this as a plain `Error` by message should check `error.code === "invalid-argument"`.
- Updated dependencies [[`2800304`](https://github.com/chh-ay/sheetwrite/commit/28003040e4c0eed510d19bf960f65021bb522239), [`5409cb5`](https://github.com/chh-ay/sheetwrite/commit/5409cb525b6a0946f890b2c4cf3b897512b3ce9f), [`55bffb1`](https://github.com/chh-ay/sheetwrite/commit/55bffb17ed553f16f652aaed03f2cbd87b27970d), [`2db15ef`](https://github.com/chh-ay/sheetwrite/commit/2db15efe6fa4d9d2948528d504281af9d72d16cd), [`f8bce6b`](https://github.com/chh-ay/sheetwrite/commit/f8bce6bcea2f4bcedfacf38ec22ad64fc52fcd8a), [`c267c94`](https://github.com/chh-ay/sheetwrite/commit/c267c94ebc4f2c6d4f83e361b28d44fee5956f53), [`c267c94`](https://github.com/chh-ay/sheetwrite/commit/c267c94ebc4f2c6d4f83e361b28d44fee5956f53), [`b98d86b`](https://github.com/chh-ay/sheetwrite/commit/b98d86b61c767e0ba037723b9802ea855b2c8837), [`9fcc918`](https://github.com/chh-ay/sheetwrite/commit/9fcc918cbf03bbf1f66767afb2b4753605fb9b54), [`dc9a6d5`](https://github.com/chh-ay/sheetwrite/commit/dc9a6d5fa145f5044503254b6b54e3c52ebcf866), [`94242d0`](https://github.com/chh-ay/sheetwrite/commit/94242d0eb3617f966a7df596bbfdb63c15349746), [`a6eefc5`](https://github.com/chh-ay/sheetwrite/commit/a6eefc5842d994b1ebf3ed699c74cc762c87377b), [`1aada28`](https://github.com/chh-ay/sheetwrite/commit/1aada28341741ee998205962f203179a87c6c5b9), [`4b705e2`](https://github.com/chh-ay/sheetwrite/commit/4b705e28bf9a003192d234b7e3becd385fe1481b), [`9669e3c`](https://github.com/chh-ay/sheetwrite/commit/9669e3c83b42c23c9705477295baacc0b4c421fa), [`acbd1e2`](https://github.com/chh-ay/sheetwrite/commit/acbd1e2864bfe552c30efd5303ec3ee9e215e721), [`afa9bcc`](https://github.com/chh-ay/sheetwrite/commit/afa9bcc25a08321681187f8c300ff05b5e863271), [`968df36`](https://github.com/chh-ay/sheetwrite/commit/968df36c94d94a615b8b3ef03da24a6a1a0b5be1), [`8298eda`](https://github.com/chh-ay/sheetwrite/commit/8298edad91dc51947941284785a83a2a662cecb1), [`b59c0af`](https://github.com/chh-ay/sheetwrite/commit/b59c0afccb201c5fb5d22584d311543e717ef71b), [`3c9dac3`](https://github.com/chh-ay/sheetwrite/commit/3c9dac3ffd83f1427a688cde26dc65eeade1f78d), [`8a543f7`](https://github.com/chh-ay/sheetwrite/commit/8a543f7a11f9d9a9b8df6039c66e99a7c0e9bd5c), [`3a7e6be`](https://github.com/chh-ay/sheetwrite/commit/3a7e6befde186f767c645c2d3357b05b27aa2039), [`1f2c4b0`](https://github.com/chh-ay/sheetwrite/commit/1f2c4b004364b864901c70303a661146c8e45911), [`ea18b3e`](https://github.com/chh-ay/sheetwrite/commit/ea18b3e1dceab79231f8df7aa21895f80ef556a3), [`50a75e6`](https://github.com/chh-ay/sheetwrite/commit/50a75e6b993b75c1ca8c63ec261dd24e49d6ebe7), [`df99575`](https://github.com/chh-ay/sheetwrite/commit/df9957517d2f9f513d9da546fa6b9e2f7752f17f), [`9667e81`](https://github.com/chh-ay/sheetwrite/commit/9667e815c363f3ae03f5896273c3559a2a8aceda), [`466708a`](https://github.com/chh-ay/sheetwrite/commit/466708a5b45ab4774e6eafd27a79f824ea8a9591), [`19ac121`](https://github.com/chh-ay/sheetwrite/commit/19ac1213c5f1323b339d05e8a0dcb32cbdeb7307), [`c67bb48`](https://github.com/chh-ay/sheetwrite/commit/c67bb489582f6920810aeba2f020ae5d4bec6266), [`cc07fea`](https://github.com/chh-ay/sheetwrite/commit/cc07fea9c9c6d2781fa829cafae4c0bfb40f4079), [`27bb47b`](https://github.com/chh-ay/sheetwrite/commit/27bb47bd95cfa5f8b35df9add770486b48a0b754), [`b08cb80`](https://github.com/chh-ay/sheetwrite/commit/b08cb80b3d3a29e34336b2c9cf65f4b8fae74840), [`916b452`](https://github.com/chh-ay/sheetwrite/commit/916b452044664a2753150a7e061c6d08b369f5f4), [`5474c76`](https://github.com/chh-ay/sheetwrite/commit/5474c76349cf2bfa491893be1548ef274ca94904), [`9968bc5`](https://github.com/chh-ay/sheetwrite/commit/9968bc5511decc2a7aa7ce2f9c06861d0c52ae4f), [`675dd15`](https://github.com/chh-ay/sheetwrite/commit/675dd15b224763ebda96f5f0e06bceee908efcee), [`6ec955a`](https://github.com/chh-ay/sheetwrite/commit/6ec955a0d74c229dfc7eeeb61631b02f69b101d4), [`7a7ba88`](https://github.com/chh-ay/sheetwrite/commit/7a7ba88f7c7f17b9527aa4384a4073899e0372b7), [`5620780`](https://github.com/chh-ay/sheetwrite/commit/56207806761765cf486187dd1e72851813f75457), [`08fbebf`](https://github.com/chh-ay/sheetwrite/commit/08fbebfd3b654070de6edbd15d4d72398eb5198d), [`d519828`](https://github.com/chh-ay/sheetwrite/commit/d519828c399b00c0f6a7646633a11853d9bf8eeb), [`cc9a143`](https://github.com/chh-ay/sheetwrite/commit/cc9a1430bea2f7e1bfdf56f883612c4aacdad42b), [`3f5a91f`](https://github.com/chh-ay/sheetwrite/commit/3f5a91f65974b3631efd6cfd6687933effe95be5), [`3c57cb9`](https://github.com/chh-ay/sheetwrite/commit/3c57cb9e038c94cd17c7fac9a7fff2d01344b03e), [`3890a7a`](https://github.com/chh-ay/sheetwrite/commit/3890a7abdc2ce352119ef73cd62e4782206b438a), [`c0b2ac0`](https://github.com/chh-ay/sheetwrite/commit/c0b2ac0ee506b2ff4e57ae6012da0cbaaf6ceb1c), [`4727a3d`](https://github.com/chh-ay/sheetwrite/commit/4727a3de909c0645d11a0dc74196fecfea68008c), [`3310e7e`](https://github.com/chh-ay/sheetwrite/commit/3310e7eeb14684e1386903d1462b3eb977b84106), [`19fd4b5`](https://github.com/chh-ay/sheetwrite/commit/19fd4b541cbdc6343513c21f8c16b05e0efdea10), [`01b8d72`](https://github.com/chh-ay/sheetwrite/commit/01b8d729b92351e46e3f343aa08ca33604ef3284), [`f1609ee`](https://github.com/chh-ay/sheetwrite/commit/f1609ee5e6ffb6a77226780a94827e2fcc493ec5), [`f1609ee`](https://github.com/chh-ay/sheetwrite/commit/f1609ee5e6ffb6a77226780a94827e2fcc493ec5), [`cd6dc20`](https://github.com/chh-ay/sheetwrite/commit/cd6dc204da50474d221f33f634b3e5d097649b51), [`d078939`](https://github.com/chh-ay/sheetwrite/commit/d0789397aa1d91efdb6de0d3e3ccd1e6b03751c6), [`52daf35`](https://github.com/chh-ay/sheetwrite/commit/52daf35c41d27a52d827d87adcb005595ebe1605), [`3ef2323`](https://github.com/chh-ay/sheetwrite/commit/3ef2323d90d26e6f2be276b4ad799259ccb7b45f), [`969dc82`](https://github.com/chh-ay/sheetwrite/commit/969dc8211886ca106bac441ff5f8e6a6254fcbdd), [`17664a9`](https://github.com/chh-ay/sheetwrite/commit/17664a95da5d137a5e0863f9434ffa5d6ccbc771), [`c4933f9`](https://github.com/chh-ay/sheetwrite/commit/c4933f93d43e82e7613482e80fd8c822ff13fdaa), [`b0668a3`](https://github.com/chh-ay/sheetwrite/commit/b0668a31e8074c494d42889ed0d078683d0f89c5), [`444420c`](https://github.com/chh-ay/sheetwrite/commit/444420ccc6c529d21c9712ef6c2a55d10f7b61e7), [`b549147`](https://github.com/chh-ay/sheetwrite/commit/b549147b27a46393ececb62accbac54a8ca0d5a6), [`01b399c`](https://github.com/chh-ay/sheetwrite/commit/01b399ccf838032efe327e3dd63e301b7678ad11), [`dd153bb`](https://github.com/chh-ay/sheetwrite/commit/dd153bb24808b011b90c48cf8d3061a743b7d0e6), [`8229709`](https://github.com/chh-ay/sheetwrite/commit/82297093792ceda7833750a2896e13fca515b216), [`d83d1bc`](https://github.com/chh-ay/sheetwrite/commit/d83d1bc1c43941523448322e04de2f190ca4d9e7), [`2251d6e`](https://github.com/chh-ay/sheetwrite/commit/2251d6eab0951e556c13fa9a5c8bf1639608dd0d), [`1d49097`](https://github.com/chh-ay/sheetwrite/commit/1d49097901768723e2bd0e880ee0e33256e0a958), [`5409cb5`](https://github.com/chh-ay/sheetwrite/commit/5409cb525b6a0946f890b2c4cf3b897512b3ce9f), [`d0b34a7`](https://github.com/chh-ay/sheetwrite/commit/d0b34a770f74e2f42ab4bf67b3a9387b158537bf), [`8c9bc55`](https://github.com/chh-ay/sheetwrite/commit/8c9bc55a0661ee138e16d7f1594c53bf626c5157), [`21f64aa`](https://github.com/chh-ay/sheetwrite/commit/21f64aa87263d59cb996b0e04da9801a7deceebf), [`9ef07fe`](https://github.com/chh-ay/sheetwrite/commit/9ef07fea96dd5491352ad9ffe54aa5270dc61ff1), [`2db15ef`](https://github.com/chh-ay/sheetwrite/commit/2db15efe6fa4d9d2948528d504281af9d72d16cd), [`b029afe`](https://github.com/chh-ay/sheetwrite/commit/b029afe02f2a0933a1efb451dcc8cebc4d3773c7), [`72fb51c`](https://github.com/chh-ay/sheetwrite/commit/72fb51c15c49a625e726d8f110e48dfdedd0d7ef), [`5e9ba79`](https://github.com/chh-ay/sheetwrite/commit/5e9ba79d2fc0eb562fde68a2261f3633d678bd3a), [`1c41081`](https://github.com/chh-ay/sheetwrite/commit/1c410818c95bf1f27ed5fa3744e580cf7c9bc7b5), [`b7cef92`](https://github.com/chh-ay/sheetwrite/commit/b7cef927b5223a57f2f5fd08d1a4b4749f0fa31a), [`d59c5e6`](https://github.com/chh-ay/sheetwrite/commit/d59c5e693a45fd51392d3f1fa48f91548c4e1b7e), [`a1444f0`](https://github.com/chh-ay/sheetwrite/commit/a1444f00af111dd7921130f2e28fd1374a594eee), [`cfc6d1f`](https://github.com/chh-ay/sheetwrite/commit/cfc6d1fae12c8e3fd6b68db0b93af83a1ccb531e), [`e0c3655`](https://github.com/chh-ay/sheetwrite/commit/e0c3655b1fec3b8dd5771e234d8280a7bdf9cc4f), [`97796fe`](https://github.com/chh-ay/sheetwrite/commit/97796fe66ab5551a95b5fea9253e73b08d683646), [`0069438`](https://github.com/chh-ay/sheetwrite/commit/006943813203de185a6167146506d4647e581557), [`8ebfd62`](https://github.com/chh-ay/sheetwrite/commit/8ebfd62869f3bce4eb86123520ea0e155247707e), [`50eb898`](https://github.com/chh-ay/sheetwrite/commit/50eb89857ce7791003eb8a7e200682396ce7fd83), [`380f3d5`](https://github.com/chh-ay/sheetwrite/commit/380f3d5a3fac92da7e0389c099a8f27d91e5b90e), [`487e7f7`](https://github.com/chh-ay/sheetwrite/commit/487e7f7262f7fccd92f3d8a213be8130ce525861)]:
  - @sheetwrite/core@0.7.0

## 0.6.1

### Patch Changes

- Updated dependencies [[`c29a25a`](https://github.com/chh-ay/sheetwrite/commit/c29a25a65c4ff01ae32ad89fc6b32dde4798ffde)]:
  - @sheetwrite/core@0.6.1

## 0.6.0

### Minor Changes

- fbdd6db: Release with the other packages, so all eight packages share version 0.6.0 and the adapters depend on `@sheetwrite/core` 0.6.0. The adapter APIs do not change.

### Patch Changes

- 8d70aae: Package READMEs and API doc comments link to the restructured documentation pages.
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

- Updated dependencies [cb8a609]
  - @sheetwrite/core@0.5.4

## 0.5.3

### Patch Changes

- 885b764: Package READMEs show npm, pnpm, Yarn, and Bun install commands, and the core and WASM READMEs explain how to select the full formula engine.
- Updated dependencies [885b764]
- Updated dependencies [222a3f8]
  - @sheetwrite/core@0.5.3

## 0.5.2

### Patch Changes

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

- Correct the Svelte adapter release metadata and package-specific changelog without changing runtime behavior.
- Updated dependencies
  - @sheetwrite/core@0.3.1

## 0.3.0

### Minor Changes

- e551eb0: Normalize initialization failures into canonical `SheetwriteError` values for `onInitializationError`, including cross-realm error envelopes and retained causes.

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
