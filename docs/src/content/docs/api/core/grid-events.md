---
title: "GridEvents | @sheetwrite/core"
description: "Payload map for events emitted by a Grid."
---
<!-- api-export:@sheetwrite/core|.|GridEvents -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Payload map for events emitted by a Grid.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/grid.ts#L444</code></dd></div>
</dl>

<nav class="api-member-index" aria-label="Member index" data-pagefind-ignore>
<a href="#grid-events-change"><code>change</code></a>
<a href="#grid-events-selection"><code>selection</code></a>
<a href="#grid-events-scroll"><code>scroll</code></a>
<a href="#grid-events-edit-begin"><code>edit-begin</code></a>
<a href="#grid-events-edit-commit"><code>edit-commit</code></a>
<a href="#grid-events-search"><code>search</code></a>
<a href="#grid-events-command-state-change"><code>command-state-change</code></a>
<a href="#grid-events-mutation-rejected"><code>mutation-rejected</code></a>
<a href="#grid-events-active-sheet"><code>active-sheet</code></a>
<a href="#grid-events-hyperlink-activate"><code>hyperlink-activate</code></a>
<a href="#grid-events-renderer-fallback"><code>renderer-fallback</code></a>
<a href="#grid-events-datasource-error"><code>datasource-error</code></a>
<a href="#grid-events-export-error"><code>export-error</code></a>
</nav>

## Members <span class="api-count" data-pagefind-ignore>13</span>

<div class="api-member-list">

<details class="api-member" id="grid-events-change" data-pagefind-weight="1" open>
<summary><code>change</code></summary>

<button class="api-copy" type="button" data-copy-code="change: ChangeEvent;" data-pagefind-ignore>Copy</button>

```ts generated
change: ChangeEvent;
```

</details>

<details class="api-member" id="grid-events-selection" data-pagefind-weight="1" open>
<summary><code>selection</code></summary>

<button class="api-copy" type="button" data-copy-code="selection: { selection: Selection | null };" data-pagefind-ignore>Copy</button>

```ts generated
selection: { selection: Selection | null };
```

</details>

<details class="api-member" id="grid-events-scroll" data-pagefind-weight="1">
<summary><code>scroll</code></summary>

<button class="api-copy" type="button" data-copy-code="scroll: { scrollTop: number; firstRow: number; lastRow: number; scrollLeft: number; firstVisibleColumn: number | null; lastVisibleColumn: number | null; };" data-pagefind-ignore>Copy</button>

```ts generated
scroll: { scrollTop: number; firstRow: number; lastRow: number; scrollLeft: number; firstVisibleColumn: number | null; lastVisibleColumn: number | null; };
```

</details>

<details class="api-member" id="grid-events-edit-begin" data-pagefind-weight="1" open>
<summary><code>edit-begin</code></summary>

<button class="api-copy" type="button" data-copy-code="&quot;edit-begin&quot;: { addr: CellAddress };" data-pagefind-ignore>Copy</button>

```ts generated
"edit-begin": { addr: CellAddress };
```

</details>

<details class="api-member" id="grid-events-edit-commit" data-pagefind-weight="1" open>
<summary><code>edit-commit</code></summary>

<button class="api-copy" type="button" data-copy-code="&quot;edit-commit&quot;: { addr: CellAddress; value: CellValue };" data-pagefind-ignore>Copy</button>

```ts generated
"edit-commit": { addr: CellAddress; value: CellValue };
```

</details>

<details class="api-member" id="grid-events-search" data-pagefind-weight="1" open>
<summary><code>search</code></summary>

<button class="api-copy" type="button" data-copy-code="search: SearchResult;" data-pagefind-ignore>Copy</button>

```ts generated
search: SearchResult;
```

</details>

<details class="api-member" id="grid-events-command-state-change" data-pagefind-weight="1" open>
<summary><code>command-state-change</code> <span class="api-member-summary">Command availability or formatting activity changed.</span></summary>

<button class="api-copy" type="button" data-copy-code="&quot;command-state-change&quot;: GridCommandStateChangeEvent;" data-pagefind-ignore>Copy</button>

```ts generated
"command-state-change": GridCommandStateChangeEvent;
```

</details>

<details class="api-member" id="grid-events-mutation-rejected" data-pagefind-weight="1" open>
<summary><code>mutation-rejected</code></summary>

<button class="api-copy" type="button" data-copy-code="&quot;mutation-rejected&quot;: { issues: MutationIssue[] };" data-pagefind-ignore>Copy</button>

```ts generated
"mutation-rejected": { issues: MutationIssue[] };
```

</details>

<details class="api-member" id="grid-events-active-sheet" data-pagefind-weight="1" open>
<summary><code>active-sheet</code> <span class="api-member-summary">Emitted after the visible sheet changes (direct call or cross-sheet scroll).</span></summary>

<button class="api-copy" type="button" data-copy-code="&quot;active-sheet&quot;: { sheet: SheetId };" data-pagefind-ignore>Copy</button>

```ts generated
"active-sheet": { sheet: SheetId };
```

</details>

<details class="api-member" id="grid-events-hyperlink-activate" data-pagefind-weight="1" open>
<summary><code>hyperlink-activate</code></summary>

<button class="api-copy" type="button" data-copy-code="&quot;hyperlink-activate&quot;: HyperlinkActivationEvent;" data-pagefind-ignore>Copy</button>

```ts generated
"hyperlink-activate": HyperlinkActivationEvent;
```

</details>

<details class="api-member" id="grid-events-renderer-fallback" data-pagefind-weight="1" open>
<summary><code>renderer-fallback</code> <span class="api-member-summary">Emitted once when the worker renderer could not be constructed and the grid fell back to the main-thread canvas renderer.</span></summary>

<button class="api-copy" type="button" data-copy-code="&quot;renderer-fallback&quot;: { requested: &quot;worker&quot;; error: SheetwriteError };" data-pagefind-ignore>Copy</button>

```ts generated
"renderer-fallback": { requested: "worker"; error: SheetwriteError };
```

</details>

<details class="api-member" id="grid-events-datasource-error" data-pagefind-weight="1" open>
<summary><code>datasource-error</code></summary>

<button class="api-copy" type="button" data-copy-code="&quot;datasource-error&quot;: { request: Omit&lt;DataSourceRequest, &quot;signal&quot;&gt;; error: SheetwriteError; };" data-pagefind-ignore>Copy</button>

```ts generated
"datasource-error": { request: Omit<DataSourceRequest, "signal">; error: SheetwriteError; };
```

</details>

<details class="api-member" id="grid-events-export-error" data-pagefind-weight="1" open>
<summary><code>export-error</code> <span class="api-member-summary">Built-in toolbar/context-menu export failed after its action was dispatched.</span></summary>

<button class="api-copy" type="button" data-copy-code="&quot;export-error&quot;: { format: &quot;xlsx&quot;; error: SheetwriteError };" data-pagefind-ignore>Copy</button>

```ts generated
"export-error": { format: "xlsx"; error: SheetwriteError };
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface GridEvents {&#10;  change: ChangeEvent;&#10;  selection: {&#10;    selection: Selection | null;&#10;  };&#10;  scroll: {&#10;    scrollTop: number;&#10;    firstRow: number;&#10;    lastRow: number;&#10;    scrollLeft: number;&#10;    firstVisibleColumn: number | null;&#10;    lastVisibleColumn: number | null;&#10;  };&#10;  &quot;edit-begin&quot;: {&#10;    addr: CellAddress;&#10;  };&#10;  &quot;edit-commit&quot;: {&#10;    addr: CellAddress;&#10;    value: CellValue;&#10;  };&#10;  search: SearchResult;&#10;  &quot;command-state-change&quot;: GridCommandStateChangeEvent;&#10;  &quot;mutation-rejected&quot;: {&#10;    issues: MutationIssue[];&#10;  };&#10;  &quot;active-sheet&quot;: {&#10;    sheet: SheetId;&#10;  };&#10;  &quot;hyperlink-activate&quot;: HyperlinkActivationEvent;&#10;  &quot;renderer-fallback&quot;: {&#10;    requested: &quot;worker&quot;;&#10;    error: SheetwriteError;&#10;  };&#10;  &quot;datasource-error&quot;: {&#10;    request: Omit&lt;DataSourceRequest, &quot;signal&quot;&gt;;&#10;    error: SheetwriteError;&#10;  };&#10;  &quot;export-error&quot;: {&#10;    format: &quot;xlsx&quot;;&#10;    error: SheetwriteError;&#10;  };&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
export interface GridEvents {
  change: ChangeEvent;
  selection: {
    selection: Selection | null;
  };
  scroll: {
    scrollTop: number;
    firstRow: number;
    lastRow: number;
    scrollLeft: number;
    firstVisibleColumn: number | null;
    lastVisibleColumn: number | null;
  };
  "edit-begin": {
    addr: CellAddress;
  };
  "edit-commit": {
    addr: CellAddress;
    value: CellValue;
  };
  search: SearchResult;
  "command-state-change": GridCommandStateChangeEvent;
  "mutation-rejected": {
    issues: MutationIssue[];
  };
  "active-sheet": {
    sheet: SheetId;
  };
  "hyperlink-activate": HyperlinkActivationEvent;
  "renderer-fallback": {
    requested: "worker";
    error: SheetwriteError;
  };
  "datasource-error": {
    request: Omit<DataSourceRequest, "signal">;
    error: SheetwriteError;
  };
  "export-error": {
    format: "xlsx";
    error: SheetwriteError;
  };
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

<p class="api-consumers-label">Public exports naming <code>GridEvents</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/grid/"><code>Grid</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-adapter/grid-adapter-event-handlers/"><code>GridAdapterEventHandlers</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-adapter/grid-controller-handlers/"><code>GridControllerHandlers</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/react/grid/"><code>Grid</code></a><span class="api-consumer-kind">@sheetwrite/react</span></li>
<li><a href="/docs/api/react/sheetwrite-grid-props/"><code>SheetwriteGridProps</code></a><span class="api-consumer-kind">@sheetwrite/react</span></li>
<li><a href="/docs/api/svelte/grid/"><code>Grid</code></a><span class="api-consumer-kind">@sheetwrite/svelte</span></li>
<li><a href="/docs/api/svelte/sheetwrite-grid-props/"><code>SheetwriteGridProps</code></a><span class="api-consumer-kind">@sheetwrite/svelte</span></li>
<li><a href="/docs/api/vue/grid/"><code>Grid</code></a><span class="api-consumer-kind">@sheetwrite/vue</span></li>
<li><a href="/docs/api/vue/sheetwrite-grid-emits/"><code>SheetwriteGridEmits</code></a><span class="api-consumer-kind">@sheetwrite/vue</span></li>
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
