---
title: "HistoryErrorCode | @sheetwrite/core/history"
description: "HistoryErrorCode type in @sheetwrite/core/history: Stable failure category for history validation, storage, and replay."
---
<!-- api-export:@sheetwrite/core|./history|HistoryErrorCode -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-history/">@sheetwrite/core/history</a><span class="api-status" data-kind="type">type</span></div>

Stable failure category for history validation, storage, and replay.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/version-history/codec.ts#L49"><code>packages/core/src/version-history/codec.ts#L49</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
export type HistoryErrorCode =
  | "invalid-history"
  | "invalid-scope"
  | "conflict"
  | "capacity"
  | "not-found"
  | "integrity"
  | "unavailable"
  | "blocked"
  | "transaction";
```

</div>

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

<p class="api-consumers-label">Public exports naming <code>HistoryErrorCode</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core-history/history-error/"><code>HistoryError</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
