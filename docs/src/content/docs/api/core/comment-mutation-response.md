---
title: "CommentMutationResponse | @sheetwrite/core"
description: "Applied, duplicate, or conflict acknowledgement for a comment mutation."
---
<!-- api-export:@sheetwrite/core|.|CommentMutationResponse -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

Applied, duplicate, or conflict acknowledgement for a comment mutation.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/collaboration.ts#L449"><code>packages/core/src/collaboration.ts#L449</code></a></dd></div>
</dl>

## Variants <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-variant-list" data-pagefind-ignore>
<div class="api-variant">

```ts generated
{
  status: "applied";
  version: number;
  clientMutationId: string;
  thread: CommentThread;
}
```

</div>
<div class="api-variant">

```ts generated
{
  status: "duplicate";
  version: number;
  clientMutationId: string;
}
```

</div>
<div class="api-variant">

```ts generated
{ status: "conflict"; currentVersion: number }
```

</div>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export type CommentMutationResponse =
  | {
      status: "applied";
      version: number;
      clientMutationId: string;
      thread: CommentThread;
    }
  | {
      status: "duplicate";
      version: number;
      clientMutationId: string;
    }
  | {
      status: "conflict";
      currentVersion: number;
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

<p class="api-consumers-label">Public exports naming <code>CommentMutationResponse</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/comment-adapter/"><code>CommentAdapter</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/comment-coordinator/"><code>CommentCoordinator</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
