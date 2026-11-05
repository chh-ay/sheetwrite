---
title: "buildXlsxModel | @sheetwrite/xlsx"
description: "buildXlsxModel function in @sheetwrite/xlsx: Materialize the active-sheet table model."
---
<!-- api-export:@sheetwrite/xlsx|.|buildXlsxModel -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/xlsx/">@sheetwrite/xlsx</a><span class="api-status" data-kind="function">function</span></div>

Materialize the active-sheet table model. The bounded writer uses tableSource instead.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/xlsx/src/table-export.ts#L34"><code>packages/xlsx/src/table-export.ts#L34</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
function buildXlsxModel(
  workbook: Workbook,
  store: Store,
  options?: XlsxWorkbookOptions,
): XlsxModel | null
```

</div>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/xlsx</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/queries</code><span class="api-consumer-kind">dev</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>buildXlsxModel</code></p>

<ul class="api-consumer-list">
<li>None.</li>
</ul>
</div>
