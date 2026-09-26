---
title: "CommentCoordinator | @sheetwrite/core"
description: "Transport/auth-neutral comment state with server-owned author and timestamp fields."
---
<!-- api-export:@sheetwrite/core|.|CommentCoordinator -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="class">class</span></div>

Transport/auth-neutral comment state with server-owned author and timestamp fields.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/collaboration.ts#L500"><code>packages/core/src/collaboration.ts#L500</code></a></dd></div>
</dl>

<nav class="api-member-index" aria-label="Member index" data-pagefind-ignore>
<a href="#comment-coordinator-constructor"><code>constructor</code></a>
<a href="#comment-coordinator-comment-threads"><code>commentThreads</code></a>
<a href="#comment-coordinator-create"><code>create</code></a>
<a href="#comment-coordinator-destroy"><code>destroy</code></a>
<a href="#comment-coordinator-load"><code>load</code></a>
<a href="#comment-coordinator-mutate"><code>mutate</code></a>
<a href="#comment-coordinator-on"><code>on</code></a>
<a href="#comment-coordinator-reply"><code>reply</code></a>
<a href="#comment-coordinator-resolve"><code>resolve</code></a>
<a href="#comment-coordinator-server-version"><code>serverVersion</code></a>
</nav>

## Members <span class="api-count" data-pagefind-ignore>10</span>

<div class="api-member-list">

<details class="api-member" id="comment-coordinator-constructor" data-pagefind-weight="1">
<summary><code>constructor</code></summary>

```ts generated
constructor(adapter: CommentAdapter, options: CommentCoordinatorOptions);
```

</details>

<details class="api-member" id="comment-coordinator-comment-threads" data-pagefind-weight="1">
<summary><code>commentThreads</code></summary>

```ts generated
commentThreads: () => readonly CommentThread[];
```

</details>

<details class="api-member" id="comment-coordinator-create" data-pagefind-weight="1">
<summary><code>create</code></summary>

```ts generated
create: (threadId: string, messageId: string, anchor: CommentAnchor, body: string, clientMutationId: string) => Promise<CommentMutationResponse>;
```

</details>

<details class="api-member" id="comment-coordinator-destroy" data-pagefind-weight="1">
<summary><code>destroy</code></summary>

```ts generated
destroy: () => void;
```

</details>

<details class="api-member" id="comment-coordinator-load" data-pagefind-weight="1">
<summary><code>load</code></summary>

```ts generated
load: () => Promise<readonly CommentThread[]>;
```

</details>

<details class="api-member" id="comment-coordinator-mutate" data-pagefind-weight="1">
<summary><code>mutate</code></summary>

```ts generated
mutate: (mutation: CommentMutation, clientMutationId: string) => Promise<CommentMutationResponse>;
```

</details>

<details class="api-member" id="comment-coordinator-on" data-pagefind-weight="1">
<summary><code>on</code></summary>

```ts generated
on: (listener: CommentListener) => () => void;
```

</details>

<details class="api-member" id="comment-coordinator-reply" data-pagefind-weight="1">
<summary><code>reply</code></summary>

```ts generated
reply: (threadId: string, messageId: string, body: string, clientMutationId: string) => Promise<CommentMutationResponse>;
```

</details>

<details class="api-member" id="comment-coordinator-resolve" data-pagefind-weight="1">
<summary><code>resolve</code></summary>

```ts generated
resolve: (threadId: string, resolved: boolean, clientMutationId: string) => Promise<CommentMutationResponse>;
```

</details>

<details class="api-member" id="comment-coordinator-server-version" data-pagefind-weight="1">
<summary><code>serverVersion</code></summary>

```ts generated
serverVersion: number
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
class CommentCoordinator {
  constructor(adapter: CommentAdapter, options: CommentCoordinatorOptions);
  commentThreads: () => readonly CommentThread[];
  create: (
    threadId: string,
    messageId: string,
    anchor: CommentAnchor,
    body: string,
    clientMutationId: string,
  ) => Promise<CommentMutationResponse>;
  destroy: () => void;
  load: () => Promise<readonly CommentThread[]>;
  mutate: (
    mutation: CommentMutation,
    clientMutationId: string,
  ) => Promise<CommentMutationResponse>;
  on: (listener: CommentListener) => () => void;
  reply: (
    threadId: string,
    messageId: string,
    body: string,
    clientMutationId: string,
  ) => Promise<CommentMutationResponse>;
  resolve: (
    threadId: string,
    resolved: boolean,
    clientMutationId: string,
  ) => Promise<CommentMutationResponse>;
  serverVersion: number;
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

<p class="api-consumers-label">Public exports naming <code>CommentCoordinator</code></p>

<ul class="api-consumer-list">
<li>None.</li>
</ul>
</div>
