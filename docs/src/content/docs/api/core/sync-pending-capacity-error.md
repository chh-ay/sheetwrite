---
title: "SyncPendingCapacityError | @sheetwrite/core"
description: "Typed local transaction rejection produced when the durable queue cannot reserve capacity."
---
<!-- api-export:@sheetwrite/core|.|SyncPendingCapacityError -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="class">class</span></div>

Typed local transaction rejection produced when the durable queue cannot reserve capacity.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/sync.ts#L213"><code>packages/core/src/sync.ts#L213</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-member-list">

<details class="api-member" id="sync-pending-capacity-error-constructor" data-pagefind-weight="1">
<summary><code>constructor</code></summary>

```ts generated
constructor(issue: Extract<MutationIssue, { kind: "resource-limit"; }>);
```

</details>

<details class="api-member" id="sync-pending-capacity-error-issue" data-pagefind-weight="1">
<summary><code>issue</code></summary>

```ts generated
issue: { kind: "resource-limit"; severity: "error"; resource: "operations" | "encoded-bytes" | "batch-versions" | "pending-commits" | "pending-operations" | "pending-encoded-bytes" | "paged-dirty-cells" | "paged-reference-simulation"; actual: number; max: number; message: string; };
```

</details>

<details class="api-member" id="sync-pending-capacity-error-name" data-pagefind-weight="1">
<summary><code>name</code></summary>

```ts generated
name: "SyncPendingCapacityError"
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
class SyncPendingCapacityError extends SheetwriteError {
  constructor(
    issue: Extract<
      MutationIssue,
      {
        kind: "resource-limit";
      }
    >,
  );
  issue: {
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
  };
  name: "SyncPendingCapacityError";
}
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

<p class="api-consumers-label">Public exports naming <code>SyncPendingCapacityError</code></p>

<ul class="api-consumer-list">
<li>None.</li>
</ul>
</div>
