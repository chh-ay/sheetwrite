---
title: "HistoryCommandsOptions | @sheetwrite/core/history"
description: "HistoryCommandsOptions interface in @sheetwrite/core/history: Host identity and persistence used by the optional history panel."
---
<!-- api-export:@sheetwrite/core|./history|HistoryCommandsOptions -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-history/">@sheetwrite/core/history</a><span class="api-status" data-kind="interface">interface</span></div>

Host identity and persistence used by the optional history panel.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/version-history/panel-contract.ts#L33"><code>packages/core/src/version-history/panel-contract.ts#L33</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>4</span>

<div class="api-member-list">

<details class="api-member" id="history-commands-options-archive" data-pagefind-weight="1">
<summary><code>archive</code> <span class="api-member-summary">Archive of the committed document shown by the grid.</span></summary>

```ts generated
archive: HistoryPanelArchive;
```

</details>

<details class="api-member" id="history-commands-options-author-id" data-pagefind-weight="1">
<summary><code>authorId</code> <span class="api-member-summary">Authenticated person saving named versions.</span></summary>

```ts generated
authorId: string;
```

</details>

<details class="api-member" id="history-commands-options-sync" data-pagefind-weight="1">
<summary><code>sync</code> <span class="api-member-summary">The grid's coordinator, resolved when a command runs.</span></summary>

```ts generated
sync?: (grid: Grid) => SyncCoordinator;
```

<p class="api-member-doc">The grid's coordinator, resolved when a command runs. Omit for a local archive.</p>
</details>

<details class="api-member" id="history-commands-options-author-name" data-pagefind-weight="1">
<summary><code>authorName</code> <span class="api-member-summary">Display name for an authenticated author ID; the ID is shown when omitted.</span></summary>

```ts generated
authorName?: (authorId: string) => string;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface HistoryCommandsOptions {
  archive: HistoryPanelArchive;
  authorId: string;
  sync?: (grid: Grid) => SyncCoordinator;
  authorName?: (authorId: string) => string;
}
```

</details>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/core</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/bench</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/charts</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/queries</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/react</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/svelte</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/vue</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/xlsx</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>HistoryCommandsOptions</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core-history/create-history-commands/"><code>createHistoryCommands</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
