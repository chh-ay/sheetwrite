---
title: "GridOptions | @sheetwrite/core"
description: "Workbook, data, rendering, policy, and built-in UI options used to create a Grid."
---
<!-- api-export:@sheetwrite/core|.|GridOptions -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Workbook, data, rendering, policy, and built-in UI options used to create a Grid.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/grid.ts#L323</code></dd></div>
</dl>

<nav class="api-member-index" aria-label="Member index" data-pagefind-ignore>
<a href="#grid-options-workbook"><code>workbook</code></a>
<a href="#grid-options-data"><code>data</code></a>
<a href="#grid-options-datasource"><code>datasource</code></a>
<a href="#grid-options-datasource-storage"><code>datasourceStorage</code></a>
<a href="#grid-options-renderer"><code>renderer</code></a>
<a href="#grid-options-worker-url"><code>workerUrl</code></a>
<a href="#grid-options-presentation"><code>presentation</code></a>
<a href="#grid-options-theme"><code>theme</code></a>
<a href="#grid-options-read-only"><code>readOnly</code></a>
<a href="#grid-options-hyperlink-activation"><code>hyperlinkActivation</code></a>
<a href="#grid-options-protection-resolver"><code>protectionResolver</code></a>
<a href="#grid-options-mutation-policy"><code>mutationPolicy</code></a>
<a href="#grid-options-transaction-resource-limits"><code>transactionResourceLimits</code></a>
<a href="#grid-options-renderers"><code>renderers</code></a>
<a href="#grid-options-editors"><code>editors</code></a>
<a href="#grid-options-overscan"><code>overscan</code></a>
<a href="#grid-options-min-columns"><code>minColumns</code></a>
<a href="#grid-options-config"><code>config</code></a>
</nav>

## Members <span class="api-count" data-pagefind-ignore>18</span>

<div class="api-member-list">

<details class="api-member" id="grid-options-workbook" data-pagefind-weight="1" open>
<summary><code>workbook</code> <span class="api-member-summary">Live workbook schema adopted by the store and updated by document operations.</span></summary>

<button class="api-copy" type="button" data-copy-code="workbook: Workbook;" data-pagefind-ignore>Copy</button>

```ts generated
workbook: Workbook;
```

</details>

<details class="api-member" id="grid-options-data" data-pagefind-weight="1" open>
<summary><code>data</code> <span class="api-member-summary">Eager column-major values loaded into workbook.activeSheet; use instead of datasource.</span></summary>

<button class="api-copy" type="button" data-copy-code="data?: ColumnarData;" data-pagefind-ignore>Copy</button>

```ts generated
data?: ColumnarData;
```

</details>

<details class="api-member" id="grid-options-datasource" data-pagefind-weight="1" open>
<summary><code>datasource</code> <span class="api-member-summary">Lazy row provider requested for visible windows; use instead of eager data.</span></summary>

<button class="api-copy" type="button" data-copy-code="datasource?: DataSource;" data-pagefind-ignore>Copy</button>

```ts generated
datasource?: DataSource;
```

</details>

<details class="api-member" id="grid-options-datasource-storage" data-pagefind-weight="1" open>
<summary><code>datasourceStorage</code> <span class="api-member-summary">Allocation and cache policy for datasource-backed cell storage.</span></summary>

<button class="api-copy" type="button" data-copy-code="datasourceStorage?: DataSourceStorageOptions;" data-pagefind-ignore>Copy</button>

```ts generated
datasourceStorage?: DataSourceStorageOptions;
```

</details>

<details class="api-member" id="grid-options-renderer" data-pagefind-weight="1" open>
<summary><code>renderer</code> <span class="api-member-summary">Paint backend; defaults to main-thread canvas and falls back there if a worker fails.</span></summary>

<button class="api-copy" type="button" data-copy-code="renderer?: &quot;canvas&quot; | &quot;worker&quot;;" data-pagefind-ignore>Copy</button>

```ts generated
renderer?: "canvas" | "worker";
```

</details>

<details class="api-member" id="grid-options-worker-url" data-pagefind-weight="1" open>
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

<details class="api-member" id="grid-options-presentation" data-pagefind-weight="1" open>
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

<details class="api-member" id="grid-options-theme" data-pagefind-weight="1" open>
<summary><code>theme</code> <span class="api-member-summary">Overrides merged over the default theme and host CSS custom properties.</span></summary>

<button class="api-copy" type="button" data-copy-code="theme?: Partial&lt;Theme&gt;;" data-pagefind-ignore>Copy</button>

```ts generated
theme?: Partial<Theme>;
```

</details>

<details class="api-member" id="grid-options-read-only" data-pagefind-weight="1" open>
<summary><code>readOnly</code> <span class="api-member-summary">Disables mutating interactions while preserving navigation and selection.</span></summary>

<button class="api-copy" type="button" data-copy-code="readOnly?: boolean;" data-pagefind-ignore>Copy</button>

```ts generated
readOnly?: boolean;
```

</details>

<details class="api-member" id="grid-options-hyperlink-activation" data-pagefind-weight="1" open>
<summary><code>hyperlinkActivation</code> <span class="api-member-summary">Hyperlink activation never opens a browser URL.</span></summary>

<button class="api-copy" type="button" data-copy-code="hyperlinkActivation?: &quot;event-only&quot; | &quot;internal-navigation&quot; | &quot;disabled&quot;;" data-pagefind-ignore>Copy</button>

```ts generated
hyperlinkActivation?: "event-only" | "internal-navigation" | "disabled";
```

<p class="api-member-doc">Hyperlink activation never opens a browser URL. `event-only` (default)
emits a safe resolved target; `internal-navigation` additionally moves to
stable internal destinations; `disabled` rejects every activation request.</p>
</details>

<details class="api-member" id="grid-options-protection-resolver" data-pagefind-weight="1" open>
<summary><code>protectionResolver</code> <span class="api-member-summary">Host-owned client UX permission check.</span></summary>

<button class="api-copy" type="button" data-copy-code="protectionResolver?: ProtectionResolver;" data-pagefind-ignore>Copy</button>

```ts generated
protectionResolver?: ProtectionResolver;
```

<p class="api-member-doc">Host-owned client UX permission check. Servers must independently authorize
every submitted operation; this resolver is not an authentication boundary.</p>
</details>

<details class="api-member" id="grid-options-mutation-policy" data-pagefind-weight="1" open>
<summary><code>mutationPolicy</code> <span class="api-member-summary">Atomic rejects the transaction; partial skips denied operation objects.</span></summary>

<button class="api-copy" type="button" data-copy-code="mutationPolicy?: MutationPolicyMode;" data-pagefind-ignore>Copy</button>

```ts generated
mutationPolicy?: MutationPolicyMode;
```

</details>

<details class="api-member" id="grid-options-transaction-resource-limits" data-pagefind-weight="1" open>
<summary><code>transactionResourceLimits</code> <span class="api-member-summary">Overrides inclusive operation-count and encoded-byte ceilings for every atomic mutation.</span></summary>

<button class="api-copy" type="button" data-copy-code="transactionResourceLimits?: Partial&lt;TransactionResourceLimits&gt;;" data-pagefind-ignore>Copy</button>

```ts generated
transactionResourceLimits?: Partial<TransactionResourceLimits>;
```

</details>

<details class="api-member" id="grid-options-renderers" data-pagefind-weight="1" open>
<summary><code>renderers</code> <span class="api-member-summary">Custom cell renderers registered up front; also see Grid.defineCellRenderer.</span></summary>

<button class="api-copy" type="button" data-copy-code="renderers?: Record&lt;string, CellRenderer&gt;;" data-pagefind-ignore>Copy</button>

```ts generated
renderers?: Record<string, CellRenderer>;
```

</details>

<details class="api-member" id="grid-options-editors" data-pagefind-weight="1" open>
<summary><code>editors</code> <span class="api-member-summary">Named custom editors resolved from each column's editor field.</span></summary>

<button class="api-copy" type="button" data-copy-code="editors?: Record&lt;string, CellEditor&gt;;" data-pagefind-ignore>Copy</button>

```ts generated
editors?: Record<string, CellEditor>;
```

</details>

<details class="api-member" id="grid-options-overscan" data-pagefind-weight="1" open>
<summary><code>overscan</code> <span class="api-member-summary">Extra row and visible-column positions painted on each viewport edge.</span></summary>

<button class="api-copy" type="button" data-copy-code="overscan?: number;" data-pagefind-ignore>Copy</button>

```ts generated
overscan?: number;
```

<p class="api-member-doc">Extra row and visible-column positions painted on each viewport edge.
Defaults to 6; use 0 to disable the buffer.</p>
</details>

<details class="api-member" id="grid-options-min-columns" data-pagefind-weight="1" open>
<summary><code>minColumns</code> <span class="api-member-summary">Render at least this many columns (empty padding columns past the data, like a spreadsheet).</span></summary>

<button class="api-copy" type="button" data-copy-code="minColumns?: number;" data-pagefind-ignore>Copy</button>

```ts generated
minColumns?: number;
```

</details>

<details class="api-member" id="grid-options-config" data-pagefind-weight="1" open>
<summary><code>config</code> <span class="api-member-summary">Built-in UI controls; providing an object enables the toolbar unless toolbar is false.</span></summary>

<button class="api-copy" type="button" data-copy-code="config?: GridConfig;" data-pagefind-ignore>Copy</button>

```ts generated
config?: GridConfig;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface GridOptions {&#10;  workbook: Workbook;&#10;  data?: ColumnarData;&#10;  datasource?: DataSource;&#10;  datasourceStorage?: DataSourceStorageOptions;&#10;  renderer?: &quot;canvas&quot; | &quot;worker&quot;;&#10;  workerUrl?: string | URL;&#10;  presentation?: GridPresentation;&#10;  theme?: Partial&lt;Theme&gt;;&#10;  readOnly?: boolean;&#10;  hyperlinkActivation?: &quot;event-only&quot; | &quot;internal-navigation&quot; | &quot;disabled&quot;;&#10;  protectionResolver?: ProtectionResolver;&#10;  mutationPolicy?: MutationPolicyMode;&#10;  transactionResourceLimits?: Partial&lt;TransactionResourceLimits&gt;;&#10;  renderers?: Record&lt;string, CellRenderer&gt;;&#10;  editors?: Record&lt;string, CellEditor&gt;;&#10;  overscan?: number;&#10;  minColumns?: number;&#10;  config?: GridConfig;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
export interface GridOptions {
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
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/core</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/bench</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/react</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/svelte</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/vue</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/xlsx</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>GridOptions</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/create-grid/"><code>createGrid</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/snapshot-grid-options/"><code>SnapshotGridOptions</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-adapter/apply-changed-live-grid-options/"><code>applyChangedLiveGridOptions</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-adapter/create-grid-controller/"><code>createGridController</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-adapter/extract-grid-options/"><code>extractGridOptions</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-adapter/get-grid-reset-reason/"><code>getGridResetReason</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-shell/spreadsheet-shell-options/"><code>SpreadsheetShellOptions</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/svelte/sheetwrite-grid-props/"><code>SheetwriteGridProps</code></a><span class="api-consumer-kind">@sheetwrite/svelte</span></li>
<li><a href="/docs/api/vue/sheetwrite-grid-props/"><code>SheetwriteGridProps</code></a><span class="api-consumer-kind">@sheetwrite/vue</span></li>
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
