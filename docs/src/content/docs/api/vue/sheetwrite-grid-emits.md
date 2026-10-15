---
title: "SheetwriteGridEmits | @sheetwrite/vue"
description: "Event payloads emitted by the Vue components, keyed by template event name."
---
<!-- api-export:@sheetwrite/vue|.|SheetwriteGridEmits -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/vue/">@sheetwrite/vue</a><span class="api-status" data-kind="interface">interface</span></div>

Event payloads emitted by the Vue components, keyed by template event name.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/vue/src/index.ts#L121"><code>packages/vue/src/index.ts#L121</code></a></dd></div>
</dl>

<nav class="api-member-index" aria-label="Member index" data-pagefind-ignore>
<a href="#sheetwrite-grid-emits-row-delta"><code>row-delta</code></a>
<a href="#sheetwrite-grid-emits-grid-change"><code>grid-change</code></a>
<a href="#sheetwrite-grid-emits-selection-change"><code>selection-change</code></a>
<a href="#sheetwrite-grid-emits-viewport-change"><code>viewport-change</code></a>
<a href="#sheetwrite-grid-emits-edit-begin"><code>edit-begin</code></a>
<a href="#sheetwrite-grid-emits-edit-commit"><code>edit-commit</code></a>
<a href="#sheetwrite-grid-emits-search"><code>search</code></a>
<a href="#sheetwrite-grid-emits-command-state-change"><code>command-state-change</code></a>
<a href="#sheetwrite-grid-emits-active-sheet-change"><code>active-sheet-change</code></a>
<a href="#sheetwrite-grid-emits-mutation-rejected"><code>mutation-rejected</code></a>
<a href="#sheetwrite-grid-emits-renderer-fallback"><code>renderer-fallback</code></a>
<a href="#sheetwrite-grid-emits-datasource-error"><code>datasource-error</code></a>
<a href="#sheetwrite-grid-emits-export-error"><code>export-error</code></a>
<a href="#sheetwrite-grid-emits-ready"><code>ready</code></a>
<a href="#sheetwrite-grid-emits-initialization-error"><code>initialization-error</code></a>
</nav>

## Members <span class="api-count" data-pagefind-ignore>15</span>

<div class="api-member-list">

<details class="api-member" id="sheetwrite-grid-emits-row-delta" data-pagefind-weight="1">
<summary><code>row-delta</code> <span class="api-member-summary">Projected host-row changes.</span></summary>

```ts generated
"row-delta": Parameters<RowBridgeHandler<Id>>[0];
```

</details>

<details class="api-member" id="sheetwrite-grid-emits-grid-change" data-pagefind-weight="1">
<summary><code>grid-change</code> <span class="api-member-summary">Committed Grid change, including its applied transaction.</span></summary>

```ts generated
"grid-change": ChangeEvent;
```

</details>

<details class="api-member" id="sheetwrite-grid-emits-selection-change" data-pagefind-weight="1">
<summary><code>selection-change</code> <span class="api-member-summary">Current selection, or null after it is cleared.</span></summary>

```ts generated
"selection-change": Selection | null;
```

</details>

<details class="api-member" id="sheetwrite-grid-emits-viewport-change" data-pagefind-weight="1">
<summary><code>viewport-change</code> <span class="api-member-summary">Visible row bounds and vertical scroll offset after scrolling.</span></summary>

```ts generated
"viewport-change": GridEvents["scroll"];
```

</details>

<details class="api-member" id="sheetwrite-grid-emits-edit-begin" data-pagefind-weight="1">
<summary><code>edit-begin</code> <span class="api-member-summary">Cell editing began.</span></summary>

```ts generated
"edit-begin": GridEvents["edit-begin"];
```

</details>

<details class="api-member" id="sheetwrite-grid-emits-edit-commit" data-pagefind-weight="1">
<summary><code>edit-commit</code> <span class="api-member-summary">An edit committed its parsed cell value.</span></summary>

```ts generated
"edit-commit": GridEvents["edit-commit"];
```

</details>

<details class="api-member" id="sheetwrite-grid-emits-search" data-pagefind-weight="1">
<summary><code>search</code> <span class="api-member-summary">Refreshed search matches and active-match index.</span></summary>

```ts generated
search: GridEvents["search"];
```

</details>

<details class="api-member" id="sheetwrite-grid-emits-command-state-change" data-pagefind-weight="1">
<summary><code>command-state-change</code> <span class="api-member-summary">Command availability or formatting activity changed.</span></summary>

```ts generated
"command-state-change": GridEvents["command-state-change"];
```

</details>

<details class="api-member" id="sheetwrite-grid-emits-active-sheet-change" data-pagefind-weight="1">
<summary><code>active-sheet-change</code> <span class="api-member-summary">The visible sheet changed.</span></summary>

```ts generated
"active-sheet-change": GridEvents["active-sheet"];
```

</details>

<details class="api-member" id="sheetwrite-grid-emits-mutation-rejected" data-pagefind-weight="1">
<summary><code>mutation-rejected</code> <span class="api-member-summary">A Grid mutation was rejected.</span></summary>

```ts generated
"mutation-rejected": GridEvents["mutation-rejected"];
```

</details>

<details class="api-member" id="sheetwrite-grid-emits-renderer-fallback" data-pagefind-weight="1">
<summary><code>renderer-fallback</code> <span class="api-member-summary">Worker rendering fell back to the main-thread canvas renderer.</span></summary>

```ts generated
"renderer-fallback": GridEvents["renderer-fallback"];
```

</details>

<details class="api-member" id="sheetwrite-grid-emits-datasource-error" data-pagefind-weight="1">
<summary><code>datasource-error</code> <span class="api-member-summary">A datasource request failed.</span></summary>

```ts generated
"datasource-error": GridEvents["datasource-error"];
```

</details>

<details class="api-member" id="sheetwrite-grid-emits-export-error" data-pagefind-weight="1">
<summary><code>export-error</code> <span class="api-member-summary">A built-in XLSX export action failed.</span></summary>

```ts generated
"export-error": GridEvents["export-error"];
```

</details>

<details class="api-member" id="sheetwrite-grid-emits-ready" data-pagefind-weight="1">
<summary><code>ready</code> <span class="api-member-summary">The adapter published a ready Grid generation.</span></summary>

```ts generated
ready: GridReadyEvent;
```

</details>

<details class="api-member" id="sheetwrite-grid-emits-initialization-error" data-pagefind-weight="1">
<summary><code>initialization-error</code> <span class="api-member-summary">WASM initialization failed while the component stayed mounted.</span></summary>

```ts generated
"initialization-error": SheetwriteError;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface SheetwriteGridEmits<Id extends RowBridgeId = RowBridgeId> {
  "row-delta": Parameters<RowBridgeHandler<Id>>[0];
  "grid-change": ChangeEvent;
  "selection-change": Selection | null;
  "viewport-change": GridEvents["scroll"];
  "edit-begin": GridEvents["edit-begin"];
  "edit-commit": GridEvents["edit-commit"];
  search: GridEvents["search"];
  "command-state-change": GridEvents["command-state-change"];
  "active-sheet-change": GridEvents["active-sheet"];
  "mutation-rejected": GridEvents["mutation-rejected"];
  "renderer-fallback": GridEvents["renderer-fallback"];
  "datasource-error": GridEvents["datasource-error"];
  "export-error": GridEvents["export-error"];
  ready: GridReadyEvent;
  "initialization-error": SheetwriteError;
}
```

</details>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/vue</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>SheetwriteGridEmits</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/vue/sheetwrite/"><code>Sheetwrite</code></a><span class="api-consumer-kind">@sheetwrite/vue</span></li>
<li><a href="/docs/api/vue/sheetwrite-grid/"><code>SheetwriteGrid</code></a><span class="api-consumer-kind">@sheetwrite/vue</span></li>
</ul>
</div>
