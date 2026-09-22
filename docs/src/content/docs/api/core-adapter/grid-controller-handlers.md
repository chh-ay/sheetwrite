---
title: "GridControllerHandlers | @sheetwrite/core/adapter"
description: "Event callbacks a host (a framework adapter, or any plain app) hangs off a grid's lifecycle."
---
<!-- api-export:@sheetwrite/core|./adapter|GridControllerHandlers -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-adapter/">@sheetwrite/core/adapter</a><span class="api-status" data-kind="interface">interface</span></div>

Event callbacks a host (a framework adapter, or any plain app) hangs off a
grid's lifecycle.

The controller reads these fields **live** on every event — see
[`createGridController`](/docs/api/core-adapter/create-grid-controller/) — so a host may swap any callback at any time by
mutating the fields of the object it passed in, without recreating the grid.
Every field is optional; a missing callback simply drops that event.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core/adapter</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/grid-controller.ts#L17</code></dd></div>
</dl>

<nav class="api-member-index" aria-label="Member index" data-pagefind-ignore>
<a href="#grid-controller-handlers-on-grid-change"><code>onGridChange</code></a>
<a href="#grid-controller-handlers-on-row-delta"><code>onRowDelta</code></a>
<a href="#grid-controller-handlers-on-selection-change"><code>onSelectionChange</code></a>
<a href="#grid-controller-handlers-on-viewport-change"><code>onViewportChange</code></a>
<a href="#grid-controller-handlers-on-edit-begin"><code>onEditBegin</code></a>
<a href="#grid-controller-handlers-on-edit-commit"><code>onEditCommit</code></a>
<a href="#grid-controller-handlers-on-search"><code>onSearch</code></a>
<a href="#grid-controller-handlers-on-command-state-change"><code>onCommandStateChange</code></a>
<a href="#grid-controller-handlers-on-active-sheet-change"><code>onActiveSheetChange</code></a>
<a href="#grid-controller-handlers-on-mutation-rejected"><code>onMutationRejected</code></a>
<a href="#grid-controller-handlers-on-renderer-fallback"><code>onRendererFallback</code></a>
<a href="#grid-controller-handlers-on-datasource-error"><code>onDatasourceError</code></a>
<a href="#grid-controller-handlers-on-export-error"><code>onExportError</code></a>
</nav>

## Members <span class="api-count" data-pagefind-ignore>13</span>

<div class="api-member-list">

<details class="api-member" id="grid-controller-handlers-on-grid-change" data-pagefind-weight="1" open>
<summary><code>onGridChange</code> <span class="api-member-summary">Forwarded from the grid's change event (a committed transaction).</span></summary>

<button class="api-copy" type="button" data-copy-code="onGridChange?(event: ChangeEvent): void;" data-pagefind-ignore>Copy</button>

```ts generated
onGridChange?(event: ChangeEvent): void;
```

</details>

<details class="api-member" id="grid-controller-handlers-on-row-delta" data-pagefind-weight="1" open>
<summary><code>onRowDelta</code> <span class="api-member-summary">Forwarded as a typed host-row projection when a bridge is attached.</span></summary>

<button class="api-copy" type="button" data-copy-code="onRowDelta?(projection: Parameters&lt;RowBridgeHandler&lt;Id&gt;&gt;[0]): void;" data-pagefind-ignore>Copy</button>

```ts generated
onRowDelta?(projection: Parameters<RowBridgeHandler<Id>>[0]): void;
```

</details>

<details class="api-member" id="grid-controller-handlers-on-selection-change" data-pagefind-weight="1" open>
<summary><code>onSelectionChange</code> <span class="api-member-summary">Forwarded from the grid's selection event; null when nothing is selected.</span></summary>

<button class="api-copy" type="button" data-copy-code="onSelectionChange?(selection: Selection | null): void;" data-pagefind-ignore>Copy</button>

```ts generated
onSelectionChange?(selection: Selection | null): void;
```

</details>

<details class="api-member" id="grid-controller-handlers-on-viewport-change" data-pagefind-weight="1" open>
<summary><code>onViewportChange</code> <span class="api-member-summary">Forwarded from the grid's scroll event.</span></summary>

<button class="api-copy" type="button" data-copy-code="onViewportChange?(event: GridEvents[&quot;scroll&quot;]): void;" data-pagefind-ignore>Copy</button>

```ts generated
onViewportChange?(event: GridEvents["scroll"]): void;
```

</details>

<details class="api-member" id="grid-controller-handlers-on-edit-begin" data-pagefind-weight="1" open>
<summary><code>onEditBegin</code> <span class="api-member-summary">Forwarded when a cell editor opens.</span></summary>

<button class="api-copy" type="button" data-copy-code="onEditBegin?(event: GridEvents[&quot;edit-begin&quot;]): void;" data-pagefind-ignore>Copy</button>

```ts generated
onEditBegin?(event: GridEvents["edit-begin"]): void;
```

</details>

<details class="api-member" id="grid-controller-handlers-on-edit-commit" data-pagefind-weight="1" open>
<summary><code>onEditCommit</code> <span class="api-member-summary">Forwarded after a cell editor commits.</span></summary>

<button class="api-copy" type="button" data-copy-code="onEditCommit?(event: GridEvents[&quot;edit-commit&quot;]): void;" data-pagefind-ignore>Copy</button>

```ts generated
onEditCommit?(event: GridEvents["edit-commit"]): void;
```

</details>

<details class="api-member" id="grid-controller-handlers-on-search" data-pagefind-weight="1" open>
<summary><code>onSearch</code> <span class="api-member-summary">Forwarded whenever the active search result changes.</span></summary>

<button class="api-copy" type="button" data-copy-code="onSearch?(result: GridEvents[&quot;search&quot;]): void;" data-pagefind-ignore>Copy</button>

```ts generated
onSearch?(result: GridEvents["search"]): void;
```

</details>

<details class="api-member" id="grid-controller-handlers-on-command-state-change" data-pagefind-weight="1" open>
<summary><code>onCommandStateChange</code> <span class="api-member-summary">Forwarded whenever command availability or formatting activity changes.</span></summary>

<button class="api-copy" type="button" data-copy-code="onCommandStateChange?(event: GridEvents[&quot;command-state-change&quot;]): void;" data-pagefind-ignore>Copy</button>

```ts generated
onCommandStateChange?(event: GridEvents["command-state-change"]): void;
```

</details>

<details class="api-member" id="grid-controller-handlers-on-active-sheet-change" data-pagefind-weight="1" open>
<summary><code>onActiveSheetChange</code> <span class="api-member-summary">Forwarded after the visible sheet changes.</span></summary>

<button class="api-copy" type="button" data-copy-code="onActiveSheetChange?(event: GridEvents[&quot;active-sheet&quot;]): void;" data-pagefind-ignore>Copy</button>

```ts generated
onActiveSheetChange?(event: GridEvents["active-sheet"]): void;
```

</details>

<details class="api-member" id="grid-controller-handlers-on-mutation-rejected" data-pagefind-weight="1" open>
<summary><code>onMutationRejected</code> <span class="api-member-summary">Forwarded when a Grid mutation is rejected.</span></summary>

<button class="api-copy" type="button" data-copy-code="onMutationRejected?(event: GridEvents[&quot;mutation-rejected&quot;]): void;" data-pagefind-ignore>Copy</button>

```ts generated
onMutationRejected?(event: GridEvents["mutation-rejected"]): void;
```

</details>

<details class="api-member" id="grid-controller-handlers-on-renderer-fallback" data-pagefind-weight="1" open>
<summary><code>onRendererFallback</code> <span class="api-member-summary">Forwarded when worker rendering falls back to the main-thread canvas renderer.</span></summary>

<button class="api-copy" type="button" data-copy-code="onRendererFallback?(event: GridEvents[&quot;renderer-fallback&quot;]): void;" data-pagefind-ignore>Copy</button>

```ts generated
onRendererFallback?(event: GridEvents["renderer-fallback"]): void;
```

</details>

<details class="api-member" id="grid-controller-handlers-on-datasource-error" data-pagefind-weight="1" open>
<summary><code>onDatasourceError</code> <span class="api-member-summary">Forwarded when a datasource request fails.</span></summary>

<button class="api-copy" type="button" data-copy-code="onDatasourceError?(event: GridEvents[&quot;datasource-error&quot;]): void;" data-pagefind-ignore>Copy</button>

```ts generated
onDatasourceError?(event: GridEvents["datasource-error"]): void;
```

</details>

<details class="api-member" id="grid-controller-handlers-on-export-error" data-pagefind-weight="1" open>
<summary><code>onExportError</code> <span class="api-member-summary">Forwarded when a built-in XLSX export action fails.</span></summary>

<button class="api-copy" type="button" data-copy-code="onExportError?(event: GridEvents[&quot;export-error&quot;]): void;" data-pagefind-ignore>Copy</button>

```ts generated
onExportError?(event: GridEvents["export-error"]): void;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface GridControllerHandlers&lt;&#10;  Id extends RowBridgeId = RowBridgeId,&#10;&gt; {&#10;  onGridChange?(event: ChangeEvent): void;&#10;  onRowDelta?(projection: Parameters&lt;RowBridgeHandler&lt;Id&gt;&gt;[0]): void;&#10;  onSelectionChange?(selection: Selection | null): void;&#10;  onViewportChange?(event: GridEvents[&quot;scroll&quot;]): void;&#10;  onEditBegin?(event: GridEvents[&quot;edit-begin&quot;]): void;&#10;  onEditCommit?(event: GridEvents[&quot;edit-commit&quot;]): void;&#10;  onSearch?(result: GridEvents[&quot;search&quot;]): void;&#10;  onCommandStateChange?(event: GridEvents[&quot;command-state-change&quot;]): void;&#10;  onActiveSheetChange?(event: GridEvents[&quot;active-sheet&quot;]): void;&#10;  onMutationRejected?(event: GridEvents[&quot;mutation-rejected&quot;]): void;&#10;  onRendererFallback?(event: GridEvents[&quot;renderer-fallback&quot;]): void;&#10;  onDatasourceError?(event: GridEvents[&quot;datasource-error&quot;]): void;&#10;  onExportError?(event: GridEvents[&quot;export-error&quot;]): void;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
export interface GridControllerHandlers<
  Id extends RowBridgeId = RowBridgeId,
> {
  onGridChange?(event: ChangeEvent): void;
  onRowDelta?(projection: Parameters<RowBridgeHandler<Id>>[0]): void;
  onSelectionChange?(selection: Selection | null): void;
  onViewportChange?(event: GridEvents["scroll"]): void;
  onEditBegin?(event: GridEvents["edit-begin"]): void;
  onEditCommit?(event: GridEvents["edit-commit"]): void;
  onSearch?(result: GridEvents["search"]): void;
  onCommandStateChange?(event: GridEvents["command-state-change"]): void;
  onActiveSheetChange?(event: GridEvents["active-sheet"]): void;
  onMutationRejected?(event: GridEvents["mutation-rejected"]): void;
  onRendererFallback?(event: GridEvents["renderer-fallback"]): void;
  onDatasourceError?(event: GridEvents["datasource-error"]): void;
  onExportError?(event: GridEvents["export-error"]): void;
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

<p class="api-consumers-label">Public exports naming <code>GridControllerHandlers</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core-adapter/create-grid-controller/"><code>createGridController</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
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
