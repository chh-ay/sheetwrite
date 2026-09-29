---
title: "SheetwriteGridProps | @sheetwrite/vue"
description: "Advanced Vue adapter props for workbook data or datasource ownership."
---
<!-- api-export:@sheetwrite/vue|.|SheetwriteGridProps -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/vue/">@sheetwrite/vue</a><span class="api-status" data-kind="interface">interface</span></div>

Advanced Vue adapter props for workbook data or datasource ownership.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/vue/src/index.ts#L56"><code>packages/vue/src/index.ts#L56</code></a></dd></div>
</dl>

<nav class="api-member-index" aria-label="Member index" data-pagefind-ignore>
<a href="#sheetwrite-grid-props-workbook"><code>workbook</code></a>
<a href="#sheetwrite-grid-props-data"><code>data</code></a>
<a href="#sheetwrite-grid-props-datasource"><code>datasource</code></a>
<a href="#sheetwrite-grid-props-datasource-storage"><code>datasourceStorage</code></a>
<a href="#sheetwrite-grid-props-row-bridge"><code>rowBridge</code></a>
<a href="#sheetwrite-grid-props-renderer"><code>renderer</code></a>
<a href="#sheetwrite-grid-props-worker-url"><code>workerUrl</code></a>
<a href="#sheetwrite-grid-props-presentation"><code>presentation</code></a>
<a href="#sheetwrite-grid-props-theme"><code>theme</code></a>
<a href="#sheetwrite-grid-props-read-only"><code>readOnly</code></a>
<a href="#sheetwrite-grid-props-protection-resolver"><code>protectionResolver</code></a>
<a href="#sheetwrite-grid-props-mutation-policy"><code>mutationPolicy</code></a>
<a href="#sheetwrite-grid-props-transaction-resource-limits"><code>transactionResourceLimits</code></a>
<a href="#sheetwrite-grid-props-hyperlink-activation"><code>hyperlinkActivation</code></a>
<a href="#sheetwrite-grid-props-renderers"><code>renderers</code></a>
<a href="#sheetwrite-grid-props-editors"><code>editors</code></a>
<a href="#sheetwrite-grid-props-overscan"><code>overscan</code></a>
<a href="#sheetwrite-grid-props-min-columns"><code>minColumns</code></a>
<a href="#sheetwrite-grid-props-config"><code>config</code></a>
<a href="#sheetwrite-grid-props-wasm-source"><code>wasmSource</code></a>
<a href="#sheetwrite-grid-props-height"><code>height</code></a>
<a href="#sheetwrite-grid-props-fill"><code>fill</code></a>
</nav>

## Members <span class="api-count" data-pagefind-ignore>22</span>

<div class="api-member-list">

<details class="api-member" id="sheetwrite-grid-props-workbook" data-pagefind-weight="1">
<summary><code>workbook</code> <span class="api-member-summary">Live workbook schema adopted by the Grid.</span></summary>

```ts generated
workbook: Workbook;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-data" data-pagefind-weight="1">
<summary><code>data</code> <span class="api-member-summary">Eager column-major values for the active sheet.</span></summary>

```ts generated
data?: ColumnarData;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-datasource" data-pagefind-weight="1">
<summary><code>datasource</code> <span class="api-member-summary">Lazy row provider requested for visible windows.</span></summary>

```ts generated
datasource?: DataSource;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-datasource-storage" data-pagefind-weight="1">
<summary><code>datasourceStorage</code> <span class="api-member-summary">Allocation and cache policy for datasource storage.</span></summary>

```ts generated
datasourceStorage?: DataSourceStorageOptions;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-row-bridge" data-pagefind-weight="1">
<summary><code>rowBridge</code> <span class="api-member-summary">Optional projection from canonical data-space operations to host row IDs.</span></summary>

```ts generated
rowBridge?: RowBridge<Id>;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-renderer" data-pagefind-weight="1">
<summary><code>renderer</code> <span class="api-member-summary">Paint backend; defaults to main-thread canvas.</span></summary>

```ts generated
renderer?: GridOptions["renderer"];
```

</details>

<details class="api-member" id="sheetwrite-grid-props-worker-url" data-pagefind-weight="1">
<summary><code>workerUrl</code> <span class="api-member-summary">Browser-fetchable worker module URL.</span></summary>

```ts generated
workerUrl?: GridOptions["workerUrl"];
```

</details>

<details class="api-member" id="sheetwrite-grid-props-presentation" data-pagefind-weight="1">
<summary><code>presentation</code> <span class="api-member-summary">Positional spreadsheet or semantic data-grid headers.</span></summary>

```ts generated
presentation?: GridOptions["presentation"];
```

</details>

<details class="api-member" id="sheetwrite-grid-props-theme" data-pagefind-weight="1">
<summary><code>theme</code> <span class="api-member-summary">Live overrides merged into the resolved Grid theme.</span></summary>

```ts generated
theme?: Partial<Theme>;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-read-only" data-pagefind-weight="1">
<summary><code>readOnly</code> <span class="api-member-summary">Disables mutation while preserving navigation and selection.</span></summary>

```ts generated
readOnly?: boolean;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-protection-resolver" data-pagefind-weight="1">
<summary><code>protectionResolver</code> <span class="api-member-summary">Host-owned client permission check for protected ranges.</span></summary>

```ts generated
protectionResolver?: GridOptions["protectionResolver"];
```

</details>

<details class="api-member" id="sheetwrite-grid-props-mutation-policy" data-pagefind-weight="1">
<summary><code>mutationPolicy</code> <span class="api-member-summary">Atomic or partial handling for denied local operations.</span></summary>

```ts generated
mutationPolicy?: GridOptions["mutationPolicy"];
```

</details>

<details class="api-member" id="sheetwrite-grid-props-transaction-resource-limits" data-pagefind-weight="1">
<summary><code>transactionResourceLimits</code> <span class="api-member-summary">Overrides inclusive operation-count and encoded-byte ceilings for every atomic mutation.</span></summary>

```ts generated
transactionResourceLimits?: GridOptions["transactionResourceLimits"];
```

</details>

<details class="api-member" id="sheetwrite-grid-props-hyperlink-activation" data-pagefind-weight="1">
<summary><code>hyperlinkActivation</code> <span class="api-member-summary">Controls link activation: emit an event, also navigate internally, or disable it.</span></summary>

```ts generated
hyperlinkActivation?: GridOptions["hyperlinkActivation"];
```

</details>

<details class="api-member" id="sheetwrite-grid-props-renderers" data-pagefind-weight="1">
<summary><code>renderers</code> <span class="api-member-summary">Named custom renderers registered when the Grid is created.</span></summary>

```ts generated
renderers?: Record<string, CellRenderer>;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-editors" data-pagefind-weight="1">
<summary><code>editors</code> <span class="api-member-summary">Named custom editors registered when the Grid is created.</span></summary>

```ts generated
editors?: GridOptions["editors"];
```

</details>

<details class="api-member" id="sheetwrite-grid-props-overscan" data-pagefind-weight="1">
<summary><code>overscan</code> <span class="api-member-summary">Extra rows painted above and below the viewport.</span></summary>

```ts generated
overscan?: number;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-min-columns" data-pagefind-weight="1">
<summary><code>minColumns</code> <span class="api-member-summary">Minimum rendered column count, including empty padding columns.</span></summary>

```ts generated
minColumns?: number;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-config" data-pagefind-weight="1">
<summary><code>config</code> <span class="api-member-summary">Built-in toolbar, menu, keyboard, find, and tab controls.</span></summary>

```ts generated
config?: GridOptions["config"];
```

</details>

<details class="api-member" id="sheetwrite-grid-props-wasm-source" data-pagefind-weight="1">
<summary><code>wasmSource</code> <span class="api-member-summary">Explicit source passed to process-wide WASM initialization.</span></summary>

```ts generated
wasmSource?: SheetwriteInitializationProps["wasmSource"];
```

</details>

<details class="api-member" id="sheetwrite-grid-props-height" data-pagefind-weight="1">
<summary><code>height</code> <span class="api-member-summary">Host height in CSS pixels for numbers or any CSS length string.</span></summary>

```ts generated
height?: number | string;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-fill" data-pagefind-weight="1">
<summary><code>fill</code> <span class="api-member-summary">Fills the parent's available width and height.</span></summary>

```ts generated
fill?: boolean;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface SheetwriteGridProps<Id extends RowBridgeId = RowBridgeId> {
  workbook: Workbook;
  data?: ColumnarData;
  datasource?: DataSource;
  datasourceStorage?: DataSourceStorageOptions;
  rowBridge?: RowBridge<Id>;
  renderer?: GridOptions["renderer"];
  workerUrl?: GridOptions["workerUrl"];
  presentation?: GridOptions["presentation"];
  theme?: Partial<Theme>;
  readOnly?: boolean;
  protectionResolver?: GridOptions["protectionResolver"];
  mutationPolicy?: GridOptions["mutationPolicy"];
  transactionResourceLimits?: GridOptions["transactionResourceLimits"];
  hyperlinkActivation?: GridOptions["hyperlinkActivation"];
  renderers?: Record<string, CellRenderer>;
  editors?: GridOptions["editors"];
  overscan?: number;
  minColumns?: number;
  config?: GridOptions["config"];
  wasmSource?: SheetwriteInitializationProps["wasmSource"];
  height?: number | string;
  fill?: boolean;
}
```

</details>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/vue</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>SheetwriteGridProps</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/react/sheetwrite-grid/"><code>SheetwriteGrid</code></a><span class="api-consumer-kind">@sheetwrite/react</span></li>
<li><a href="/docs/api/react/sheetwrite-props/"><code>SheetwriteProps</code></a><span class="api-consumer-kind">@sheetwrite/react</span></li>
<li><a href="/docs/api/svelte/sheetwrite-grid/"><code>SheetwriteGrid</code></a><span class="api-consumer-kind">@sheetwrite/svelte</span></li>
<li><a href="/docs/api/svelte/sheetwrite-props/"><code>SheetwriteProps</code></a><span class="api-consumer-kind">@sheetwrite/svelte</span></li>
<li><a href="/docs/api/vue/sheetwrite-grid/"><code>SheetwriteGrid</code></a><span class="api-consumer-kind">@sheetwrite/vue</span></li>
<li><a href="/docs/api/vue/sheetwrite-props/"><code>SheetwriteProps</code></a><span class="api-consumer-kind">@sheetwrite/vue</span></li>
</ul>
</div>
