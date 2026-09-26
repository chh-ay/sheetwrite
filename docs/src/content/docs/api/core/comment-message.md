---
title: "CommentMessage | @sheetwrite/core"
description: "One immutable author message in a comment thread."
---
<!-- api-export:@sheetwrite/core|.|CommentMessage -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

One immutable author message in a comment thread.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/collaboration.ts#L407"><code>packages/core/src/collaboration.ts#L407</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>5</span>

<div class="api-member-list">

<details class="api-member" id="comment-message-id" data-pagefind-weight="1">
<summary><code>id</code></summary>

```ts generated
id: string;
```

</details>

<details class="api-member" id="comment-message-author" data-pagefind-weight="1">
<summary><code>author</code></summary>

```ts generated
author: CommentAuthorRef;
```

</details>

<details class="api-member" id="comment-message-body" data-pagefind-weight="1">
<summary><code>body</code></summary>

```ts generated
body: string;
```

</details>

<details class="api-member" id="comment-message-created-at" data-pagefind-weight="1">
<summary><code>createdAt</code></summary>

```ts generated
createdAt: string;
```

</details>

<details class="api-member" id="comment-message-edited-at" data-pagefind-weight="1">
<summary><code>editedAt</code></summary>

```ts generated
editedAt?: string;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface CommentMessage {
  id: string;
  author: CommentAuthorRef;
  body: string;
  createdAt: string;
  editedAt?: string;
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

<p class="api-consumers-label">Public exports naming <code>CommentMessage</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/comment-thread/"><code>CommentThread</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
