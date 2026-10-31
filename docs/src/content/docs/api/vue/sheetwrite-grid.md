---
title: "SheetwriteGrid | @sheetwrite/vue"
description: "SheetwriteGrid variable in @sheetwrite/vue: Advanced framework component for workbook data or datasource input."
---
<!-- api-export:@sheetwrite/vue|.|SheetwriteGrid -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/vue/">@sheetwrite/vue</a><span class="api-status" data-kind="variable">variable</span></div>

Advanced framework component for workbook data or datasource input.

## Examples

```ts compile
import { createApp, h } from "vue";
import { SheetwriteGrid } from "@sheetwrite/vue";
import type { Workbook } from "@sheetwrite/core";

function mountWorkbook(host: HTMLElement, workbook: Workbook) {
  const app = createApp({ render: () => h(SheetwriteGrid, { workbook, height: 400 }) });
  app.mount(host);
  return () => app.unmount();
}
```

## See also

- [Sheetwrite](/docs/api/vue/sheetwrite/)
- [/docs/frameworks/vue/](/docs/frameworks/vue/)

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/vue/src/index.ts#L385"><code>packages/vue/src/index.ts#L385</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
const SheetwriteGrid: SheetwriteComponentConstructor<
  SheetwriteGridProps<RowBridgeId>,
  SheetwriteGridEmits<RowBridgeId>,
  SheetwriteGridExpose
>
```

</div>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/vue</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>SheetwriteGrid</code></p>

<ul class="api-consumer-list">
<li>None.</li>
</ul>
</div>
