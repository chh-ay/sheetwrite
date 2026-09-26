---
title: "CommentAdapter | @sheetwrite/core"
description: "Host persistence contract for versioned comment threads."
---
<!-- api-export:@sheetwrite/core|.|CommentAdapter -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Host persistence contract for versioned comment threads.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/collaboration.ts#L473"><code>packages/core/src/collaboration.ts#L473</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-member-list">

<details class="api-member" id="comment-adapter-list-comments" data-pagefind-weight="1">
<summary><code>listComments</code></summary>

```ts generated
listComments(documentId: string, signal?: AbortSignal): Promise<CommentListResult>;
```

</details>

<details class="api-member" id="comment-adapter-mutate-comment" data-pagefind-weight="1">
<summary><code>mutateComment</code></summary>

```ts generated
mutateComment(request: CommentMutationRequest): Promise<CommentMutationResponse>;
```

</details>

<details class="api-member" id="comment-adapter-subscribe-comments" data-pagefind-weight="1">
<summary><code>subscribeComments</code></summary>

```ts generated
subscribeComments?( documentId: string, listener: (event: VersionedCommentEvent) => void, signal?: AbortSignal, ): undefined | (() => void);
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface CommentAdapter {
  listComments(
    documentId: string,
    signal?: AbortSignal,
  ): Promise<CommentListResult>;
  mutateComment(
    request: CommentMutationRequest,
  ): Promise<CommentMutationResponse>;
  subscribeComments?(
    documentId: string,
    listener: (event: VersionedCommentEvent) => void,
    signal?: AbortSignal,
  ): undefined | (() => void);
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

<p class="api-consumers-label">Public exports naming <code>CommentAdapter</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/comment-coordinator/"><code>CommentCoordinator</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
