---
title: "DocumentRebaseResult | @sheetwrite/core"
description: "Successful rebased operations or a conservative rebase conflict."
---
<!-- api-export:@sheetwrite/core|.|DocumentRebaseResult -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

Successful rebased operations or a conservative rebase conflict.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/rebase.ts#L25"><code>packages/core/src/rebase.ts#L25</code></a></dd></div>
</dl>

## Variants <span class="api-count" data-pagefind-ignore>2</span>

<div class="api-variant-list" data-pagefind-ignore>
<div class="api-variant">

```ts generated
{ status: "rebased"; operations: readonly DocumentOp[] }
```

</div>
<div class="api-variant">

```ts generated
{ status: "conflict"; conflict: RebaseConflict }
```

</div>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export type DocumentRebaseResult =
  | {
      status: "rebased";
      operations: readonly DocumentOp[];
    }
  | {
      status: "conflict";
      conflict: RebaseConflict;
    };
```

</details>

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

<p class="api-consumers-label">Public exports naming <code>DocumentRebaseResult</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/rebase-document-operations/"><code>rebaseDocumentOperations</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
