---
title: "TransactionResourceValidationResult | @sheetwrite/core"
description: "Successful byte/count inspection or one structured transaction rejection."
---
<!-- api-export:@sheetwrite/core|.|TransactionResourceValidationResult -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

Successful byte/count inspection or one structured transaction rejection.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/document-protocol.ts#L47"><code>packages/core/src/document-protocol.ts#L47</code></a></dd></div>
</dl>

## Variants <span class="api-count" data-pagefind-ignore>2</span>

<div class="api-variant-list" data-pagefind-ignore>
<div class="api-variant">

```ts generated
{ ok: true; operationCount: number; encodedBytes: number }
```

</div>
<div class="api-variant">

```ts generated
{
  ok: false;
  issue: Extract<
    MutationIssue,
    { kind: "resource-limit" } | { kind: "invalid-operation" }
  >;
}
```

</div>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export type TransactionResourceValidationResult =
  | {
      ok: true;
      operationCount: number;
      encodedBytes: number;
    }
  | {
      ok: false;
      issue: Extract<
        MutationIssue,
        | {
            kind: "resource-limit";
          }
        | {
            kind: "invalid-operation";
          }
      >;
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

<p class="api-consumers-label">Public exports naming <code>TransactionResourceValidationResult</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/validate-transaction-resources/"><code>validateTransactionResources</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
