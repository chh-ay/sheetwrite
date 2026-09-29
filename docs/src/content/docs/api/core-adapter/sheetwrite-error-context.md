---
title: "SheetwriteErrorContext | @sheetwrite/core/adapter"
description: "Stable, serialization-safe diagnostic context."
---
<!-- api-export:@sheetwrite/core|./adapter|SheetwriteErrorContext -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-adapter/">@sheetwrite/core/adapter</a><span class="api-status" data-kind="type">type</span></div>

Stable, serialization-safe diagnostic context.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/errors.ts#L94"><code>packages/core/src/errors.ts#L94</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
export type SheetwriteErrorContext = Readonly<
  Record<string, SheetwriteErrorContextValue>
>;
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

<p class="api-consumers-label">Public exports naming <code>SheetwriteErrorContext</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/sheetwrite-error-envelope/"><code>SheetwriteErrorEnvelope</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/sheetwrite-error-options/"><code>SheetwriteErrorOptions</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-adapter/sheetwrite-error-envelope/"><code>SheetwriteErrorEnvelope</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
