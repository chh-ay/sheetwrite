---
title: "Sheetwrite | @sheetwrite/react"
description: "Convenience component for local object rows."
---
<!-- api-export:@sheetwrite/react|.|Sheetwrite -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/react/">@sheetwrite/react</a><span class="api-status" data-kind="variable">variable</span></div>

Convenience component for local object rows. It derives a single-sheet workbook from
`columns`, `defaultRows`, and `sheetName`, initializes Sheetwrite, and owns the `Grid`
through prop-driven resets and unmount cleanup. Pass a `ref` to access the live `Grid`;
use `SheetwriteGrid` when the host already owns a workbook or datasource.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/react/src/index.tsx#L446"><code>packages/react/src/index.tsx#L446</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
function Sheetwrite<
  Row extends Record<string, CellScalar>,
  Id extends RowBridgeId = RowBridgeId,
>(
  props: SheetwriteProps<Row, Id> & {
    ref?: ForwardedRef<Grid>;
  },
): ReactElement
```

</div>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/react</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>Sheetwrite</code></p>

<ul class="api-consumer-list">
<li>None.</li>
</ul>
</div>
