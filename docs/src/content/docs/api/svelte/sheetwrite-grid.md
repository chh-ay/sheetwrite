---
title: "SheetwriteGrid | @sheetwrite/svelte"
description: "SheetwriteGrid variable in @sheetwrite/svelte: Advanced component for an existing workbook or datasource."
---
<!-- api-export:@sheetwrite/svelte|.|SheetwriteGrid -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/svelte/">@sheetwrite/svelte</a><span class="api-status" data-kind="variable">variable</span></div>

Advanced component for an existing workbook or datasource.
Advanced framework component for workbook data or datasource input.

## Examples

```ts compile
import { mount, unmount } from "svelte";
import { SheetwriteGrid } from "@sheetwrite/svelte";
import type { Workbook } from "@sheetwrite/core";

function mountWorkbook(target: HTMLElement, workbook: Workbook) {
  const view = mount(SheetwriteGrid, { target, props: { workbook, height: 400 } });
  return () => unmount(view);
}
```

## See also

- [Sheetwrite](/docs/api/svelte/sheetwrite/)
- [/docs/frameworks/svelte/](/docs/frameworks/svelte/)

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/svelte/src/Grid.svelte.d.ts#L7"><code>packages/svelte/src/Grid.svelte.d.ts#L7</code></a></dd></div>
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
