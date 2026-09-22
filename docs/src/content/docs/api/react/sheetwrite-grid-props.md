---
title: "SheetwriteGridProps | @sheetwrite/react"
description: "Advanced framework adapter props for workbook data or datasource ownership."
---
<!-- api-export:@sheetwrite/react|.|SheetwriteGridProps -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/react/">@sheetwrite/react</a><span class="api-status" data-kind="interface">interface</span></div>

Advanced framework adapter props for workbook data or datasource ownership.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/react</code></dd></div>
<div><dt>Source</dt><dd><code>packages/react/src/index.tsx#L73</code></dd></div>
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
<a href="#sheetwrite-grid-props-on-viewport-change"><code>onViewportChange</code></a>
<a href="#sheetwrite-grid-props-on-edit-begin"><code>onEditBegin</code></a>
<a href="#sheetwrite-grid-props-on-edit-commit"><code>onEditCommit</code></a>
<a href="#sheetwrite-grid-props-on-search"><code>onSearch</code></a>
<a href="#sheetwrite-grid-props-on-active-sheet-change"><code>onActiveSheetChange</code></a>
<a href="#sheetwrite-grid-props-on-command-state-change"><code>onCommandStateChange</code></a>
<a href="#sheetwrite-grid-props-on-initialization-error"><code>onInitializationError</code></a>
<a href="#sheetwrite-grid-props-wasm-source"><code>wasmSource</code></a>
</nav>

## Members <span class="api-count" data-pagefind-ignore>40</span>

<div class="api-member-list">

<details class="api-member" id="sheetwrite-grid-props-row-bridge" data-pagefind-weight="1" open>
<summary><code>rowBridge</code> <span class="api-member-summary">Projects canonical changes to host-owned row identities.</span></summary>

<button class="api-copy" type="button" data-copy-code="rowBridge?: RowBridge&lt;Id&gt;;" data-pagefind-ignore>Copy</button>

```ts generated
rowBridge?: RowBridge<Id>;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-on-row-delta" data-pagefind-weight="1" open>
<summary><code>onRowDelta</code> <span class="api-member-summary">Receives one accepted or reconciled row projection.</span></summary>

<button class="api-copy" type="button" data-copy-code="onRowDelta?: RowBridgeHandler&lt;Id&gt;;" data-pagefind-ignore>Copy</button>

```ts generated
onRowDelta?: RowBridgeHandler<Id>;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-on-mutation-rejected" data-pagefind-weight="1" open>
<summary><code>onMutationRejected</code> <span class="api-member-summary">Receives structured issues when a Grid mutation is rejected.</span></summary>

<button class="api-copy" type="button" data-copy-code="onMutationRejected?: GridAdapterEventHandlers[&quot;onMutationRejected&quot;];" data-pagefind-ignore>Copy</button>

```ts generated
onMutationRejected?: GridAdapterEventHandlers["onMutationRejected"];
```

</details>

<details class="api-member" id="sheetwrite-grid-props-on-renderer-fallback" data-pagefind-weight="1" open>
<summary><code>onRendererFallback</code> <span class="api-member-summary">Fires when worker rendering falls back to the main-thread canvas renderer.</span></summary>

<button class="api-copy" type="button" data-copy-code="onRendererFallback?: GridAdapterEventHandlers[&quot;onRendererFallback&quot;];" data-pagefind-ignore>Copy</button>

```ts generated
onRendererFallback?: GridAdapterEventHandlers["onRendererFallback"];
```

</details>

<details class="api-member" id="sheetwrite-grid-props-on-datasource-error" data-pagefind-weight="1" open>
<summary><code>onDatasourceError</code> <span class="api-member-summary">Receives failed datasource requests and their errors.</span></summary>

<button class="api-copy" type="button" data-copy-code="onDatasourceError?: GridAdapterEventHandlers[&quot;onDatasourceError&quot;];" data-pagefind-ignore>Copy</button>

```ts generated
onDatasourceError?: GridAdapterEventHandlers["onDatasourceError"];
```

</details>

<details class="api-member" id="sheetwrite-grid-props-on-export-error" data-pagefind-weight="1" open>
<summary><code>onExportError</code> <span class="api-member-summary">Receives failures from built-in XLSX export actions.</span></summary>

<button class="api-copy" type="button" data-copy-code="onExportError?: GridAdapterEventHandlers[&quot;onExportError&quot;];" data-pagefind-ignore>Copy</button>

```ts generated
onExportError?: GridAdapterEventHandlers["onExportError"];
```

</details>

<details class="api-member" id="sheetwrite-grid-props-on-ready" data-pagefind-weight="1" open>
<summary><code>onReady</code> <span class="api-member-summary">Fires after the adapter publishes a ready Grid generation.</span></summary>

<button class="api-copy" type="button" data-copy-code="onReady?: GridAdapterEventHandlers[&quot;onReady&quot;];" data-pagefind-ignore>Copy</button>

```ts generated
onReady?: GridAdapterEventHandlers["onReady"];
```

</details>

<details class="api-member" id="sheetwrite-grid-props-class-name" data-pagefind-weight="1" open>
<summary><code>className</code> <span class="api-member-summary">Additional class appended to the required sheetwrite host class.</span></summary>

<button class="api-copy" type="button" data-copy-code="className?: string;" data-pagefind-ignore>Copy</button>

```ts generated
className?: string;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-style" data-pagefind-weight="1" open>
<summary><code>style</code> <span class="api-member-summary">Host styles merged before adapter sizing styles.</span></summary>

<button class="api-copy" type="button" data-copy-code="style?: CSSProperties;" data-pagefind-ignore>Copy</button>

```ts generated
style?: CSSProperties;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-fallback" data-pagefind-weight="1" open>
<summary><code>fallback</code> <span class="api-member-summary">Content shown while WASM is loading or after initialization fails.</span></summary>

<button class="api-copy" type="button" data-copy-code="fallback?: ReactNode;" data-pagefind-ignore>Copy</button>

```ts generated
fallback?: ReactNode;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-height" data-pagefind-weight="1" open>
<summary><code>height</code> <span class="api-member-summary">Host height in CSS pixels for numbers or any CSS length string.</span></summary>

<button class="api-copy" type="button" data-copy-code="height?: number | string;" data-pagefind-ignore>Copy</button>

```ts generated
height?: number | string;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-fill" data-pagefind-weight="1" open>
<summary><code>fill</code> <span class="api-member-summary">Fills the parent's available width and height, taking precedence over height.</span></summary>

<button class="api-copy" type="button" data-copy-code="fill?: true;" data-pagefind-ignore>Copy</button>

```ts generated
fill?: true;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-on-grid-change" data-pagefind-weight="1" open>
<summary><code>onGridChange</code> <span class="api-member-summary">Receives every committed Grid change, including its applied transaction.</span></summary>

<button class="api-copy" type="button" data-copy-code="onGridChange?: (event: ChangeEvent) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
onGridChange?: (event: ChangeEvent) => void;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-on-selection-change" data-pagefind-weight="1" open>
<summary><code>onSelectionChange</code> <span class="api-member-summary">Receives the current selection, or null after it is cleared.</span></summary>

<button class="api-copy" type="button" data-copy-code="onSelectionChange?: (selection: Selection | null) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
onSelectionChange?: (selection: Selection | null) => void;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-workbook" data-pagefind-weight="1" open>
<summary><code>workbook</code> <span class="api-member-summary">Live workbook schema adopted by the store and updated by document operations.</span></summary>

<button class="api-copy" type="button" data-copy-code="workbook: Workbook;" data-pagefind-ignore>Copy</button>

```ts generated
workbook: Workbook;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-data" data-pagefind-weight="1" open>
<summary><code>data</code> <span class="api-member-summary">Eager column-major values loaded into workbook.activeSheet; use instead of datasource.</span></summary>

<button class="api-copy" type="button" data-copy-code="data?: ColumnarData;" data-pagefind-ignore>Copy</button>

```ts generated
data?: ColumnarData;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-datasource" data-pagefind-weight="1" open>
<summary><code>datasource</code> <span class="api-member-summary">Lazy row provider requested for visible windows; use instead of eager data.</span></summary>

<button class="api-copy" type="button" data-copy-code="datasource?: DataSource;" data-pagefind-ignore>Copy</button>

```ts generated
datasource?: DataSource;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-datasource-storage" data-pagefind-weight="1" open>
<summary><code>datasourceStorage</code> <span class="api-member-summary">Allocation and cache policy for datasource-backed cell storage.</span></summary>

<button class="api-copy" type="button" data-copy-code="datasourceStorage?: DataSourceStorageOptions;" data-pagefind-ignore>Copy</button>

```ts generated
datasourceStorage?: DataSourceStorageOptions;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-renderer" data-pagefind-weight="1" open>
<summary><code>renderer</code> <span class="api-member-summary">Paint backend; defaults to main-thread canvas and falls back there if a worker fails.</span></summary>

<button class="api-copy" type="button" data-copy-code="renderer?: &quot;canvas&quot; | &quot;worker&quot;;" data-pagefind-ignore>Copy</button>

```ts generated
renderer?: "canvas" | "worker";
```

</details>

<details class="api-member" id="sheetwrite-grid-props-worker-url" data-pagefind-weight="1" open>
<summary><code>workerUrl</code> <span class="api-member-summary">URL of the worker renderer module (renderer: &quot;worker&quot;), as served to the BROWSER — the platform Worker constructor does not consult package exports, so a bare specifier like new URL(&quot;@sheetwrite/core/worker&quot;,…</span></summary>

<button class="api-copy" type="button" data-copy-code="workerUrl?: string | URL;" data-pagefind-ignore>Copy</button>

```ts generated
workerUrl?: string | URL;
```

<p class="api-member-doc">URL of the worker renderer module (`renderer: &quot;worker&quot;`), as served to the
BROWSER — the platform `Worker` constructor does not consult package
exports, so a bare specifier like `new URL(&quot;@sheetwrite/core/worker&quot;,
import.meta.url)` is NOT reliable. Either copy
`@sheetwrite/core/dist/worker.js` to your public assets and pass its URL
string (works everywhere), or use your bundler's dependency-worker import
if it has one (see `/docs/guides/worker-rendering/`). If omitted or the worker
can't be constructed, the grid falls back to the main-thread canvas
renderer and emits `renderer-fallback` once.</p>
</details>

<details class="api-member" id="sheetwrite-grid-props-presentation" data-pagefind-weight="1" open>
<summary><code>presentation</code> <span class="api-member-summary">Header presentation. Spreadsheet mode (default) paints positional A/B/C labels; data-grid mode paints each column's semantic header.</span></summary>

<button class="api-copy" type="button" data-copy-code="presentation?: GridPresentation;" data-pagefind-ignore>Copy</button>

```ts generated
presentation?: GridPresentation;
```

<p class="api-member-doc">Header presentation. Spreadsheet mode (default) paints positional A/B/C
labels; data-grid mode paints each column's semantic `header`. Cell
addressing, row indices, clipboard values, formulas, and exports are
unchanged in both modes.</p>
</details>

<details class="api-member" id="sheetwrite-grid-props-theme" data-pagefind-weight="1" open>
<summary><code>theme</code> <span class="api-member-summary">Overrides merged over the default theme and host CSS custom properties.</span></summary>

<button class="api-copy" type="button" data-copy-code="theme?: Partial&lt;Theme&gt;;" data-pagefind-ignore>Copy</button>

```ts generated
theme?: Partial<Theme>;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-read-only" data-pagefind-weight="1" open>
<summary><code>readOnly</code> <span class="api-member-summary">Disables mutating interactions while preserving navigation and selection.</span></summary>

<button class="api-copy" type="button" data-copy-code="readOnly?: boolean;" data-pagefind-ignore>Copy</button>

```ts generated
readOnly?: boolean;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-hyperlink-activation" data-pagefind-weight="1" open>
<summary><code>hyperlinkActivation</code> <span class="api-member-summary">Hyperlink activation never opens a browser URL.</span></summary>

<button class="api-copy" type="button" data-copy-code="hyperlinkActivation?: &quot;event-only&quot; | &quot;internal-navigation&quot; | &quot;disabled&quot;;" data-pagefind-ignore>Copy</button>

```ts generated
hyperlinkActivation?: "event-only" | "internal-navigation" | "disabled";
```

<p class="api-member-doc">Hyperlink activation never opens a browser URL. `event-only` (default)
emits a safe resolved target; `internal-navigation` additionally moves to
stable internal destinations; `disabled` rejects every activation request.</p>
</details>

<details class="api-member" id="sheetwrite-grid-props-protection-resolver" data-pagefind-weight="1" open>
<summary><code>protectionResolver</code> <span class="api-member-summary">Host-owned client UX permission check.</span></summary>

<button class="api-copy" type="button" data-copy-code="protectionResolver?: ProtectionResolver;" data-pagefind-ignore>Copy</button>

```ts generated
protectionResolver?: ProtectionResolver;
```

<p class="api-member-doc">Host-owned client UX permission check. Servers must independently authorize
every submitted operation; this resolver is not an authentication boundary.</p>
</details>

<details class="api-member" id="sheetwrite-grid-props-mutation-policy" data-pagefind-weight="1" open>
<summary><code>mutationPolicy</code> <span class="api-member-summary">Atomic rejects the transaction; partial skips denied operation objects.</span></summary>

<button class="api-copy" type="button" data-copy-code="mutationPolicy?: MutationPolicyMode;" data-pagefind-ignore>Copy</button>

```ts generated
mutationPolicy?: MutationPolicyMode;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-transaction-resource-limits" data-pagefind-weight="1" open>
<summary><code>transactionResourceLimits</code> <span class="api-member-summary">Overrides inclusive operation-count and encoded-byte ceilings for every atomic mutation.</span></summary>

<button class="api-copy" type="button" data-copy-code="transactionResourceLimits?: Partial&lt;TransactionResourceLimits&gt;;" data-pagefind-ignore>Copy</button>

```ts generated
transactionResourceLimits?: Partial<TransactionResourceLimits>;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-renderers" data-pagefind-weight="1" open>
<summary><code>renderers</code> <span class="api-member-summary">Custom cell renderers registered up front; also see Grid.defineCellRenderer.</span></summary>

<button class="api-copy" type="button" data-copy-code="renderers?: Record&lt;string, CellRenderer&gt;;" data-pagefind-ignore>Copy</button>

```ts generated
renderers?: Record<string, CellRenderer>;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-editors" data-pagefind-weight="1" open>
<summary><code>editors</code> <span class="api-member-summary">Named custom editors resolved from each column's editor field.</span></summary>

<button class="api-copy" type="button" data-copy-code="editors?: Record&lt;string, CellEditor&gt;;" data-pagefind-ignore>Copy</button>

```ts generated
editors?: Record<string, CellEditor>;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-overscan" data-pagefind-weight="1" open>
<summary><code>overscan</code> <span class="api-member-summary">Extra row and visible-column positions painted on each viewport edge.</span></summary>

<button class="api-copy" type="button" data-copy-code="overscan?: number;" data-pagefind-ignore>Copy</button>

```ts generated
overscan?: number;
```

<p class="api-member-doc">Extra row and visible-column positions painted on each viewport edge.
Defaults to 6; use 0 to disable the buffer.</p>
</details>

<details class="api-member" id="sheetwrite-grid-props-min-columns" data-pagefind-weight="1" open>
<summary><code>minColumns</code> <span class="api-member-summary">Render at least this many columns (empty padding columns past the data, like a spreadsheet).</span></summary>

<button class="api-copy" type="button" data-copy-code="minColumns?: number;" data-pagefind-ignore>Copy</button>

```ts generated
minColumns?: number;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-config" data-pagefind-weight="1" open>
<summary><code>config</code> <span class="api-member-summary">Built-in UI controls; providing an object enables the toolbar unless toolbar is false.</span></summary>

<button class="api-copy" type="button" data-copy-code="config?: GridConfig;" data-pagefind-ignore>Copy</button>

```ts generated
config?: GridConfig;
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

<button class="api-copy" type="button" data-copy-code="export interface SheetwriteGridProps&lt;Id extends RowBridgeId = RowBridgeId&gt; {&#10;  rowBridge?: RowBridge&lt;Id&gt;;&#10;  onRowDelta?: RowBridgeHandler&lt;Id&gt;;&#10;  onMutationRejected?: GridAdapterEventHandlers[&quot;onMutationRejected&quot;];&#10;  onRendererFallback?: GridAdapterEventHandlers[&quot;onRendererFallback&quot;];&#10;  onDatasourceError?: GridAdapterEventHandlers[&quot;onDatasourceError&quot;];&#10;  onExportError?: GridAdapterEventHandlers[&quot;onExportError&quot;];&#10;  onReady?: GridAdapterEventHandlers[&quot;onReady&quot;];&#10;  className?: string;&#10;  style?: CSSProperties;&#10;  fallback?: ReactNode;&#10;  height?: number | string;&#10;  fill?: true;&#10;  onGridChange?: (event: ChangeEvent) =&gt; void;&#10;  onSelectionChange?: (selection: Selection | null) =&gt; void;&#10;  workbook: Workbook;&#10;  data?: ColumnarData;&#10;  datasource?: DataSource;&#10;  datasourceStorage?: DataSourceStorageOptions;&#10;  renderer?: &quot;canvas&quot; | &quot;worker&quot;;&#10;  workerUrl?: string | URL;&#10;  presentation?: GridPresentation;&#10;  theme?: Partial&lt;Theme&gt;;&#10;  readOnly?: boolean;&#10;  hyperlinkActivation?: &quot;event-only&quot; | &quot;internal-navigation&quot; | &quot;disabled&quot;;&#10;  protectionResolver?: ProtectionResolver;&#10;  mutationPolicy?: MutationPolicyMode;&#10;  transactionResourceLimits?: Partial&lt;TransactionResourceLimits&gt;;&#10;  renderers?: Record&lt;string, CellRenderer&gt;;&#10;  editors?: Record&lt;string, CellEditor&gt;;&#10;  overscan?: number;&#10;  minColumns?: number;&#10;  config?: GridConfig;&#10;  onViewportChange?: (event: GridEvents[&quot;scroll&quot;]) =&gt; void;&#10;  onEditBegin?: (event: GridEvents[&quot;edit-begin&quot;]) =&gt; void;&#10;  onEditCommit?: (event: GridEvents[&quot;edit-commit&quot;]) =&gt; void;&#10;  onSearch?: (result: GridEvents[&quot;search&quot;]) =&gt; void;&#10;  onActiveSheetChange?: (event: GridEvents[&quot;active-sheet&quot;]) =&gt; void;&#10;  onCommandStateChange?: (event: GridEvents[&quot;command-state-change&quot;]) =&gt; void;&#10;  onInitializationError?: (error: SheetwriteError) =&gt; void;&#10;  wasmSource?: BufferSource | URL | string | Request | WebAssembly.Module;&#10;}" data-pagefind-ignore>Copy</button>

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
  onViewportChange?: (event: GridEvents["scroll"]) => void;
  onEditBegin?: (event: GridEvents["edit-begin"]) => void;
  onEditCommit?: (event: GridEvents["edit-commit"]) => void;
  onSearch?: (result: GridEvents["search"]) => void;
  onActiveSheetChange?: (event: GridEvents["active-sheet"]) => void;
  onCommandStateChange?: (event: GridEvents["command-state-change"]) => void;
  onInitializationError?: (error: SheetwriteError) => void;
  wasmSource?: BufferSource | URL | string | Request | WebAssembly.Module;
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
