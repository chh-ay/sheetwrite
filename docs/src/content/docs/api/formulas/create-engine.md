---
title: "createEngine | @sheetwrite/formulas"
description: "createEngine function in @sheetwrite/formulas: Initialize a fresh engine; a compiled module can be reused without retaining its memory."
---
<!-- api-export:@sheetwrite/formulas|.|createEngine -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/formulas/">@sheetwrite/formulas</a><span class="api-status" data-kind="function">function</span></div>

Initialize a fresh engine; a compiled module can be reused without retaining its memory.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/formulas/loader.d.ts#L50"><code>packages/formulas/loader.d.ts#L50</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
function createEngine(
  source?: Parameters<typeof load>[0],
): Promise<EngineInstance>
```

</div>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/formulas</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/bench</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>createEngine</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/sheetwrite-engine/"><code>SheetwriteEngine</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
