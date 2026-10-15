---
title: "createAdapterGridController | @sheetwrite/core/adapter"
description: "Owns initialization, replacement, publication, and retirement for framework adapters."
---
<!-- api-export:@sheetwrite/core|./adapter|createAdapterGridController -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-adapter/">@sheetwrite/core/adapter</a><span class="api-status" data-kind="function">function</span></div>

Owns initialization, replacement, publication, and retirement for framework adapters.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/adapter.ts#L247"><code>packages/core/src/adapter.ts#L247</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
function createAdapterGridController<
  Id extends RowBridgeId = RowBridgeId,
>(
  handlers: GridAdapterEventHandlers<Id>,
  publication: GridPublicationAdapter,
): AdapterGridController<Id>
```

</div>

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

<p class="api-consumers-label">Public exports naming <code>createAdapterGridController</code></p>

<ul class="api-consumer-list">
<li>None.</li>
</ul>
</div>
