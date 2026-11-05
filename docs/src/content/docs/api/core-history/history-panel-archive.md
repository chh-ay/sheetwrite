---
title: "HistoryPanelArchive | @sheetwrite/core/history"
description: "HistoryPanelArchive interface in @sheetwrite/core/history: The archive calls the version history panel makes; HistoryArchive provides them."
---
<!-- api-export:@sheetwrite/core|./history|HistoryPanelArchive -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-history/">@sheetwrite/core/history</a><span class="api-status" data-kind="interface">interface</span></div>

The archive calls the version history panel makes; `HistoryArchive` provides them.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/version-history/panel-contract.ts#L10"><code>packages/core/src/version-history/panel-contract.ts#L10</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>5</span>

<div class="api-member-list">

<details class="api-member" id="history-panel-archive-save-version" data-pagefind-weight="1">
<summary><code>saveVersion</code></summary>

```ts generated
saveVersion( name: string, authorId: string, time: number, signal?: AbortSignal, ): Promise<HistoryVersion>;
```

</details>

<details class="api-member" id="history-panel-archive-list-versions" data-pagefind-weight="1">
<summary><code>listVersions</code></summary>

```ts generated
listVersions(options?: { maxEntries?: number; cursor?: string; signal?: AbortSignal; }): Promise<HistoryListPage>;
```

</details>

<details class="api-member" id="history-panel-archive-read-version" data-pagefind-weight="1">
<summary><code>readVersion</code></summary>

```ts generated
readVersion(id: string, signal?: AbortSignal): Promise<WorkbookSnapshot>;
```

</details>

<details class="api-member" id="history-panel-archive-diff-versions" data-pagefind-weight="1">
<summary><code>diffVersions</code></summary>

```ts generated
diffVersions(request: HistoryDiffRequest): Promise<HistoryDiffPage>;
```

</details>

<details class="api-member" id="history-panel-archive-restore-version" data-pagefind-weight="1">
<summary><code>restoreVersion</code></summary>

```ts generated
restoreVersion( grid: Grid, id: string, scope: HistoryRestoreScope, options?: HistoryRestoreOptions, ): Promise<ApplyTransactionResult>;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface HistoryPanelArchive {
  saveVersion(
    name: string,
    authorId: string,
    time: number,
    signal?: AbortSignal,
  ): Promise<HistoryVersion>;
  listVersions(options?: {
    maxEntries?: number;
    cursor?: string;
    signal?: AbortSignal;
  }): Promise<HistoryListPage>;
  readVersion(id: string, signal?: AbortSignal): Promise<WorkbookSnapshot>;
  diffVersions(request: HistoryDiffRequest): Promise<HistoryDiffPage>;
  restoreVersion(
    grid: Grid,
    id: string,
    scope: HistoryRestoreScope,
    options?: HistoryRestoreOptions,
  ): Promise<ApplyTransactionResult>;
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

<p class="api-consumers-label">Public exports naming <code>HistoryPanelArchive</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core-history/history-commands-options/"><code>HistoryCommandsOptions</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
