---
title: "VersionedCommentEvent | @sheetwrite/core"
description: "Comment mutation paired with its assigned server version."
---
<!-- api-export:@sheetwrite/core|.|VersionedCommentEvent -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Comment mutation paired with its assigned server version.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/collaboration.ts#L466"><code>packages/core/src/collaboration.ts#L466</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-member-list">

<details class="api-member" id="versioned-comment-event-version" data-pagefind-weight="1">
<summary><code>version</code></summary>

```ts generated
version: number;
```

</details>

<details class="api-member" id="versioned-comment-event-thread" data-pagefind-weight="1">
<summary><code>thread</code></summary>

```ts generated
thread: CommentThread;
```

</details>

<details class="api-member" id="versioned-comment-event-client-mutation-id" data-pagefind-weight="1">
<summary><code>clientMutationId</code></summary>

```ts generated
clientMutationId?: string;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface VersionedCommentEvent {
  version: number;
  thread: CommentThread;
  clientMutationId?: string;
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

<p class="api-consumers-label">Public exports naming <code>VersionedCommentEvent</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/comment-adapter/"><code>CommentAdapter</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
