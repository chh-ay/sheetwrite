---
title: "DEFAULT_TRANSACTION_RESOURCE_LIMITS | @sheetwrite/core"
description: "Inclusive defaults for every atomic document transaction accepted by a Store or Grid."
---
<!-- api-export:@sheetwrite/core|.|DEFAULT_TRANSACTION_RESOURCE_LIMITS -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="variable">variable</span></div>

Inclusive defaults for every atomic document transaction accepted by a
Store or Grid. The count bounds object-heavy validation and dispatch; the
exact UTF-8 JSON size bounds hostile or accidentally oversized payloads.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/document-protocol.ts#L39"><code>packages/core/src/document-protocol.ts#L39</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
const DEFAULT_TRANSACTION_RESOURCE_LIMITS: Readonly<TransactionResourceLimits>
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

<p class="api-consumers-label">Public exports naming <code>DEFAULT_TRANSACTION_RESOURCE_LIMITS</code></p>

<ul class="api-consumer-list">
<li>None.</li>
</ul>
</div>
