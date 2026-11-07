# @sheetwrite/charts

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

- [#503](https://github.com/chh-ay/sheetwrite/pull/503) [`55bffb1`](https://github.com/chh-ay/sheetwrite/commit/55bffb17ed553f16f652aaed03f2cbd87b27970d) Thanks [@chh-ay](https://github.com/chh-ay)! - Charts draw multi-level category labels, as Excel does ([#501](https://github.com/chh-ay/sheetwrite/issues/501)).
  
  - A category range of several rows and several columns holds one category level per column (per row when the values run along a row). The last column labels each point. `ChartSeriesView.categoryLevels` holds the outer levels, outermost first, each with `labels` and `formats`; a blank cell continues the group above it. `categories` stays the innermost level, so charts with one level do not change.
  - A chart over a pivot with more than one row field gets its outer row fields as outer levels. `categories` holds the leaf items, not the joined `East / Retail` label.
  - The renderer draws one row of labels per level: each outer label once, centered under its group, with lines between categories and groups. Crowded inner labels turn to read upward, and outer labels wrap. In bar charts the outer labels stand left of the inner labels and read upward.
  - `ChartDefinition.axes.multiLevelLabels: false` draws one row of labels, each the text of its levels from the outside in (Excel's Format Axis › Multi-level Category Labels, cleared). The Chart panel has a **Multi-level category labels** check box when the categories have levels.
  - XLSX writes category levels as `c:multiLvlStrRef` and reads them back; `c:noMultiLvlLbl` round trips. A chart over a pivot now reads the cells that hold the pivot's values, with the values as its cache: over a native worksheet PivotTable it is that table's PivotChart (`c:pivotSource`), and over a dashboard pivot item it reads the item's cells. Without such cells it keeps literal data; category levels then have the formula `#REF!` and the labels in their cache.

### Patch Changes

- [#486](https://github.com/chh-ay/sheetwrite/pull/486) [`17a6846`](https://github.com/chh-ay/sheetwrite/commit/17a6846fff10713dcc50171c9a67cd1e2a4fc997) Thanks [@chh-ay](https://github.com/chh-ay)! - The value axis uses the number format of the first series, as Excel's "linked to source" axis does. A General first series keeps General ticks when a later series is a percentage.
- Updated dependencies [[`2800304`](https://github.com/chh-ay/sheetwrite/commit/28003040e4c0eed510d19bf960f65021bb522239), [`5409cb5`](https://github.com/chh-ay/sheetwrite/commit/5409cb525b6a0946f890b2c4cf3b897512b3ce9f), [`55bffb1`](https://github.com/chh-ay/sheetwrite/commit/55bffb17ed553f16f652aaed03f2cbd87b27970d), [`2db15ef`](https://github.com/chh-ay/sheetwrite/commit/2db15efe6fa4d9d2948528d504281af9d72d16cd), [`f8bce6b`](https://github.com/chh-ay/sheetwrite/commit/f8bce6bcea2f4bcedfacf38ec22ad64fc52fcd8a), [`c267c94`](https://github.com/chh-ay/sheetwrite/commit/c267c94ebc4f2c6d4f83e361b28d44fee5956f53), [`c267c94`](https://github.com/chh-ay/sheetwrite/commit/c267c94ebc4f2c6d4f83e361b28d44fee5956f53), [`b98d86b`](https://github.com/chh-ay/sheetwrite/commit/b98d86b61c767e0ba037723b9802ea855b2c8837), [`9fcc918`](https://github.com/chh-ay/sheetwrite/commit/9fcc918cbf03bbf1f66767afb2b4753605fb9b54), [`dc9a6d5`](https://github.com/chh-ay/sheetwrite/commit/dc9a6d5fa145f5044503254b6b54e3c52ebcf866), [`94242d0`](https://github.com/chh-ay/sheetwrite/commit/94242d0eb3617f966a7df596bbfdb63c15349746), [`a6eefc5`](https://github.com/chh-ay/sheetwrite/commit/a6eefc5842d994b1ebf3ed699c74cc762c87377b), [`1aada28`](https://github.com/chh-ay/sheetwrite/commit/1aada28341741ee998205962f203179a87c6c5b9), [`4b705e2`](https://github.com/chh-ay/sheetwrite/commit/4b705e28bf9a003192d234b7e3becd385fe1481b), [`9669e3c`](https://github.com/chh-ay/sheetwrite/commit/9669e3c83b42c23c9705477295baacc0b4c421fa), [`acbd1e2`](https://github.com/chh-ay/sheetwrite/commit/acbd1e2864bfe552c30efd5303ec3ee9e215e721), [`afa9bcc`](https://github.com/chh-ay/sheetwrite/commit/afa9bcc25a08321681187f8c300ff05b5e863271), [`968df36`](https://github.com/chh-ay/sheetwrite/commit/968df36c94d94a615b8b3ef03da24a6a1a0b5be1), [`8298eda`](https://github.com/chh-ay/sheetwrite/commit/8298edad91dc51947941284785a83a2a662cecb1), [`b59c0af`](https://github.com/chh-ay/sheetwrite/commit/b59c0afccb201c5fb5d22584d311543e717ef71b), [`3c9dac3`](https://github.com/chh-ay/sheetwrite/commit/3c9dac3ffd83f1427a688cde26dc65eeade1f78d), [`8a543f7`](https://github.com/chh-ay/sheetwrite/commit/8a543f7a11f9d9a9b8df6039c66e99a7c0e9bd5c), [`3a7e6be`](https://github.com/chh-ay/sheetwrite/commit/3a7e6befde186f767c645c2d3357b05b27aa2039), [`1f2c4b0`](https://github.com/chh-ay/sheetwrite/commit/1f2c4b004364b864901c70303a661146c8e45911), [`ea18b3e`](https://github.com/chh-ay/sheetwrite/commit/ea18b3e1dceab79231f8df7aa21895f80ef556a3), [`50a75e6`](https://github.com/chh-ay/sheetwrite/commit/50a75e6b993b75c1ca8c63ec261dd24e49d6ebe7), [`df99575`](https://github.com/chh-ay/sheetwrite/commit/df9957517d2f9f513d9da546fa6b9e2f7752f17f), [`9667e81`](https://github.com/chh-ay/sheetwrite/commit/9667e815c363f3ae03f5896273c3559a2a8aceda), [`466708a`](https://github.com/chh-ay/sheetwrite/commit/466708a5b45ab4774e6eafd27a79f824ea8a9591), [`19ac121`](https://github.com/chh-ay/sheetwrite/commit/19ac1213c5f1323b339d05e8a0dcb32cbdeb7307), [`c67bb48`](https://github.com/chh-ay/sheetwrite/commit/c67bb489582f6920810aeba2f020ae5d4bec6266), [`cc07fea`](https://github.com/chh-ay/sheetwrite/commit/cc07fea9c9c6d2781fa829cafae4c0bfb40f4079), [`27bb47b`](https://github.com/chh-ay/sheetwrite/commit/27bb47bd95cfa5f8b35df9add770486b48a0b754), [`b08cb80`](https://github.com/chh-ay/sheetwrite/commit/b08cb80b3d3a29e34336b2c9cf65f4b8fae74840), [`916b452`](https://github.com/chh-ay/sheetwrite/commit/916b452044664a2753150a7e061c6d08b369f5f4), [`5474c76`](https://github.com/chh-ay/sheetwrite/commit/5474c76349cf2bfa491893be1548ef274ca94904), [`9968bc5`](https://github.com/chh-ay/sheetwrite/commit/9968bc5511decc2a7aa7ce2f9c06861d0c52ae4f), [`675dd15`](https://github.com/chh-ay/sheetwrite/commit/675dd15b224763ebda96f5f0e06bceee908efcee), [`6ec955a`](https://github.com/chh-ay/sheetwrite/commit/6ec955a0d74c229dfc7eeeb61631b02f69b101d4), [`7a7ba88`](https://github.com/chh-ay/sheetwrite/commit/7a7ba88f7c7f17b9527aa4384a4073899e0372b7), [`5620780`](https://github.com/chh-ay/sheetwrite/commit/56207806761765cf486187dd1e72851813f75457), [`08fbebf`](https://github.com/chh-ay/sheetwrite/commit/08fbebfd3b654070de6edbd15d4d72398eb5198d), [`d519828`](https://github.com/chh-ay/sheetwrite/commit/d519828c399b00c0f6a7646633a11853d9bf8eeb), [`cc9a143`](https://github.com/chh-ay/sheetwrite/commit/cc9a1430bea2f7e1bfdf56f883612c4aacdad42b), [`3f5a91f`](https://github.com/chh-ay/sheetwrite/commit/3f5a91f65974b3631efd6cfd6687933effe95be5), [`3c57cb9`](https://github.com/chh-ay/sheetwrite/commit/3c57cb9e038c94cd17c7fac9a7fff2d01344b03e), [`3890a7a`](https://github.com/chh-ay/sheetwrite/commit/3890a7abdc2ce352119ef73cd62e4782206b438a), [`c0b2ac0`](https://github.com/chh-ay/sheetwrite/commit/c0b2ac0ee506b2ff4e57ae6012da0cbaaf6ceb1c), [`4727a3d`](https://github.com/chh-ay/sheetwrite/commit/4727a3de909c0645d11a0dc74196fecfea68008c), [`3310e7e`](https://github.com/chh-ay/sheetwrite/commit/3310e7eeb14684e1386903d1462b3eb977b84106), [`19fd4b5`](https://github.com/chh-ay/sheetwrite/commit/19fd4b541cbdc6343513c21f8c16b05e0efdea10), [`01b8d72`](https://github.com/chh-ay/sheetwrite/commit/01b8d729b92351e46e3f343aa08ca33604ef3284), [`f1609ee`](https://github.com/chh-ay/sheetwrite/commit/f1609ee5e6ffb6a77226780a94827e2fcc493ec5), [`f1609ee`](https://github.com/chh-ay/sheetwrite/commit/f1609ee5e6ffb6a77226780a94827e2fcc493ec5), [`cd6dc20`](https://github.com/chh-ay/sheetwrite/commit/cd6dc204da50474d221f33f634b3e5d097649b51), [`d078939`](https://github.com/chh-ay/sheetwrite/commit/d0789397aa1d91efdb6de0d3e3ccd1e6b03751c6), [`52daf35`](https://github.com/chh-ay/sheetwrite/commit/52daf35c41d27a52d827d87adcb005595ebe1605), [`3ef2323`](https://github.com/chh-ay/sheetwrite/commit/3ef2323d90d26e6f2be276b4ad799259ccb7b45f), [`969dc82`](https://github.com/chh-ay/sheetwrite/commit/969dc8211886ca106bac441ff5f8e6a6254fcbdd), [`17664a9`](https://github.com/chh-ay/sheetwrite/commit/17664a95da5d137a5e0863f9434ffa5d6ccbc771), [`c4933f9`](https://github.com/chh-ay/sheetwrite/commit/c4933f93d43e82e7613482e80fd8c822ff13fdaa), [`b0668a3`](https://github.com/chh-ay/sheetwrite/commit/b0668a31e8074c494d42889ed0d078683d0f89c5), [`444420c`](https://github.com/chh-ay/sheetwrite/commit/444420ccc6c529d21c9712ef6c2a55d10f7b61e7), [`b549147`](https://github.com/chh-ay/sheetwrite/commit/b549147b27a46393ececb62accbac54a8ca0d5a6), [`01b399c`](https://github.com/chh-ay/sheetwrite/commit/01b399ccf838032efe327e3dd63e301b7678ad11), [`dd153bb`](https://github.com/chh-ay/sheetwrite/commit/dd153bb24808b011b90c48cf8d3061a743b7d0e6), [`8229709`](https://github.com/chh-ay/sheetwrite/commit/82297093792ceda7833750a2896e13fca515b216), [`d83d1bc`](https://github.com/chh-ay/sheetwrite/commit/d83d1bc1c43941523448322e04de2f190ca4d9e7), [`2251d6e`](https://github.com/chh-ay/sheetwrite/commit/2251d6eab0951e556c13fa9a5c8bf1639608dd0d), [`1d49097`](https://github.com/chh-ay/sheetwrite/commit/1d49097901768723e2bd0e880ee0e33256e0a958), [`5409cb5`](https://github.com/chh-ay/sheetwrite/commit/5409cb525b6a0946f890b2c4cf3b897512b3ce9f), [`d0b34a7`](https://github.com/chh-ay/sheetwrite/commit/d0b34a770f74e2f42ab4bf67b3a9387b158537bf), [`8c9bc55`](https://github.com/chh-ay/sheetwrite/commit/8c9bc55a0661ee138e16d7f1594c53bf626c5157), [`21f64aa`](https://github.com/chh-ay/sheetwrite/commit/21f64aa87263d59cb996b0e04da9801a7deceebf), [`9ef07fe`](https://github.com/chh-ay/sheetwrite/commit/9ef07fea96dd5491352ad9ffe54aa5270dc61ff1), [`2db15ef`](https://github.com/chh-ay/sheetwrite/commit/2db15efe6fa4d9d2948528d504281af9d72d16cd), [`b029afe`](https://github.com/chh-ay/sheetwrite/commit/b029afe02f2a0933a1efb451dcc8cebc4d3773c7), [`72fb51c`](https://github.com/chh-ay/sheetwrite/commit/72fb51c15c49a625e726d8f110e48dfdedd0d7ef), [`5e9ba79`](https://github.com/chh-ay/sheetwrite/commit/5e9ba79d2fc0eb562fde68a2261f3633d678bd3a), [`1c41081`](https://github.com/chh-ay/sheetwrite/commit/1c410818c95bf1f27ed5fa3744e580cf7c9bc7b5), [`b7cef92`](https://github.com/chh-ay/sheetwrite/commit/b7cef927b5223a57f2f5fd08d1a4b4749f0fa31a), [`d59c5e6`](https://github.com/chh-ay/sheetwrite/commit/d59c5e693a45fd51392d3f1fa48f91548c4e1b7e), [`a1444f0`](https://github.com/chh-ay/sheetwrite/commit/a1444f00af111dd7921130f2e28fd1374a594eee), [`cfc6d1f`](https://github.com/chh-ay/sheetwrite/commit/cfc6d1fae12c8e3fd6b68db0b93af83a1ccb531e), [`e0c3655`](https://github.com/chh-ay/sheetwrite/commit/e0c3655b1fec3b8dd5771e234d8280a7bdf9cc4f), [`97796fe`](https://github.com/chh-ay/sheetwrite/commit/97796fe66ab5551a95b5fea9253e73b08d683646), [`0069438`](https://github.com/chh-ay/sheetwrite/commit/006943813203de185a6167146506d4647e581557), [`8ebfd62`](https://github.com/chh-ay/sheetwrite/commit/8ebfd62869f3bce4eb86123520ea0e155247707e), [`50eb898`](https://github.com/chh-ay/sheetwrite/commit/50eb89857ce7791003eb8a7e200682396ce7fd83), [`380f3d5`](https://github.com/chh-ay/sheetwrite/commit/380f3d5a3fac92da7e0389c099a8f27d91e5b90e), [`487e7f7`](https://github.com/chh-ay/sheetwrite/commit/487e7f7262f7fccd92f3d8a213be8130ce525861)]:
  - @sheetwrite/core@0.7.0

## 0.6.1

### Patch Changes

- Updated dependencies [[`c29a25a`](https://github.com/chh-ay/sheetwrite/commit/c29a25a65c4ff01ae32ad89fc6b32dde4798ffde)]:
  - @sheetwrite/core@0.6.1

## 0.6.0

### Minor Changes

- b159a35: Draw charts as SVG: column, bar, line, area, pie, doughnut and scatter, with axes in the source cells' number formats, titles and a legend. Empty and non-numeric cells are gaps; a truncated or deleted source shows a note. Dense line, area and scatter series keep the lowest and highest value in each pixel, so 10,000 points draw fast. Each chart is an image named by its title and kind, and it redraws only when its own data changes. `registerChartsBackend()` now registers the renderer as well as the live views.
- d99f762: Add the optional `@sheetwrite/charts` package. `createChartViewCache(store)` gives a chart renderer the resolved data for the charts in a workbook. `get({ sheet, id })` returns the `ChartView` for a chart, or `null` when the sheet has no chart with that ID. The cache reads the cells on the first `get` only, and keeps the view until an edit changes that chart. `subscribe(listener)` tells you which charts changed. The cache removes the old views before it calls the listeners, so `get` in a listener returns the new data. Edits to other cells do not call the listener. `dispose()` stops the cache. Core does not depend on this package, and the package does not draw charts.
  
  Import `@sheetwrite/charts/register`, or call `registerChartsBackend()`, to make core's `openChartViews(store)` return these chart views. The root entry does not register anything.

### Patch Changes

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
