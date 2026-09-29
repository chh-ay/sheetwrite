---
title: "RebaseConflict | @sheetwrite/core"
description: "Reason and affected operations for an unsafe document rebase."
---
<!-- api-export:@sheetwrite/core|.|RebaseConflict -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Reason and affected operations for an unsafe document rebase.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/rebase.ts#L16"><code>packages/core/src/rebase.ts#L16</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>4</span>

<div class="api-member-list">

<details class="api-member" id="rebase-conflict-code" data-pagefind-weight="1">
<summary><code>code</code></summary>

```ts generated
code: RebaseConflictCode;
```

</details>

<details class="api-member" id="rebase-conflict-local-operation-index" data-pagefind-weight="1">
<summary><code>localOperationIndex</code></summary>

```ts generated
localOperationIndex: number;
```

</details>

<details class="api-member" id="rebase-conflict-remote-operation-index" data-pagefind-weight="1">
<summary><code>remoteOperationIndex</code></summary>

```ts generated
remoteOperationIndex: number;
```

</details>

<details class="api-member" id="rebase-conflict-message" data-pagefind-weight="1">
<summary><code>message</code></summary>

```ts generated
message: string;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface RebaseConflict {
  code: RebaseConflictCode;
  localOperationIndex: number;
  remoteOperationIndex: number;
  message: string;
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

<p class="api-consumers-label">Public exports naming <code>RebaseConflict</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/document-rebase-result/"><code>DocumentRebaseResult</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
