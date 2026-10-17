---
title: "resolveTransactionResourceLimits | @sheetwrite/core"
description: "Validate and merge transaction ceiling overrides without retaining the caller-owned object."
---
<!-- api-export:@sheetwrite/core|.|resolveTransactionResourceLimits -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="function">function</span></div>

Validate and merge transaction ceiling overrides without retaining the
caller-owned object. Every ceiling is an inclusive non-negative safe integer.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/document-protocol.ts#L67"><code>packages/core/src/document-protocol.ts#L67</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
function resolveTransactionResourceLimits(
  overrides?: Partial<TransactionResourceLimits>,
): Readonly<TransactionResourceLimits>
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

<p class="api-consumers-label">Public exports naming <code>resolveTransactionResourceLimits</code></p>

<ul class="api-consumer-list">
<li>None.</li>
</ul>
</div>
