---
title: "Sheetwrite | @sheetwrite/vue"
description: "Sheetwrite variable in @sheetwrite/vue: Convenience component for local object rows with live option updates."
---
<!-- api-export:@sheetwrite/vue|.|Sheetwrite -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/vue/">@sheetwrite/vue</a><span class="api-status" data-kind="variable">variable</span></div>

Convenience component for local object rows with live option updates.

## Examples

```ts compile
import { createApp, h } from "vue";
import { Sheetwrite } from "@sheetwrite/vue";

const app = createApp({ render: () => h(Sheetwrite, {
  columns: [{ key: "amount", title: "Amount", type: "number" }],
  defaultRows: [{ amount: 12 }, { amount: 18 }],
  height: 400,
}) });
app.mount(document.body);
// Call app.unmount() before removing the host view.
```

## See also

- [SheetwriteGrid](/docs/api/vue/sheetwrite-grid/)
- [/docs/frameworks/vue/](/docs/frameworks/vue/)

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/vue/src/index.ts#L491"><code>packages/vue/src/index.ts#L491</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
const Sheetwrite: SheetwriteComponentConstructor<
  SheetwriteProps<Record<string, CellScalar>, RowBridgeId>,
  SheetwriteGridEmits<RowBridgeId>,
  object
>
```

</div>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/vue</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>Sheetwrite</code></p>

<ul class="api-consumer-list">
<li>None.</li>
</ul>
</div>
