---
title: "PersistenceErrorCode | @sheetwrite/core"
description: "Stable category for a persistence failure."
---
<!-- api-export:@sheetwrite/core|.|PersistenceErrorCode -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

Stable category for a persistence failure.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/persistence.ts#L42"><code>packages/core/src/persistence.ts#L42</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
export type PersistenceErrorCode =
  | "aborted"
  | "invalid-snapshot"
  | "resource-limit"
  | "not-found"
  | "commit-rejected";
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

<p class="api-consumers-label">Public exports naming <code>PersistenceErrorCode</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/persistence-error/"><code>PersistenceError</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
