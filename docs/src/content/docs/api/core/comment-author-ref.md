---
title: "CommentAuthorRef | @sheetwrite/core"
description: "Stable host-provided identity displayed on a comment message."
---
<!-- api-export:@sheetwrite/core|.|CommentAuthorRef -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Stable host-provided identity displayed on a comment message.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/collaboration.ts#L395"><code>packages/core/src/collaboration.ts#L395</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-member-list">

<details class="api-member" id="comment-author-ref-id" data-pagefind-weight="1">
<summary><code>id</code></summary>

```ts generated
id: string;
```

</details>

<details class="api-member" id="comment-author-ref-display-name" data-pagefind-weight="1">
<summary><code>displayName</code></summary>

```ts generated
displayName?: string;
```

</details>

<details class="api-member" id="comment-author-ref-avatar-url" data-pagefind-weight="1">
<summary><code>avatarUrl</code></summary>

```ts generated
avatarUrl?: string;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface CommentAuthorRef {
  id: string;
  displayName?: string;
  avatarUrl?: string;
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

<p class="api-consumers-label">Public exports naming <code>CommentAuthorRef</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/comment-message/"><code>CommentMessage</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/comment-thread/"><code>CommentThread</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
