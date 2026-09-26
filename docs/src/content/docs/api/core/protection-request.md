---
title: "ProtectionRequest | @sheetwrite/core"
description: "Local operation and protected-range context supplied to the host policy."
---
<!-- api-export:@sheetwrite/core|.|ProtectionRequest -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Local operation and protected-range context supplied to the host policy.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/types/document.ts#L228"><code>packages/core/src/types/document.ts#L228</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-member-list">

<details class="api-member" id="protection-request-protected-range" data-pagefind-weight="1">
<summary><code>protectedRange</code></summary>

```ts generated
protectedRange: Readonly<ProtectedRange>;
```

</details>

<details class="api-member" id="protection-request-operation" data-pagefind-weight="1">
<summary><code>operation</code></summary>

```ts generated
operation: Readonly<DocumentOp>;
```

</details>

<details class="api-member" id="protection-request-commit-reason" data-pagefind-weight="1">
<summary><code>commitReason</code></summary>

```ts generated
commitReason: CommitReason;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface ProtectionRequest {
  protectedRange: Readonly<ProtectedRange>;
  operation: Readonly<DocumentOp>;
  commitReason: CommitReason;
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

<p class="api-consumers-label">Public exports naming <code>ProtectionRequest</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/protection-resolver/"><code>ProtectionResolver</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
