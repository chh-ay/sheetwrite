---
title: "createGridFromSnapshot | @sheetwrite/core"
description: "Mount a grid over a validated, non-dirty snapshot."
---
<!-- api-export:@sheetwrite/core|.|createGridFromSnapshot -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="function">function</span></div>

Mount a grid over a validated, non-dirty snapshot. The grid owns and disposes
the hydrated store just like one created through `createGrid`.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/persistence.ts#L56"><code>packages/core/src/persistence.ts#L56</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
function createGridFromSnapshot(
  host: HTMLElement,
  snapshot: unknown,
  options?: SnapshotGridOptions,
): Grid
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

<p class="api-consumers-label">Public exports naming <code>createGridFromSnapshot</code></p>

<ul class="api-consumer-list">
<li>None.</li>
</ul>
</div>
