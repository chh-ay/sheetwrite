---
title: "SheetwriteGrid | @sheetwrite/svelte"
description: "Advanced framework component for workbook data or datasource input."
---
<!-- api-export:@sheetwrite/svelte|.|SheetwriteGrid -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/svelte/">@sheetwrite/svelte</a><span class="api-status" data-kind="variable">variable</span></div>

Advanced framework component for workbook data or datasource input.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/svelte/src/Grid.svelte.d.ts#L7"><code>packages/svelte/src/Grid.svelte.d.ts#L7</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
function SheetwriteGrid(
  this: void,
  internals: ComponentInternals,
  props: SheetwriteGridProps<RowBridgeId>,
): {
  $on?(type: string, callback: (e: any) => void): () => void;
  $set?(props: Partial<SheetwriteGridProps<RowBridgeId>>): void;
}
```

</div>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/svelte</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>SheetwriteGrid</code></p>

<ul class="api-consumer-list">
<li>None.</li>
</ul>
</div>
