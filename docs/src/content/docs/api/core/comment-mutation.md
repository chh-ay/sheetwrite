---
title: "CommentMutation | @sheetwrite/core"
description: "Serializable operation that creates or updates comment state."
---
<!-- api-export:@sheetwrite/core|.|CommentMutation -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

Serializable operation that creates or updates comment state.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/collaboration.ts#L428"><code>packages/core/src/collaboration.ts#L428</code></a></dd></div>
</dl>

## Variants <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-variant-list" data-pagefind-ignore>
<div class="api-variant">

```ts generated
{
  kind: "create";
  threadId: string;
  messageId: string;
  anchor: CommentAnchor;
  body: string;
}
```

</div>
<div class="api-variant">

```ts generated
{
  kind: "reply";
  threadId: string;
  messageId: string;
  body: string;
}
```

</div>
<div class="api-variant">

```ts generated
{ kind: "resolve"; threadId: string; resolved: boolean }
```

</div>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export type CommentMutation =
  | {
      kind: "create";
      threadId: string;
      messageId: string;
      anchor: CommentAnchor;
      body: string;
    }
  | {
      kind: "reply";
      threadId: string;
      messageId: string;
      body: string;
    }
  | {
      kind: "resolve";
      threadId: string;
      resolved: boolean;
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

<p class="api-consumers-label">Public exports naming <code>CommentMutation</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/comment-coordinator/"><code>CommentCoordinator</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/comment-mutation-request/"><code>CommentMutationRequest</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
