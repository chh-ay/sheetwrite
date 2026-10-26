---
title: "MutationIssue | @sheetwrite/core"
description: "Structured warning or rejection produced while applying an operation."
---
<!-- api-export:@sheetwrite/core|.|MutationIssue -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

Structured warning or rejection produced while applying an operation.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/types/document.ts#L247"><code>packages/core/src/types/document.ts#L247</code></a></dd></div>
</dl>

## Variants <span class="api-count" data-pagefind-ignore>5</span>

<div class="api-variant-list" data-pagefind-ignore>
<div class="api-variant">

```ts generated
{
  kind: "validation";
  severity: "error" | "warning";
  ruleId: string;
  addr: CellAddress;
  value: CellValue;
  message: string;
  operationIndex: number;
}
```

</div>
<div class="api-variant">

```ts generated
{
  kind: "protection";
  severity: "error";
  protectedRangeId: string;
  range: Range;
  operationIndex: number;
  message: string;
}
```

</div>
<div class="api-variant">

```ts generated
{
  kind: "invalid-operation";
  severity: "error";
  operationIndex: number;
  message: string;
}
```

</div>
<div class="api-variant">

```ts generated
{
  kind: "resource-limit";
  severity: "error";
  resource:
    | "operations"
    | "encoded-bytes"
    | "batch-versions"
    | "pending-commits"
    | "pending-operations"
    | "pending-encoded-bytes"
    | "paged-dirty-cells"
    | "paged-reference-simulation";
  actual: number;
  max: number;
  message: string;
}
```

</div>
<div class="api-variant">

```ts generated
{
  kind: "sheet-lifecycle";
  severity: "error";
  code: SheetLifecycleIssueCode;
  sheet?: SheetId;
  operationIndex: number;
  message: string;
}
```

</div>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export type MutationIssue =
  | {
      kind: "validation";
      severity: "error" | "warning";
      ruleId: string;
      addr: CellAddress;
      value: CellValue;
      message: string;
      operationIndex: number;
    }
  | {
      kind: "protection";
      severity: "error";
      protectedRangeId: string;
      range: Range;
      operationIndex: number;
      message: string;
    }
  | {
      kind: "invalid-operation";
      severity: "error";
      operationIndex: number;
      message: string;
    }
  | {
      kind: "resource-limit";
      severity: "error";
      resource:
        | "operations"
        | "encoded-bytes"
        | "batch-versions"
        | "pending-commits"
        | "pending-operations"
        | "pending-encoded-bytes"
        | "paged-dirty-cells"
        | "paged-reference-simulation";
      actual: number;
      max: number;
      message: string;
    }
  | {
      kind: "sheet-lifecycle";
      severity: "error";
      code: SheetLifecycleIssueCode;
      sheet?: SheetId;
      operationIndex: number;
      message: string;
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

<p class="api-consumers-label">Public exports naming <code>MutationIssue</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/apply-transaction-result/"><code>ApplyTransactionResult</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/grid-events/"><code>GridEvents</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/sync-pending-capacity-error/"><code>SyncPendingCapacityError</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/transaction-resource-validation-result/"><code>TransactionResourceValidationResult</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
