---
title: "GridEvents | @sheetwrite/core"
description: "Payload map for events emitted by a Grid."
---
<!-- api-export:@sheetwrite/core|.|GridEvents -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Payload map for events emitted by a Grid.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/types/grid.ts#L444"><code>packages/core/src/types/grid.ts#L444</code></a></dd></div>
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
<a href="#grid-events-theme-change"><code>theme-change</code></a>
<a href="#grid-events-renderer-fallback"><code>renderer-fallback</code></a>
<a href="#grid-events-datasource-error"><code>datasource-error</code></a>
<a href="#grid-events-export-error"><code>export-error</code></a>
</nav>

## Members <span class="api-count" data-pagefind-ignore>14</span>

<div class="api-member-list">

<details class="api-member" id="grid-events-change" data-pagefind-weight="1">
<summary><code>change</code></summary>

```ts generated
change: ChangeEvent;
```

</details>

<details class="api-member" id="grid-events-selection" data-pagefind-weight="1">
<summary><code>selection</code></summary>

```ts generated
selection: { selection: Selection | null };
```

</details>

<details class="api-member" id="grid-events-scroll" data-pagefind-weight="1">
<summary><code>scroll</code></summary>

```ts generated
scroll: { scrollTop: number; firstRow: number; lastRow: number; scrollLeft: number; firstVisibleColumn: number | null; lastVisibleColumn: number | null; };
```

</details>

<details class="api-member" id="grid-events-edit-begin" data-pagefind-weight="1">
<summary><code>edit-begin</code></summary>

```ts generated
"edit-begin": { addr: CellAddress };
```

</details>

<details class="api-member" id="grid-events-edit-commit" data-pagefind-weight="1">
<summary><code>edit-commit</code></summary>

```ts generated
"edit-commit": { addr: CellAddress; value: CellValue };
```

</details>

<details class="api-member" id="grid-events-search" data-pagefind-weight="1">
<summary><code>search</code></summary>

```ts generated
search: SearchResult;
```

</details>

<details class="api-member" id="grid-events-command-state-change" data-pagefind-weight="1">
<summary><code>command-state-change</code> <span class="api-member-summary">Command availability or formatting activity changed.</span></summary>

```ts generated
"command-state-change": GridCommandStateChangeEvent;
```

</details>

<details class="api-member" id="grid-events-mutation-rejected" data-pagefind-weight="1">
<summary><code>mutation-rejected</code></summary>

```ts generated
"mutation-rejected": { issues: MutationIssue[] };
```

</details>

<details class="api-member" id="grid-events-active-sheet" data-pagefind-weight="1">
<summary><code>active-sheet</code> <span class="api-member-summary">Emitted after the visible sheet changes (direct call or cross-sheet scroll).</span></summary>

```ts generated
"active-sheet": { sheet: SheetId };
```

</details>

<details class="api-member" id="grid-events-hyperlink-activate" data-pagefind-weight="1">
<summary><code>hyperlink-activate</code></summary>

```ts generated
"hyperlink-activate": HyperlinkActivationEvent;
```

</details>

<details class="api-member" id="grid-events-theme-change" data-pagefind-weight="1">
<summary><code>theme-change</code> <span class="api-member-summary">Emitted after setTheme or replaceTheme changes the base theme.</span></summary>

```ts generated
"theme-change": { theme: Theme };
```

<p class="api-member-doc">Emitted after `setTheme` or `replaceTheme` changes the base theme. Holds a copy.</p>
</details>

<details class="api-member" id="grid-events-renderer-fallback" data-pagefind-weight="1">
<summary><code>renderer-fallback</code> <span class="api-member-summary">Emitted once when the worker renderer could not be constructed and the grid fell back to the main-thread canvas renderer.</span></summary>

```ts generated
"renderer-fallback": { requested: "worker"; error: SheetwriteError };
```

</details>

<details class="api-member" id="grid-events-datasource-error" data-pagefind-weight="1">
<summary><code>datasource-error</code></summary>

```ts generated
"datasource-error": { request: Omit<DataSourceRequest, "signal">; error: SheetwriteError; };
```

</details>

<details class="api-member" id="grid-events-export-error" data-pagefind-weight="1">
<summary><code>export-error</code> <span class="api-member-summary">Built-in toolbar/context-menu export failed after its action was dispatched.</span></summary>

```ts generated
"export-error": { format: "xlsx"; error: SheetwriteError };
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

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
  "theme-change": {
    theme: Theme;
  };
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
