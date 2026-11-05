---
title: "SheetwriteGridProps | @sheetwrite/react"
description: "SheetwriteGridProps interface in @sheetwrite/react: Advanced framework adapter props for workbook data or datasource ownership."
---
<!-- api-export:@sheetwrite/react|.|SheetwriteGridProps -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/react/">@sheetwrite/react</a><span class="api-status" data-kind="interface">interface</span></div>

Advanced framework adapter props for workbook data or datasource ownership.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/react/src/index.tsx#L68"><code>packages/react/src/index.tsx#L68</code></a></dd></div>
</dl>

<nav class="api-member-index" aria-label="Member index" data-pagefind-ignore>
<a href="#sheetwrite-grid-props-row-bridge"><code>rowBridge</code></a>
<a href="#sheetwrite-grid-props-on-row-delta"><code>onRowDelta</code></a>
<a href="#sheetwrite-grid-props-on-mutation-rejected"><code>onMutationRejected</code></a>
<a href="#sheetwrite-grid-props-on-renderer-fallback"><code>onRendererFallback</code></a>
<a href="#sheetwrite-grid-props-on-datasource-error"><code>onDatasourceError</code></a>
<a href="#sheetwrite-grid-props-on-export-error"><code>onExportError</code></a>
<a href="#sheetwrite-grid-props-on-ready"><code>onReady</code></a>
<a href="#sheetwrite-grid-props-class-name"><code>className</code></a>
<a href="#sheetwrite-grid-props-style"><code>style</code></a>
<a href="#sheetwrite-grid-props-fallback"><code>fallback</code></a>
<a href="#sheetwrite-grid-props-height"><code>height</code></a>
<a href="#sheetwrite-grid-props-fill"><code>fill</code></a>
<a href="#sheetwrite-grid-props-on-grid-change"><code>onGridChange</code></a>
<a href="#sheetwrite-grid-props-on-selection-change"><code>onSelectionChange</code></a>
<a href="#sheetwrite-grid-props-on-viewport-change"><code>onViewportChange</code></a>
<a href="#sheetwrite-grid-props-on-edit-begin"><code>onEditBegin</code></a>
<a href="#sheetwrite-grid-props-on-edit-commit"><code>onEditCommit</code></a>
<a href="#sheetwrite-grid-props-on-search"><code>onSearch</code></a>
<a href="#sheetwrite-grid-props-on-active-sheet-change"><code>onActiveSheetChange</code></a>
<a href="#sheetwrite-grid-props-on-command-state-change"><code>onCommandStateChange</code></a>
<a href="#sheetwrite-grid-props-on-initialization-error"><code>onInitializationError</code></a>
<a href="#sheetwrite-grid-props-wasm-source"><code>wasmSource</code></a>
<a href="#sheetwrite-grid-props-workbook"><code>workbook</code></a>
<a href="#sheetwrite-grid-props-data"><code>data</code></a>
<a href="#sheetwrite-grid-props-datasource"><code>datasource</code></a>
<a href="#sheetwrite-grid-props-datasource-storage"><code>datasourceStorage</code></a>
<a href="#sheetwrite-grid-props-renderer"><code>renderer</code></a>
<a href="#sheetwrite-grid-props-worker-url"><code>workerUrl</code></a>
<a href="#sheetwrite-grid-props-presentation"><code>presentation</code></a>
<a href="#sheetwrite-grid-props-theme"><code>theme</code></a>
<a href="#sheetwrite-grid-props-read-only"><code>readOnly</code></a>
<a href="#sheetwrite-grid-props-hyperlink-activation"><code>hyperlinkActivation</code></a>
<a href="#sheetwrite-grid-props-protection-resolver"><code>protectionResolver</code></a>
<a href="#sheetwrite-grid-props-mutation-policy"><code>mutationPolicy</code></a>
<a href="#sheetwrite-grid-props-transaction-resource-limits"><code>transactionResourceLimits</code></a>
<a href="#sheetwrite-grid-props-renderers"><code>renderers</code></a>
<a href="#sheetwrite-grid-props-editors"><code>editors</code></a>
<a href="#sheetwrite-grid-props-overscan"><code>overscan</code></a>
<a href="#sheetwrite-grid-props-min-columns"><code>minColumns</code></a>
<a href="#sheetwrite-grid-props-config"><code>config</code></a>
</nav>

## Members <span class="api-count" data-pagefind-ignore>40</span>

<div class="api-member-list">

<details class="api-member" id="sheetwrite-grid-props-row-bridge" data-pagefind-weight="1">
<summary><code>rowBridge</code> <span class="api-member-summary">Projects canonical changes to host-owned row identities.</span></summary>

```ts generated
rowBridge?: RowBridge<Id>;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-on-row-delta" data-pagefind-weight="1">
<summary><code>onRowDelta</code> <span class="api-member-summary">Receives one accepted or reconciled row projection.</span></summary>

```ts generated
onRowDelta?: RowBridgeHandler<Id>;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-on-mutation-rejected" data-pagefind-weight="1">
<summary><code>onMutationRejected</code> <span class="api-member-summary">Receives structured issues when a Grid mutation is rejected.</span></summary>

```ts generated
onMutationRejected?: GridAdapterEventHandlers["onMutationRejected"];
```

</details>

<details class="api-member" id="sheetwrite-grid-props-on-renderer-fallback" data-pagefind-weight="1">
<summary><code>onRendererFallback</code> <span class="api-member-summary">Fires when worker rendering falls back to the main-thread canvas renderer.</span></summary>

```ts generated
onRendererFallback?: GridAdapterEventHandlers["onRendererFallback"];
```

</details>

<details class="api-member" id="sheetwrite-grid-props-on-datasource-error" data-pagefind-weight="1">
<summary><code>onDatasourceError</code> <span class="api-member-summary">Receives failed datasource requests and their errors.</span></summary>

```ts generated
onDatasourceError?: GridAdapterEventHandlers["onDatasourceError"];
```

</details>

<details class="api-member" id="sheetwrite-grid-props-on-export-error" data-pagefind-weight="1">
<summary><code>onExportError</code> <span class="api-member-summary">Receives failures from built-in XLSX export actions.</span></summary>

```ts generated
onExportError?: GridAdapterEventHandlers["onExportError"];
```

</details>

<details class="api-member" id="sheetwrite-grid-props-on-ready" data-pagefind-weight="1">
<summary><code>onReady</code> <span class="api-member-summary">Fires after the adapter publishes a ready Grid generation.</span></summary>

```ts generated
onReady?: GridAdapterEventHandlers["onReady"];
```

</details>

<details class="api-member" id="sheetwrite-grid-props-class-name" data-pagefind-weight="1">
<summary><code>className</code> <span class="api-member-summary">Additional class appended to the required sheetwrite host class.</span></summary>

```ts generated
className?: string;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-style" data-pagefind-weight="1">
<summary><code>style</code> <span class="api-member-summary">Host styles merged before adapter sizing styles.</span></summary>

```ts generated
style?: CSSProperties;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-fallback" data-pagefind-weight="1">
<summary><code>fallback</code> <span class="api-member-summary">Content shown while WASM is loading or after initialization fails.</span></summary>

```ts generated
fallback?: ReactNode;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-height" data-pagefind-weight="1">
<summary><code>height</code> <span class="api-member-summary">Host height in CSS pixels for numbers or any CSS length string.</span></summary>

```ts generated
height?: number | string;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-fill" data-pagefind-weight="1">
<summary><code>fill</code> <span class="api-member-summary">Fills the parent's available width and height, taking precedence over height.</span></summary>

```ts generated
fill?: true;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-on-grid-change" data-pagefind-weight="1">
<summary><code>onGridChange</code></summary>

```ts generated
onGridChange?: (event: ChangeEvent) => void;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-on-selection-change" data-pagefind-weight="1">
<summary><code>onSelectionChange</code></summary>

```ts generated
onSelectionChange?: (selection: Selection | null) => void;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-on-viewport-change" data-pagefind-weight="1">
<summary><code>onViewportChange</code></summary>

```ts generated
onViewportChange?: (event: GridEvents["scroll"]) => void;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-on-edit-begin" data-pagefind-weight="1">
<summary><code>onEditBegin</code></summary>

```ts generated
onEditBegin?: (event: GridEvents["edit-begin"]) => void;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-on-edit-commit" data-pagefind-weight="1">
<summary><code>onEditCommit</code></summary>

```ts generated
onEditCommit?: (event: GridEvents["edit-commit"]) => void;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-on-search" data-pagefind-weight="1">
<summary><code>onSearch</code></summary>

```ts generated
onSearch?: (result: GridEvents["search"]) => void;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-on-active-sheet-change" data-pagefind-weight="1">
<summary><code>onActiveSheetChange</code></summary>

```ts generated
onActiveSheetChange?: (event: GridEvents["active-sheet"]) => void;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-on-command-state-change" data-pagefind-weight="1">
<summary><code>onCommandStateChange</code></summary>

```ts generated
onCommandStateChange?: (event: GridEvents["command-state-change"]) => void;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-on-initialization-error" data-pagefind-weight="1">
<summary><code>onInitializationError</code></summary>

```ts generated
onInitializationError?: (error: SheetwriteError) => void;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-wasm-source" data-pagefind-weight="1">
<summary><code>wasmSource</code></summary>

```ts generated
wasmSource?: BufferSource | URL | string | Request | WebAssembly.Module;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-workbook" data-pagefind-weight="1">
<summary><code>workbook</code></summary>

```ts generated
workbook: Workbook;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-data" data-pagefind-weight="1">
<summary><code>data</code></summary>

```ts generated
data?: ColumnarData;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-datasource" data-pagefind-weight="1">
<summary><code>datasource</code></summary>

```ts generated
datasource?: DataSource;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-datasource-storage" data-pagefind-weight="1">
<summary><code>datasourceStorage</code></summary>

```ts generated
datasourceStorage?: DataSourceStorageOptions;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-renderer" data-pagefind-weight="1">
<summary><code>renderer</code></summary>

```ts generated
renderer?: "canvas" | "worker";
```

</details>

<details class="api-member" id="sheetwrite-grid-props-worker-url" data-pagefind-weight="1">
<summary><code>workerUrl</code></summary>

```ts generated
workerUrl?: string | URL;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-presentation" data-pagefind-weight="1">
<summary><code>presentation</code></summary>

```ts generated
presentation?: GridPresentation;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-theme" data-pagefind-weight="1">
<summary><code>theme</code></summary>

```ts generated
theme?: Partial<Theme>;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-read-only" data-pagefind-weight="1">
<summary><code>readOnly</code></summary>

```ts generated
readOnly?: boolean;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-hyperlink-activation" data-pagefind-weight="1">
<summary><code>hyperlinkActivation</code></summary>

```ts generated
hyperlinkActivation?: "event-only" | "internal-navigation" | "disabled";
```

</details>

<details class="api-member" id="sheetwrite-grid-props-protection-resolver" data-pagefind-weight="1">
<summary><code>protectionResolver</code></summary>

```ts generated
protectionResolver?: ProtectionResolver;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-mutation-policy" data-pagefind-weight="1">
<summary><code>mutationPolicy</code></summary>

```ts generated
mutationPolicy?: MutationPolicyMode;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-transaction-resource-limits" data-pagefind-weight="1">
<summary><code>transactionResourceLimits</code></summary>

```ts generated
transactionResourceLimits?: Partial<TransactionResourceLimits>;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-renderers" data-pagefind-weight="1">
<summary><code>renderers</code></summary>

```ts generated
renderers?: Record<string, CellRenderer>;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-editors" data-pagefind-weight="1">
<summary><code>editors</code></summary>

```ts generated
editors?: Record<string, CellEditor>;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-overscan" data-pagefind-weight="1">
<summary><code>overscan</code></summary>

```ts generated
overscan?: number;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-min-columns" data-pagefind-weight="1">
<summary><code>minColumns</code></summary>

```ts generated
minColumns?: number;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-config" data-pagefind-weight="1">
<summary><code>config</code></summary>

```ts generated
config?: GridConfig;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface SheetwriteGridProps<Id extends RowBridgeId = RowBridgeId> {
  rowBridge?: RowBridge<Id>;
  onRowDelta?: RowBridgeHandler<Id>;
  onMutationRejected?: GridAdapterEventHandlers["onMutationRejected"];
  onRendererFallback?: GridAdapterEventHandlers["onRendererFallback"];
  onDatasourceError?: GridAdapterEventHandlers["onDatasourceError"];
  onExportError?: GridAdapterEventHandlers["onExportError"];
  onReady?: GridAdapterEventHandlers["onReady"];
  className?: string;
  style?: CSSProperties;
  fallback?: ReactNode;
  height?: number | string;
  fill?: true;
  onGridChange?: (event: ChangeEvent) => void;
  onSelectionChange?: (selection: Selection | null) => void;
  onViewportChange?: (event: GridEvents["scroll"]) => void;
  onEditBegin?: (event: GridEvents["edit-begin"]) => void;
  onEditCommit?: (event: GridEvents["edit-commit"]) => void;
  onSearch?: (result: GridEvents["search"]) => void;
  onActiveSheetChange?: (event: GridEvents["active-sheet"]) => void;
  onCommandStateChange?: (event: GridEvents["command-state-change"]) => void;
  onInitializationError?: (error: SheetwriteError) => void;
  wasmSource?: BufferSource | URL | string | Request | WebAssembly.Module;
  workbook: Workbook;
  data?: ColumnarData;
  datasource?: DataSource;
  datasourceStorage?: DataSourceStorageOptions;
  renderer?: "canvas" | "worker";
  workerUrl?: string | URL;
  presentation?: GridPresentation;
  theme?: Partial<Theme>;
  readOnly?: boolean;
  hyperlinkActivation?: "event-only" | "internal-navigation" | "disabled";
  protectionResolver?: ProtectionResolver;
  mutationPolicy?: MutationPolicyMode;
  transactionResourceLimits?: Partial<TransactionResourceLimits>;
  renderers?: Record<string, CellRenderer>;
  editors?: Record<string, CellEditor>;
  overscan?: number;
  minColumns?: number;
  config?: GridConfig;
}
```

</details>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/react</code></p>

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
