---
title: "GridAdapterEventHandlers | @sheetwrite/core/adapter"
description: "Framework-neutral readiness, change, and error callbacks shared by adapters."
---
<!-- api-export:@sheetwrite/core|./adapter|GridAdapterEventHandlers -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-adapter/">@sheetwrite/core/adapter</a><span class="api-status" data-kind="interface">interface</span></div>

Framework-neutral readiness, change, and error callbacks shared by adapters.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core/adapter</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/adapter.ts#L106</code></dd></div>
</dl>

<nav class="api-member-index" aria-label="Member index" data-pagefind-ignore>
<a href="#grid-adapter-event-handlers-on-grid-change"><code>onGridChange</code></a>
<a href="#grid-adapter-event-handlers-on-row-delta"><code>onRowDelta</code></a>
<a href="#grid-adapter-event-handlers-on-selection-change"><code>onSelectionChange</code></a>
<a href="#grid-adapter-event-handlers-on-viewport-change"><code>onViewportChange</code></a>
<a href="#grid-adapter-event-handlers-on-edit-begin"><code>onEditBegin</code></a>
<a href="#grid-adapter-event-handlers-on-edit-commit"><code>onEditCommit</code></a>
<a href="#grid-adapter-event-handlers-on-search"><code>onSearch</code></a>
<a href="#grid-adapter-event-handlers-on-active-sheet-change"><code>onActiveSheetChange</code></a>
<a href="#grid-adapter-event-handlers-on-command-state-change"><code>onCommandStateChange</code></a>
<a href="#grid-adapter-event-handlers-on-mutation-rejected"><code>onMutationRejected</code></a>
<a href="#grid-adapter-event-handlers-on-renderer-fallback"><code>onRendererFallback</code></a>
<a href="#grid-adapter-event-handlers-on-datasource-error"><code>onDatasourceError</code></a>
<a href="#grid-adapter-event-handlers-on-export-error"><code>onExportError</code></a>
<a href="#grid-adapter-event-handlers-on-ready"><code>onReady</code></a>
<a href="#grid-adapter-event-handlers-on-initialization-error"><code>onInitializationError</code></a>
</nav>

## Members <span class="api-count" data-pagefind-ignore>15</span>

<div class="api-member-list">
<h3 id="ongridchange" class="api-search-anchor">onGridChange</h3>
<details class="api-member" id="grid-adapter-event-handlers-on-grid-change" data-pagefind-weight="10" open>
<summary><code>onGridChange</code> <span class="api-member-summary">Receives every committed Grid change, including its applied transaction.</span></summary>

<button class="api-copy" type="button" data-copy-code="onGridChange?: (event: ChangeEvent) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
onGridChange?: (event: ChangeEvent) => void;
```

</details>

<details class="api-member" id="grid-adapter-event-handlers-on-row-delta" data-pagefind-weight="1" open>
<summary><code>onRowDelta</code> <span class="api-member-summary">Receives projected host-row effects when a row bridge is attached.</span></summary>

<button class="api-copy" type="button" data-copy-code="onRowDelta?: RowBridgeHandler&lt;Id&gt;;" data-pagefind-ignore>Copy</button>

```ts generated
onRowDelta?: RowBridgeHandler<Id>;
```

</details>

<details class="api-member" id="grid-adapter-event-handlers-on-selection-change" data-pagefind-weight="1" open>
<summary><code>onSelectionChange</code> <span class="api-member-summary">Receives the current selection, or null after it is cleared.</span></summary>

<button class="api-copy" type="button" data-copy-code="onSelectionChange?: (selection: Selection | null) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
onSelectionChange?: (selection: Selection | null) => void;
```

</details>

<details class="api-member" id="grid-adapter-event-handlers-on-viewport-change" data-pagefind-weight="1" open>
<summary><code>onViewportChange</code> <span class="api-member-summary">Receives visible row bounds and vertical scroll offset after scrolling.</span></summary>

<button class="api-copy" type="button" data-copy-code="onViewportChange?: (event: GridEvents[&quot;scroll&quot;]) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
onViewportChange?: (event: GridEvents["scroll"]) => void;
```

</details>

<details class="api-member" id="grid-adapter-event-handlers-on-edit-begin" data-pagefind-weight="1" open>
<summary><code>onEditBegin</code> <span class="api-member-summary">Fires when cell editing begins.</span></summary>

<button class="api-copy" type="button" data-copy-code="onEditBegin?: (event: GridEvents[&quot;edit-begin&quot;]) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
onEditBegin?: (event: GridEvents["edit-begin"]) => void;
```

</details>

<details class="api-member" id="grid-adapter-event-handlers-on-edit-commit" data-pagefind-weight="1" open>
<summary><code>onEditCommit</code> <span class="api-member-summary">Fires after an edit commits its parsed cell value.</span></summary>

<button class="api-copy" type="button" data-copy-code="onEditCommit?: (event: GridEvents[&quot;edit-commit&quot;]) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
onEditCommit?: (event: GridEvents["edit-commit"]) => void;
```

</details>

<details class="api-member" id="grid-adapter-event-handlers-on-search" data-pagefind-weight="1" open>
<summary><code>onSearch</code> <span class="api-member-summary">Receives refreshed search matches and active-match index.</span></summary>

<button class="api-copy" type="button" data-copy-code="onSearch?: (result: GridEvents[&quot;search&quot;]) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
onSearch?: (result: GridEvents["search"]) => void;
```

</details>

<details class="api-member" id="grid-adapter-event-handlers-on-active-sheet-change" data-pagefind-weight="1" open>
<summary><code>onActiveSheetChange</code> <span class="api-member-summary">Fires after the visible sheet changes.</span></summary>

<button class="api-copy" type="button" data-copy-code="onActiveSheetChange?: (event: GridEvents[&quot;active-sheet&quot;]) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
onActiveSheetChange?: (event: GridEvents["active-sheet"]) => void;
```

</details>

<details class="api-member" id="grid-adapter-event-handlers-on-command-state-change" data-pagefind-weight="1" open>
<summary><code>onCommandStateChange</code> <span class="api-member-summary">Receives observable undo/redo and formatting command state.</span></summary>

<button class="api-copy" type="button" data-copy-code="onCommandStateChange?: (event: GridEvents[&quot;command-state-change&quot;]) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
onCommandStateChange?: (event: GridEvents["command-state-change"]) => void;
```

</details>

<details class="api-member" id="grid-adapter-event-handlers-on-mutation-rejected" data-pagefind-weight="1" open>
<summary><code>onMutationRejected</code> <span class="api-member-summary">Receives structured issues when a Grid mutation is rejected.</span></summary>

<button class="api-copy" type="button" data-copy-code="onMutationRejected?: (event: GridEvents[&quot;mutation-rejected&quot;]) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
onMutationRejected?: (event: GridEvents["mutation-rejected"]) => void;
```

</details>

<details class="api-member" id="grid-adapter-event-handlers-on-renderer-fallback" data-pagefind-weight="1" open>
<summary><code>onRendererFallback</code> <span class="api-member-summary">Fires when worker rendering falls back to the main-thread canvas renderer.</span></summary>

<button class="api-copy" type="button" data-copy-code="onRendererFallback?: (event: GridEvents[&quot;renderer-fallback&quot;]) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
onRendererFallback?: (event: GridEvents["renderer-fallback"]) => void;
```

</details>

<details class="api-member" id="grid-adapter-event-handlers-on-datasource-error" data-pagefind-weight="1" open>
<summary><code>onDatasourceError</code> <span class="api-member-summary">Receives failed datasource requests and their errors.</span></summary>

<button class="api-copy" type="button" data-copy-code="onDatasourceError?: (event: GridEvents[&quot;datasource-error&quot;]) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
onDatasourceError?: (event: GridEvents["datasource-error"]) => void;
```

</details>

<details class="api-member" id="grid-adapter-event-handlers-on-export-error" data-pagefind-weight="1" open>
<summary><code>onExportError</code> <span class="api-member-summary">Receives failures from built-in XLSX export actions.</span></summary>

<button class="api-copy" type="button" data-copy-code="onExportError?: (event: GridEvents[&quot;export-error&quot;]) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
onExportError?: (event: GridEvents["export-error"]) => void;
```

</details>

<details class="api-member" id="grid-adapter-event-handlers-on-ready" data-pagefind-weight="1" open>
<summary><code>onReady</code> <span class="api-member-summary">Fires after the adapter publishes a ready Grid generation.</span></summary>

<button class="api-copy" type="button" data-copy-code="onReady?: (event: GridReadyEvent) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
onReady?: (event: GridReadyEvent) => void;
```

</details>

<details class="api-member" id="grid-adapter-event-handlers-on-initialization-error" data-pagefind-weight="1" open>
<summary><code>onInitializationError</code> <span class="api-member-summary">Receives a WASM initialization failure while the adapter remains mounted.</span></summary>

<button class="api-copy" type="button" data-copy-code="onInitializationError?: (error: SheetwriteError) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
onInitializationError?: (error: SheetwriteError) => void;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface GridAdapterEventHandlers&lt;&#10;  Id extends RowBridgeId = RowBridgeId,&#10;&gt; {&#10;  onGridChange?: (event: ChangeEvent) =&gt; void;&#10;  onRowDelta?: RowBridgeHandler&lt;Id&gt;;&#10;  onSelectionChange?: (selection: Selection | null) =&gt; void;&#10;  onViewportChange?: (event: GridEvents[&quot;scroll&quot;]) =&gt; void;&#10;  onEditBegin?: (event: GridEvents[&quot;edit-begin&quot;]) =&gt; void;&#10;  onEditCommit?: (event: GridEvents[&quot;edit-commit&quot;]) =&gt; void;&#10;  onSearch?: (result: GridEvents[&quot;search&quot;]) =&gt; void;&#10;  onActiveSheetChange?: (event: GridEvents[&quot;active-sheet&quot;]) =&gt; void;&#10;  onCommandStateChange?: (event: GridEvents[&quot;command-state-change&quot;]) =&gt; void;&#10;  onMutationRejected?: (event: GridEvents[&quot;mutation-rejected&quot;]) =&gt; void;&#10;  onRendererFallback?: (event: GridEvents[&quot;renderer-fallback&quot;]) =&gt; void;&#10;  onDatasourceError?: (event: GridEvents[&quot;datasource-error&quot;]) =&gt; void;&#10;  onExportError?: (event: GridEvents[&quot;export-error&quot;]) =&gt; void;&#10;  onReady?: (event: GridReadyEvent) =&gt; void;&#10;  onInitializationError?: (error: SheetwriteError) =&gt; void;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
export interface GridAdapterEventHandlers<
  Id extends RowBridgeId = RowBridgeId,
> {
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

<p class="api-consumers-label">Public exports naming <code>GridAdapterEventHandlers</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/react/sheetwrite-grid-props/"><code>SheetwriteGridProps</code></a><span class="api-consumer-kind">@sheetwrite/react</span></li>
<li><a href="/docs/api/svelte/sheetwrite-grid-props/"><code>SheetwriteGridProps</code></a><span class="api-consumer-kind">@sheetwrite/svelte</span></li>
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
