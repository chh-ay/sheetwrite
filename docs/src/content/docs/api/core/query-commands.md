---
title: "QueryCommands | @sheetwrite/core"
description: "QueryCommands interface in @sheetwrite/core: What the Data commands need from a query session."
---
<!-- api-export:@sheetwrite/core|.|QueryCommands -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

What the Data commands need from a query session. Messages are for the user.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/query-commands.ts#L10"><code>packages/core/src/query-commands.ts#L10</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>2</span>

<div class="api-member-list">

<details class="api-member" id="query-commands-define" data-pagefind-weight="1">
<summary><code>define</code> <span class="api-member-summary">Checks the plan in the engine, then saves it; returns why it was not saved, or null.</span></summary>

```ts generated
define(query: SavedQuery): string | null;
```

</details>

<details class="api-member" id="query-commands-refresh" data-pagefind-weight="1">
<summary><code>refresh</code> <span class="api-member-summary">Refreshes the given queries, or every query with an output table when ids is null.</span></summary>

```ts generated
refresh(ids: readonly string[] | null, signal: AbortSignal): Promise<string | null>;
```

<p class="api-member-doc">Refreshes the given queries, or every query with an output table when
`ids` is null. Resolves to why nothing was written, or null when it was.</p>
</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface QueryCommands {
  define(query: SavedQuery): string | null;
  refresh(
    ids: readonly string[] | null,
    signal: AbortSignal,
  ): Promise<string | null>;
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

<p class="api-consumers-label">Public exports naming <code>QueryCommands</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/register-query-commands/"><code>registerQueryCommands</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
