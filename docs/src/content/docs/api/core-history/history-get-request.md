---
title: "HistoryGetRequest | @sheetwrite/core/history"
description: "HistoryGetRequest type in @sheetwrite/core/history: Fetch metadata or a bounded immutable payload; leased reads renew their lease."
---
<!-- api-export:@sheetwrite/core|./history|HistoryGetRequest -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-history/">@sheetwrite/core/history</a><span class="api-status" data-kind="type">type</span></div>

Fetch metadata or a bounded immutable payload; leased reads renew their lease.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/version-history/types.ts#L128"><code>packages/core/src/version-history/types.ts#L128</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
export type HistoryGetRequest = HistoryStorageRequest &
  (
    | {
        kind: "manifest";
      }
    | {
        kind: "version";
        id: string;
      }
    | {
        kind: "record";
        id: string;
        maxBytes: number;
        pin?: string;
      }
  );
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

<p class="api-consumers-label">Public exports naming <code>HistoryGetRequest</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core-history/history-storage-adapter/"><code>HistoryStorageAdapter</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
