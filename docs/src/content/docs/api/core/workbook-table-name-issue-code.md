---
title: "WorkbookTableNameIssueCode | @sheetwrite/core"
description: "Stable reason code returned when a workbook table name is rejected."
---
<!-- api-export:@sheetwrite/core|.|WorkbookTableNameIssueCode -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

Stable reason code returned when a workbook table name is rejected.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/workbook-table.ts#L32"><code>packages/core/src/workbook-table.ts#L32</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
export type WorkbookTableNameIssueCode =
  | "empty"
  | "too-long"
  | "invalid-characters"
  | "cell-reference"
  | "duplicate";
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

<p class="api-consumers-label">Public exports naming <code>WorkbookTableNameIssueCode</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/workbook-table-name-validation-result/"><code>WorkbookTableNameValidationResult</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
