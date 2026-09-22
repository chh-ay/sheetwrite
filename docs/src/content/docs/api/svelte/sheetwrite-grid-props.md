---
title: "SheetwriteGridProps | @sheetwrite/svelte"
description: "Advanced Svelte adapter props with inferred host row identity."
---
<!-- api-export:@sheetwrite/svelte|.|SheetwriteGridProps -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/svelte/">@sheetwrite/svelte</a><span class="api-status" data-kind="interface">interface</span></div>

Advanced Svelte adapter props with inferred host row identity.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/svelte</code></dd></div>
<div><dt>Source</dt><dd><code>packages/svelte/src/props.ts#L15</code></dd></div>
</dl>

<nav class="api-member-index" aria-label="Member index" data-pagefind-ignore>
<a href="#sheetwrite-grid-props-workbook"><code>workbook</code></a>
<a href="#sheetwrite-grid-props-data"><code>data</code></a>
<a href="#sheetwrite-grid-props-row-bridge"><code>rowBridge</code></a>
<a href="#sheetwrite-grid-props-datasource"><code>datasource</code></a>
<a href="#sheetwrite-grid-props-datasource-storage"><code>datasourceStorage</code></a>
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
<a href="#sheetwrite-grid-props-height"><code>height</code></a>
<a href="#sheetwrite-grid-props-fill"><code>fill</code></a>
<a href="#sheetwrite-grid-props-fallback"><code>fallback</code></a>
<a href="#sheetwrite-grid-props-grid"><code>grid</code></a>
<a href="#sheetwrite-grid-props-on-grid-change"><code>onGridChange</code></a>
<a href="#sheetwrite-grid-props-on-row-delta"><code>onRowDelta</code></a>
<a href="#sheetwrite-grid-props-on-selection-change"><code>onSelectionChange</code></a>
<a href="#sheetwrite-grid-props-on-viewport-change"><code>onViewportChange</code></a>
<a href="#sheetwrite-grid-props-on-edit-begin"><code>onEditBegin</code></a>
<a href="#sheetwrite-grid-props-on-edit-commit"><code>onEditCommit</code></a>
<a href="#sheetwrite-grid-props-on-search"><code>onSearch</code></a>
<a href="#sheetwrite-grid-props-on-active-sheet-change"><code>onActiveSheetChange</code></a>
<a href="#sheetwrite-grid-props-on-command-state-change"><code>onCommandStateChange</code></a>
<a href="#sheetwrite-grid-props-on-mutation-rejected"><code>onMutationRejected</code></a>
<a href="#sheetwrite-grid-props-on-renderer-fallback"><code>onRendererFallback</code></a>
<a href="#sheetwrite-grid-props-on-datasource-error"><code>onDatasourceError</code></a>
<a href="#sheetwrite-grid-props-on-export-error"><code>onExportError</code></a>
<a href="#sheetwrite-grid-props-on-ready"><code>onReady</code></a>
<a href="#sheetwrite-grid-props-on-initialization-error"><code>onInitializationError</code></a>
<a href="#sheetwrite-grid-props-wasm-source"><code>wasmSource</code></a>
</nav>

## Members <span class="api-count" data-pagefind-ignore>39</span>

<div class="api-member-list">

<details class="api-member" id="sheetwrite-grid-props-workbook" data-pagefind-weight="1" open>
<summary><code>workbook</code> <span class="api-member-summary">Live workbook schema adopted by the Grid.</span></summary>

<button class="api-copy" type="button" data-copy-code="workbook: GridOptions[&quot;workbook&quot;];" data-pagefind-ignore>Copy</button>

```ts generated
workbook: GridOptions["workbook"];
```

</details>

<details class="api-member" id="sheetwrite-grid-props-data" data-pagefind-weight="1" open>
<summary><code>data</code> <span class="api-member-summary">Eager values for the active sheet.</span></summary>

<button class="api-copy" type="button" data-copy-code="data?: GridOptions[&quot;data&quot;];" data-pagefind-ignore>Copy</button>

```ts generated
data?: GridOptions["data"];
```

</details>

<details class="api-member" id="sheetwrite-grid-props-row-bridge" data-pagefind-weight="1" open>
<summary><code>rowBridge</code> <span class="api-member-summary">Optional canonical-to-host row projection.</span></summary>

<button class="api-copy" type="button" data-copy-code="rowBridge?: RowBridge&lt;Id&gt;;" data-pagefind-ignore>Copy</button>

```ts generated
rowBridge?: RowBridge<Id>;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-datasource" data-pagefind-weight="1" open>
<summary><code>datasource</code> <span class="api-member-summary">Lazy visible-row provider.</span></summary>

<button class="api-copy" type="button" data-copy-code="datasource?: GridOptions[&quot;datasource&quot;];" data-pagefind-ignore>Copy</button>

```ts generated
datasource?: GridOptions["datasource"];
```

</details>

<details class="api-member" id="sheetwrite-grid-props-datasource-storage" data-pagefind-weight="1" open>
<summary><code>datasourceStorage</code> <span class="api-member-summary">Datasource storage policy.</span></summary>

<button class="api-copy" type="button" data-copy-code="datasourceStorage?: GridOptions[&quot;datasourceStorage&quot;];" data-pagefind-ignore>Copy</button>

```ts generated
datasourceStorage?: GridOptions["datasourceStorage"];
```

</details>

<details class="api-member" id="sheetwrite-grid-props-renderer" data-pagefind-weight="1" open>
<summary><code>renderer</code> <span class="api-member-summary">Canvas or worker paint backend.</span></summary>

<button class="api-copy" type="button" data-copy-code="renderer?: GridOptions[&quot;renderer&quot;];" data-pagefind-ignore>Copy</button>

```ts generated
renderer?: GridOptions["renderer"];
```

</details>

<details class="api-member" id="sheetwrite-grid-props-worker-url" data-pagefind-weight="1" open>
<summary><code>workerUrl</code> <span class="api-member-summary">Browser-fetchable worker module URL.</span></summary>

<button class="api-copy" type="button" data-copy-code="workerUrl?: GridOptions[&quot;workerUrl&quot;];" data-pagefind-ignore>Copy</button>

```ts generated
workerUrl?: GridOptions["workerUrl"];
```

</details>

<details class="api-member" id="sheetwrite-grid-props-presentation" data-pagefind-weight="1" open>
<summary><code>presentation</code> <span class="api-member-summary">Positional spreadsheet or semantic data-grid headers.</span></summary>

<button class="api-copy" type="button" data-copy-code="presentation?: GridOptions[&quot;presentation&quot;];" data-pagefind-ignore>Copy</button>

```ts generated
presentation?: GridOptions["presentation"];
```

</details>

<details class="api-member" id="sheetwrite-grid-props-theme" data-pagefind-weight="1" open>
<summary><code>theme</code> <span class="api-member-summary">Live resolved-theme overrides.</span></summary>

<button class="api-copy" type="button" data-copy-code="theme?: GridOptions[&quot;theme&quot;];" data-pagefind-ignore>Copy</button>

```ts generated
theme?: GridOptions["theme"];
```

</details>

<details class="api-member" id="sheetwrite-grid-props-read-only" data-pagefind-weight="1" open>
<summary><code>readOnly</code> <span class="api-member-summary">Disables mutations, not navigation.</span></summary>

<button class="api-copy" type="button" data-copy-code="readOnly?: GridOptions[&quot;readOnly&quot;];" data-pagefind-ignore>Copy</button>

```ts generated
readOnly?: GridOptions["readOnly"];
```

</details>

<details class="api-member" id="sheetwrite-grid-props-protection-resolver" data-pagefind-weight="1" open>
<summary><code>protectionResolver</code> <span class="api-member-summary">Client protected-range check.</span></summary>

<button class="api-copy" type="button" data-copy-code="protectionResolver?: GridOptions[&quot;protectionResolver&quot;];" data-pagefind-ignore>Copy</button>

```ts generated
protectionResolver?: GridOptions["protectionResolver"];
```

</details>

<details class="api-member" id="sheetwrite-grid-props-mutation-policy" data-pagefind-weight="1" open>
<summary><code>mutationPolicy</code> <span class="api-member-summary">Atomic or partial denial policy.</span></summary>

<button class="api-copy" type="button" data-copy-code="mutationPolicy?: GridOptions[&quot;mutationPolicy&quot;];" data-pagefind-ignore>Copy</button>

```ts generated
mutationPolicy?: GridOptions["mutationPolicy"];
```

</details>

<details class="api-member" id="sheetwrite-grid-props-transaction-resource-limits" data-pagefind-weight="1" open>
<summary><code>transactionResourceLimits</code> <span class="api-member-summary">Overrides inclusive operation-count and encoded-byte ceilings for every atomic mutation.</span></summary>

<button class="api-copy" type="button" data-copy-code="transactionResourceLimits?: GridOptions[&quot;transactionResourceLimits&quot;];" data-pagefind-ignore>Copy</button>

```ts generated
transactionResourceLimits?: GridOptions["transactionResourceLimits"];
```

</details>

<details class="api-member" id="sheetwrite-grid-props-hyperlink-activation" data-pagefind-weight="1" open>
<summary><code>hyperlinkActivation</code> <span class="api-member-summary">Controls link activation: emit an event, also navigate internally, or disable it.</span></summary>

<button class="api-copy" type="button" data-copy-code="hyperlinkActivation?: GridOptions[&quot;hyperlinkActivation&quot;];" data-pagefind-ignore>Copy</button>

```ts generated
hyperlinkActivation?: GridOptions["hyperlinkActivation"];
```

</details>

<details class="api-member" id="sheetwrite-grid-props-renderers" data-pagefind-weight="1" open>
<summary><code>renderers</code> <span class="api-member-summary">Named custom cell renderers.</span></summary>

<button class="api-copy" type="button" data-copy-code="renderers?: GridOptions[&quot;renderers&quot;];" data-pagefind-ignore>Copy</button>

```ts generated
renderers?: GridOptions["renderers"];
```

</details>

<details class="api-member" id="sheetwrite-grid-props-editors" data-pagefind-weight="1" open>
<summary><code>editors</code> <span class="api-member-summary">Named custom cell editors.</span></summary>

<button class="api-copy" type="button" data-copy-code="editors?: GridOptions[&quot;editors&quot;];" data-pagefind-ignore>Copy</button>

```ts generated
editors?: GridOptions["editors"];
```

</details>

<details class="api-member" id="sheetwrite-grid-props-overscan" data-pagefind-weight="1" open>
<summary><code>overscan</code> <span class="api-member-summary">Extra rows painted around the viewport.</span></summary>

<button class="api-copy" type="button" data-copy-code="overscan?: GridOptions[&quot;overscan&quot;];" data-pagefind-ignore>Copy</button>

```ts generated
overscan?: GridOptions["overscan"];
```

</details>

<details class="api-member" id="sheetwrite-grid-props-min-columns" data-pagefind-weight="1" open>
<summary><code>minColumns</code> <span class="api-member-summary">Minimum column count with padding.</span></summary>

<button class="api-copy" type="button" data-copy-code="minColumns?: GridOptions[&quot;minColumns&quot;];" data-pagefind-ignore>Copy</button>

```ts generated
minColumns?: GridOptions["minColumns"];
```

</details>

<details class="api-member" id="sheetwrite-grid-props-config" data-pagefind-weight="1" open>
<summary><code>config</code> <span class="api-member-summary">Built-in UI control configuration.</span></summary>

<button class="api-copy" type="button" data-copy-code="config?: GridOptions[&quot;config&quot;];" data-pagefind-ignore>Copy</button>

```ts generated
config?: GridOptions["config"];
```

</details>

<details class="api-member" id="sheetwrite-grid-props-height" data-pagefind-weight="1" open>
<summary><code>height</code> <span class="api-member-summary">Host height as pixels or a CSS length.</span></summary>

<button class="api-copy" type="button" data-copy-code="height?: number | string;" data-pagefind-ignore>Copy</button>

```ts generated
height?: number | string;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-fill" data-pagefind-weight="1" open>
<summary><code>fill</code> <span class="api-member-summary">Fills the parent's available size.</span></summary>

<button class="api-copy" type="button" data-copy-code="fill?: true;" data-pagefind-ignore>Copy</button>

```ts generated
fill?: true;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-fallback" data-pagefind-weight="1" open>
<summary><code>fallback</code> <span class="api-member-summary">Content shown until initialization succeeds.</span></summary>

<button class="api-copy" type="button" data-copy-code="fallback?: Snippet;" data-pagefind-ignore>Copy</button>

```ts generated
fallback?: Snippet;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-grid" data-pagefind-weight="1" open>
<summary><code>grid</code> <span class="api-member-summary">Bindable live Grid, cleared on reset or unmount.</span></summary>

<button class="api-copy" type="button" data-copy-code="grid?: Grid;" data-pagefind-ignore>Copy</button>

```ts generated
grid?: Grid;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-on-grid-change" data-pagefind-weight="1" open>
<summary><code>onGridChange</code> <span class="api-member-summary">Receives every committed Grid change, including its applied transaction.</span></summary>

<button class="api-copy" type="button" data-copy-code="onGridChange?: (event: ChangeEvent) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
onGridChange?: (event: ChangeEvent) => void;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-on-row-delta" data-pagefind-weight="1" open>
<summary><code>onRowDelta</code> <span class="api-member-summary">Receives projected host-row effects when a row bridge is attached.</span></summary>

<button class="api-copy" type="button" data-copy-code="onRowDelta?: RowBridgeHandler&lt;Id&gt;;" data-pagefind-ignore>Copy</button>

```ts generated
onRowDelta?: RowBridgeHandler<Id>;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-on-selection-change" data-pagefind-weight="1" open>
<summary><code>onSelectionChange</code> <span class="api-member-summary">Receives the current selection, or null after it is cleared.</span></summary>

<button class="api-copy" type="button" data-copy-code="onSelectionChange?: (selection: Selection | null) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
onSelectionChange?: (selection: Selection | null) => void;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-on-viewport-change" data-pagefind-weight="1" open>
<summary><code>onViewportChange</code> <span class="api-member-summary">Receives visible row bounds and vertical scroll offset after scrolling.</span></summary>

<button class="api-copy" type="button" data-copy-code="onViewportChange?: (event: GridEvents[&quot;scroll&quot;]) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
onViewportChange?: (event: GridEvents["scroll"]) => void;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-on-edit-begin" data-pagefind-weight="1" open>
<summary><code>onEditBegin</code> <span class="api-member-summary">Fires when cell editing begins.</span></summary>

<button class="api-copy" type="button" data-copy-code="onEditBegin?: (event: GridEvents[&quot;edit-begin&quot;]) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
onEditBegin?: (event: GridEvents["edit-begin"]) => void;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-on-edit-commit" data-pagefind-weight="1" open>
<summary><code>onEditCommit</code> <span class="api-member-summary">Fires after an edit commits its parsed cell value.</span></summary>

<button class="api-copy" type="button" data-copy-code="onEditCommit?: (event: GridEvents[&quot;edit-commit&quot;]) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
onEditCommit?: (event: GridEvents["edit-commit"]) => void;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-on-search" data-pagefind-weight="1" open>
<summary><code>onSearch</code> <span class="api-member-summary">Receives refreshed search matches and active-match index.</span></summary>

<button class="api-copy" type="button" data-copy-code="onSearch?: (result: GridEvents[&quot;search&quot;]) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
onSearch?: (result: GridEvents["search"]) => void;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-on-active-sheet-change" data-pagefind-weight="1" open>
<summary><code>onActiveSheetChange</code> <span class="api-member-summary">Fires after the visible sheet changes.</span></summary>

<button class="api-copy" type="button" data-copy-code="onActiveSheetChange?: (event: GridEvents[&quot;active-sheet&quot;]) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
onActiveSheetChange?: (event: GridEvents["active-sheet"]) => void;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-on-command-state-change" data-pagefind-weight="1" open>
<summary><code>onCommandStateChange</code> <span class="api-member-summary">Receives observable undo/redo and formatting command state.</span></summary>

<button class="api-copy" type="button" data-copy-code="onCommandStateChange?: (event: GridEvents[&quot;command-state-change&quot;]) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
onCommandStateChange?: (event: GridEvents["command-state-change"]) => void;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-on-mutation-rejected" data-pagefind-weight="1" open>
<summary><code>onMutationRejected</code> <span class="api-member-summary">Receives structured issues when a Grid mutation is rejected.</span></summary>

<button class="api-copy" type="button" data-copy-code="onMutationRejected?: (event: GridEvents[&quot;mutation-rejected&quot;]) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
onMutationRejected?: (event: GridEvents["mutation-rejected"]) => void;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-on-renderer-fallback" data-pagefind-weight="1" open>
<summary><code>onRendererFallback</code> <span class="api-member-summary">Fires when worker rendering falls back to the main-thread canvas renderer.</span></summary>

<button class="api-copy" type="button" data-copy-code="onRendererFallback?: (event: GridEvents[&quot;renderer-fallback&quot;]) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
onRendererFallback?: (event: GridEvents["renderer-fallback"]) => void;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-on-datasource-error" data-pagefind-weight="1" open>
<summary><code>onDatasourceError</code> <span class="api-member-summary">Receives failed datasource requests and their errors.</span></summary>

<button class="api-copy" type="button" data-copy-code="onDatasourceError?: (event: GridEvents[&quot;datasource-error&quot;]) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
onDatasourceError?: (event: GridEvents["datasource-error"]) => void;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-on-export-error" data-pagefind-weight="1" open>
<summary><code>onExportError</code> <span class="api-member-summary">Receives failures from built-in XLSX export actions.</span></summary>

<button class="api-copy" type="button" data-copy-code="onExportError?: (event: GridEvents[&quot;export-error&quot;]) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
onExportError?: (event: GridEvents["export-error"]) => void;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-on-ready" data-pagefind-weight="1" open>
<summary><code>onReady</code> <span class="api-member-summary">Fires after the adapter publishes a ready Grid generation.</span></summary>

<button class="api-copy" type="button" data-copy-code="onReady?: (event: GridReadyEvent) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
onReady?: (event: GridReadyEvent) => void;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-on-initialization-error" data-pagefind-weight="1" open>
<summary><code>onInitializationError</code> <span class="api-member-summary">Receives a WASM initialization failure while the adapter remains mounted.</span></summary>

<button class="api-copy" type="button" data-copy-code="onInitializationError?: (error: SheetwriteError) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
onInitializationError?: (error: SheetwriteError) => void;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-wasm-source" data-pagefind-weight="1">
<summary><code>wasmSource</code> <span class="api-member-summary">Explicit source passed to process-wide WASM initialization; concurrent initialization is first-source-wins.</span></summary>

<button class="api-copy" type="button" data-copy-code="wasmSource?: BufferSource | URL | string | Request | WebAssembly.Module;" data-pagefind-ignore>Copy</button>

```ts generated
wasmSource?: BufferSource | URL | string | Request | WebAssembly.Module;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface SheetwriteGridProps&lt;&#10;  Id extends RowBridgeId = RowBridgeId,&#10;&gt; extends Omit&lt;&#10;  HTMLAttributes&lt;HTMLDivElement&gt;,&#10;  keyof GridAdapterEventHandlers&lt;Id&gt; | &quot;children&quot;&#10;&gt; {&#10;  workbook: GridOptions[&quot;workbook&quot;];&#10;  data?: GridOptions[&quot;data&quot;];&#10;  rowBridge?: RowBridge&lt;Id&gt;;&#10;  datasource?: GridOptions[&quot;datasource&quot;];&#10;  datasourceStorage?: GridOptions[&quot;datasourceStorage&quot;];&#10;  renderer?: GridOptions[&quot;renderer&quot;];&#10;  workerUrl?: GridOptions[&quot;workerUrl&quot;];&#10;  presentation?: GridOptions[&quot;presentation&quot;];&#10;  theme?: GridOptions[&quot;theme&quot;];&#10;  readOnly?: GridOptions[&quot;readOnly&quot;];&#10;  protectionResolver?: GridOptions[&quot;protectionResolver&quot;];&#10;  mutationPolicy?: GridOptions[&quot;mutationPolicy&quot;];&#10;  transactionResourceLimits?: GridOptions[&quot;transactionResourceLimits&quot;];&#10;  hyperlinkActivation?: GridOptions[&quot;hyperlinkActivation&quot;];&#10;  renderers?: GridOptions[&quot;renderers&quot;];&#10;  editors?: GridOptions[&quot;editors&quot;];&#10;  overscan?: GridOptions[&quot;overscan&quot;];&#10;  minColumns?: GridOptions[&quot;minColumns&quot;];&#10;  config?: GridOptions[&quot;config&quot;];&#10;  height?: number | string;&#10;  fill?: true;&#10;  fallback?: Snippet;&#10;  grid?: Grid;&#10;  onGridChange?: (event: ChangeEvent) =&gt; void;&#10;  onRowDelta?: RowBridgeHandler&lt;Id&gt;;&#10;  onSelectionChange?: (selection: Selection | null) =&gt; void;&#10;  onViewportChange?: (event: GridEvents[&quot;scroll&quot;]) =&gt; void;&#10;  onEditBegin?: (event: GridEvents[&quot;edit-begin&quot;]) =&gt; void;&#10;  onEditCommit?: (event: GridEvents[&quot;edit-commit&quot;]) =&gt; void;&#10;  onSearch?: (result: GridEvents[&quot;search&quot;]) =&gt; void;&#10;  onActiveSheetChange?: (event: GridEvents[&quot;active-sheet&quot;]) =&gt; void;&#10;  onCommandStateChange?: (event: GridEvents[&quot;command-state-change&quot;]) =&gt; void;&#10;  onMutationRejected?: (event: GridEvents[&quot;mutation-rejected&quot;]) =&gt; void;&#10;  onRendererFallback?: (event: GridEvents[&quot;renderer-fallback&quot;]) =&gt; void;&#10;  onDatasourceError?: (event: GridEvents[&quot;datasource-error&quot;]) =&gt; void;&#10;  onExportError?: (event: GridEvents[&quot;export-error&quot;]) =&gt; void;&#10;  onReady?: (event: GridReadyEvent) =&gt; void;&#10;  onInitializationError?: (error: SheetwriteError) =&gt; void;&#10;  wasmSource?: BufferSource | URL | string | Request | WebAssembly.Module;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
export interface SheetwriteGridProps<
  Id extends RowBridgeId = RowBridgeId,
> extends Omit<
  HTMLAttributes<HTMLDivElement>,
  keyof GridAdapterEventHandlers<Id> | "children"
> {
  workbook: GridOptions["workbook"];
  data?: GridOptions["data"];
  rowBridge?: RowBridge<Id>;
  datasource?: GridOptions["datasource"];
  datasourceStorage?: GridOptions["datasourceStorage"];
  renderer?: GridOptions["renderer"];
  workerUrl?: GridOptions["workerUrl"];
  presentation?: GridOptions["presentation"];
  theme?: GridOptions["theme"];
  readOnly?: GridOptions["readOnly"];
  protectionResolver?: GridOptions["protectionResolver"];
  mutationPolicy?: GridOptions["mutationPolicy"];
  transactionResourceLimits?: GridOptions["transactionResourceLimits"];
  hyperlinkActivation?: GridOptions["hyperlinkActivation"];
  renderers?: GridOptions["renderers"];
  editors?: GridOptions["editors"];
  overscan?: GridOptions["overscan"];
  minColumns?: GridOptions["minColumns"];
  config?: GridOptions["config"];
  height?: number | string;
  fill?: true;
  fallback?: Snippet;
  grid?: Grid;
  onGridChange?: (event: ChangeEvent) => void;
  onRowDelta?: RowBridgeHandler<Id>;
  onSelectionChange?: (selection: Selection | null) => void;
  onViewportChange?: (event: GridEvents["scroll"]) => void;
  onEditBegin?: (event: GridEvents["edit-begin"]) => void;
  onEditCommit?: (event: GridEvents["edit-commit"]) => void;
  onSearch?: (result: GridEvents["search"]) => void;
  onActiveSheetChange?: (event: GridEvents["active-sheet"]) => void;
  onCommandStateChange?: (event: GridEvents["command-state-change"]) => void;
  onMutationRejected?: (event: GridEvents["mutation-rejected"]) => void;
  onRendererFallback?: (event: GridEvents["renderer-fallback"]) => void;
  onDatasourceError?: (event: GridEvents["datasource-error"]) => void;
  onExportError?: (event: GridEvents["export-error"]) => void;
  onReady?: (event: GridReadyEvent) => void;
  onInitializationError?: (error: SheetwriteError) => void;
  wasmSource?: BufferSource | URL | string | Request | WebAssembly.Module;
}
```

</details>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/svelte</code></p>

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

<script>
(() => {
  if (window.__sheetwriteApiCopy !== undefined) return;
  window.__sheetwriteApiCopy = true;
  const selectCopy = (text) => {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.append(area);
    area.select();
    let copied = false;
    try {
      copied = document.execCommand("copy");
    } catch {
      copied = false;
    }
    area.remove();
    return copied;
  };
  const copy = (button) => {
    const text = button.dataset.copyCode ?? "";
    const confirm = () => {
      button.textContent = "Copied";
      window.setTimeout(() => { button.textContent = "Copy"; }, 1400);
    };
    if (navigator.clipboard === undefined) {
      if (selectCopy(text)) confirm();
      return;
    }
    navigator.clipboard.writeText(text).then(confirm, () => {
      if (selectCopy(text)) confirm();
    });
  };
  document.addEventListener("click", (event) => {
    const target = event.target;
    const button = target instanceof Element ? target.closest(".api-copy") : null;
    if (button !== null) copy(button);
  });
})();
</script>
