---
title: "Sheetwrite | @sheetwrite/svelte"
description: "Sheetwrite variable in @sheetwrite/svelte: Convenience component for local object rows."
---
<!-- api-export:@sheetwrite/svelte|.|Sheetwrite -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/svelte/">@sheetwrite/svelte</a><span class="api-status" data-kind="variable">variable</span></div>

Convenience component for local object rows. Bind `grid` to access the live `Grid`.
Owns a sheet derived from `columns` and `defaultRows`. Bind `grid` for imperative access; it clears on reset or unmount.

## Examples

```ts compile
import { mount, unmount } from "svelte";
import { Sheetwrite } from "@sheetwrite/svelte";

const view = mount(Sheetwrite, { target: document.body, props: {
  columns: [{ key: "amount", title: "Amount", type: "number" }],
  defaultRows: [{ amount: 12 }, { amount: 18 }],
  height: 400,
} });
// Call when the host view is removed.
await unmount(view);
```

## See also

- [SheetwriteGrid](/docs/api/svelte/sheetwrite-grid/)
- [/docs/frameworks/svelte/](/docs/frameworks/svelte/)

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/svelte/src/Sheetwrite.svelte.d.ts#L7"><code>packages/svelte/src/Sheetwrite.svelte.d.ts#L7</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
function Sheetwrite(
  this: void,
  internals: ComponentInternals,
  props: SheetwriteProps<Record<string, CellScalar>>,
): {
  $on?(type: string, callback: (e: any) => void): () => void;
  $set?(props: Partial<SheetwriteProps<Record<string, CellScalar>>>): void;
}
```

</div>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/svelte</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>Sheetwrite</code></p>

<ul class="api-consumer-list">
<li>None.</li>
</ul>
</div>
