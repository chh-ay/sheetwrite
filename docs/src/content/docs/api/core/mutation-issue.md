---
title: "MutationIssue | @sheetwrite/core"
description: "Structured warning or rejection produced while applying an operation."
---
<!-- api-export:@sheetwrite/core|.|MutationIssue -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

Structured warning or rejection produced while applying an operation.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/document.ts#L247</code></dd></div>
</dl>

## Variants <span class="api-count" data-pagefind-ignore>5</span>

<div class="api-variant-list" data-pagefind-ignore>
<div class="api-variant">

<button class="api-copy" type="button" data-copy-code="{&#10;  kind: &quot;validation&quot;;&#10;  severity: &quot;error&quot; | &quot;warning&quot;;&#10;  ruleId: string;&#10;  addr: CellAddress;&#10;  value: CellValue;&#10;  message: string;&#10;  operationIndex: number;&#10;}" data-pagefind-ignore>Copy</button>

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

<button class="api-copy" type="button" data-copy-code="{&#10;  kind: &quot;protection&quot;;&#10;  severity: &quot;error&quot;;&#10;  protectedRangeId: string;&#10;  range: Range;&#10;  operationIndex: number;&#10;  message: string;&#10;}" data-pagefind-ignore>Copy</button>

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

<button class="api-copy" type="button" data-copy-code="{&#10;  kind: &quot;invalid-operation&quot;;&#10;  severity: &quot;error&quot;;&#10;  operationIndex: number;&#10;  message: string;&#10;}" data-pagefind-ignore>Copy</button>

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

<button class="api-copy" type="button" data-copy-code="{&#10;  kind: &quot;resource-limit&quot;;&#10;  severity: &quot;error&quot;;&#10;  resource:&#10;    | &quot;operations&quot;&#10;    | &quot;encoded-bytes&quot;&#10;    | &quot;pending-commits&quot;&#10;    | &quot;pending-operations&quot;&#10;    | &quot;pending-encoded-bytes&quot;&#10;    | &quot;paged-dirty-cells&quot;&#10;    | &quot;paged-reference-simulation&quot;;&#10;  actual: number;&#10;  max: number;&#10;  message: string;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
{
  kind: "resource-limit";
  severity: "error";
  resource:
    | "operations"
    | "encoded-bytes"
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

<button class="api-copy" type="button" data-copy-code="{&#10;  kind: &quot;sheet-lifecycle&quot;;&#10;  severity: &quot;error&quot;;&#10;  code: SheetLifecycleIssueCode;&#10;  sheet?: SheetId;&#10;  operationIndex: number;&#10;  message: string;&#10;}" data-pagefind-ignore>Copy</button>

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

<button class="api-copy" type="button" data-copy-code="export type MutationIssue =&#10;  | {&#10;      kind: &quot;validation&quot;;&#10;      severity: &quot;error&quot; | &quot;warning&quot;;&#10;      ruleId: string;&#10;      addr: CellAddress;&#10;      value: CellValue;&#10;      message: string;&#10;      operationIndex: number;&#10;    }&#10;  | {&#10;      kind: &quot;protection&quot;;&#10;      severity: &quot;error&quot;;&#10;      protectedRangeId: string;&#10;      range: Range;&#10;      operationIndex: number;&#10;      message: string;&#10;    }&#10;  | {&#10;      kind: &quot;invalid-operation&quot;;&#10;      severity: &quot;error&quot;;&#10;      operationIndex: number;&#10;      message: string;&#10;    }&#10;  | {&#10;      kind: &quot;resource-limit&quot;;&#10;      severity: &quot;error&quot;;&#10;      resource:&#10;        | &quot;operations&quot;&#10;        | &quot;encoded-bytes&quot;&#10;        | &quot;pending-commits&quot;&#10;        | &quot;pending-operations&quot;&#10;        | &quot;pending-encoded-bytes&quot;&#10;        | &quot;paged-dirty-cells&quot;&#10;        | &quot;paged-reference-simulation&quot;;&#10;      actual: number;&#10;      max: number;&#10;      message: string;&#10;    }&#10;  | {&#10;      kind: &quot;sheet-lifecycle&quot;;&#10;      severity: &quot;error&quot;;&#10;      code: SheetLifecycleIssueCode;&#10;      sheet?: SheetId;&#10;      operationIndex: number;&#10;      message: string;&#10;    };" data-pagefind-ignore>Copy</button>

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

<script>
(() => {
  if (window.__sheetwriteApiCopy !== undefined) return;
  window.__sheetwriteApiCopy = true;
  const selectCopy = (text) => {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.append(area);
    area.select();
    let copied = false;
    try {
      copied = document.execCommand("copy");
    } catch {
      copied = false;
    }
    area.remove();
    return copied;
  };
  const copy = (button) => {
    const text = button.dataset.copyCode ?? "";
    const confirm = () => {
      button.textContent = "Copied";
      window.setTimeout(() => { button.textContent = "Copy"; }, 1400);
    };
    if (navigator.clipboard === undefined) {
      if (selectCopy(text)) confirm();
      return;
    }
    navigator.clipboard.writeText(text).then(confirm, () => {
      if (selectCopy(text)) confirm();
    });
  };
  document.addEventListener("click", (event) => {
    const target = event.target;
    const button = target instanceof Element ? target.closest(".api-copy") : null;
    if (button !== null) copy(button);
  });
})();
</script>
