---
title: "CommentThread | @sheetwrite/core"
description: "Versioned discussion anchored to a document location."
---
<!-- api-export:@sheetwrite/core|.|CommentThread -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Versioned discussion anchored to a document location.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/collaboration.ts#L416"><code>packages/core/src/collaboration.ts#L416</code></a></dd></div>
</dl>

<nav class="api-member-index" aria-label="Member index" data-pagefind-ignore>
<a href="#comment-thread-id"><code>id</code></a>
<a href="#comment-thread-document-id"><code>documentId</code></a>
<a href="#comment-thread-anchor"><code>anchor</code></a>
<a href="#comment-thread-version"><code>version</code></a>
<a href="#comment-thread-messages"><code>messages</code></a>
<a href="#comment-thread-resolved"><code>resolved</code></a>
<a href="#comment-thread-resolved-by"><code>resolvedBy</code></a>
<a href="#comment-thread-resolved-at"><code>resolvedAt</code></a>
</nav>

## Members <span class="api-count" data-pagefind-ignore>8</span>

<div class="api-member-list">

<details class="api-member" id="comment-thread-id" data-pagefind-weight="1">
<summary><code>id</code></summary>

```ts generated
id: string;
```

</details>

<details class="api-member" id="comment-thread-document-id" data-pagefind-weight="1">
<summary><code>documentId</code></summary>

```ts generated
documentId: string;
```

</details>

<details class="api-member" id="comment-thread-anchor" data-pagefind-weight="1">
<summary><code>anchor</code></summary>

```ts generated
anchor: CommentAnchor;
```

</details>

<details class="api-member" id="comment-thread-version" data-pagefind-weight="1">
<summary><code>version</code></summary>

```ts generated
version: number;
```

</details>

<details class="api-member" id="comment-thread-messages" data-pagefind-weight="1">
<summary><code>messages</code></summary>

```ts generated
messages: readonly CommentMessage[];
```

</details>

<details class="api-member" id="comment-thread-resolved" data-pagefind-weight="1">
<summary><code>resolved</code></summary>

```ts generated
resolved: boolean;
```

</details>

<details class="api-member" id="comment-thread-resolved-by" data-pagefind-weight="1">
<summary><code>resolvedBy</code></summary>

```ts generated
resolvedBy?: CommentAuthorRef;
```

</details>

<details class="api-member" id="comment-thread-resolved-at" data-pagefind-weight="1">
<summary><code>resolvedAt</code></summary>

```ts generated
resolvedAt?: string;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface CommentThread {
  id: string;
  documentId: string;
  anchor: CommentAnchor;
  version: number;
  messages: readonly CommentMessage[];
  resolved: boolean;
  resolvedBy?: CommentAuthorRef;
  resolvedAt?: string;
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

<p class="api-consumers-label">Public exports naming <code>CommentThread</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/comment-coordinator/"><code>CommentCoordinator</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/comment-coordinator-event/"><code>CommentCoordinatorEvent</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/comment-list-result/"><code>CommentListResult</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/comment-mutation-response/"><code>CommentMutationResponse</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/versioned-comment-event/"><code>VersionedCommentEvent</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
