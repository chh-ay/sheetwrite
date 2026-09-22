---
title: "CommentCoordinator | @sheetwrite/core"
description: "Transport/auth-neutral comment state with server-owned author and timestamp fields."
---
<!-- api-export:@sheetwrite/core|.|CommentCoordinator -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="class">class</span></div>

Transport/auth-neutral comment state with server-owned author and timestamp fields.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/collaboration.ts#L500</code></dd></div>
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

<details class="api-member" id="comment-coordinator-constructor" data-pagefind-weight="1" open>
<summary><code>constructor</code></summary>

<button class="api-copy" type="button" data-copy-code="constructor(adapter: CommentAdapter, options: CommentCoordinatorOptions);" data-pagefind-ignore>Copy</button>

```ts generated
constructor(adapter: CommentAdapter, options: CommentCoordinatorOptions);
```

</details>

<details class="api-member" id="comment-coordinator-comment-threads" data-pagefind-weight="1" open>
<summary><code>commentThreads</code></summary>

<button class="api-copy" type="button" data-copy-code="commentThreads: () =&gt; readonly CommentThread[];" data-pagefind-ignore>Copy</button>

```ts generated
commentThreads: () => readonly CommentThread[];
```

</details>

<details class="api-member" id="comment-coordinator-create" data-pagefind-weight="1">
<summary><code>create</code></summary>

<button class="api-copy" type="button" data-copy-code="create: (threadId: string, messageId: string, anchor: CommentAnchor, body: string, clientMutationId: string) =&gt; Promise&lt;CommentMutationResponse&gt;;" data-pagefind-ignore>Copy</button>

```ts generated
create: (threadId: string, messageId: string, anchor: CommentAnchor, body: string, clientMutationId: string) => Promise<CommentMutationResponse>;
```

</details>

<details class="api-member" id="comment-coordinator-destroy" data-pagefind-weight="1" open>
<summary><code>destroy</code></summary>

<button class="api-copy" type="button" data-copy-code="destroy: () =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
destroy: () => void;
```

</details>

<details class="api-member" id="comment-coordinator-load" data-pagefind-weight="1" open>
<summary><code>load</code></summary>

<button class="api-copy" type="button" data-copy-code="load: () =&gt; Promise&lt;readonly CommentThread[]&gt;;" data-pagefind-ignore>Copy</button>

```ts generated
load: () => Promise<readonly CommentThread[]>;
```

</details>

<details class="api-member" id="comment-coordinator-mutate" data-pagefind-weight="1" open>
<summary><code>mutate</code></summary>

<button class="api-copy" type="button" data-copy-code="mutate: (mutation: CommentMutation, clientMutationId: string) =&gt; Promise&lt;CommentMutationResponse&gt;;" data-pagefind-ignore>Copy</button>

```ts generated
mutate: (mutation: CommentMutation, clientMutationId: string) => Promise<CommentMutationResponse>;
```

</details>

<details class="api-member" id="comment-coordinator-on" data-pagefind-weight="1" open>
<summary><code>on</code></summary>

<button class="api-copy" type="button" data-copy-code="on: (listener: CommentListener) =&gt; () =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
on: (listener: CommentListener) => () => void;
```

</details>

<details class="api-member" id="comment-coordinator-reply" data-pagefind-weight="1">
<summary><code>reply</code></summary>

<button class="api-copy" type="button" data-copy-code="reply: (threadId: string, messageId: string, body: string, clientMutationId: string) =&gt; Promise&lt;CommentMutationResponse&gt;;" data-pagefind-ignore>Copy</button>

```ts generated
reply: (threadId: string, messageId: string, body: string, clientMutationId: string) => Promise<CommentMutationResponse>;
```

</details>

<details class="api-member" id="comment-coordinator-resolve" data-pagefind-weight="1">
<summary><code>resolve</code></summary>

<button class="api-copy" type="button" data-copy-code="resolve: (threadId: string, resolved: boolean, clientMutationId: string) =&gt; Promise&lt;CommentMutationResponse&gt;;" data-pagefind-ignore>Copy</button>

```ts generated
resolve: (threadId: string, resolved: boolean, clientMutationId: string) => Promise<CommentMutationResponse>;
```

</details>

<details class="api-member" id="comment-coordinator-server-version" data-pagefind-weight="1" open>
<summary><code>serverVersion</code></summary>

<button class="api-copy" type="button" data-copy-code="serverVersion: number" data-pagefind-ignore>Copy</button>

```ts generated
serverVersion: number
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="class CommentCoordinator {&#10;  constructor(adapter: CommentAdapter, options: CommentCoordinatorOptions);&#10;  commentThreads: () =&gt; readonly CommentThread[];&#10;  create: (&#10;    threadId: string,&#10;    messageId: string,&#10;    anchor: CommentAnchor,&#10;    body: string,&#10;    clientMutationId: string,&#10;  ) =&gt; Promise&lt;CommentMutationResponse&gt;;&#10;  destroy: () =&gt; void;&#10;  load: () =&gt; Promise&lt;readonly CommentThread[]&gt;;&#10;  mutate: (&#10;    mutation: CommentMutation,&#10;    clientMutationId: string,&#10;  ) =&gt; Promise&lt;CommentMutationResponse&gt;;&#10;  on: (listener: CommentListener) =&gt; () =&gt; void;&#10;  reply: (&#10;    threadId: string,&#10;    messageId: string,&#10;    body: string,&#10;    clientMutationId: string,&#10;  ) =&gt; Promise&lt;CommentMutationResponse&gt;;&#10;  resolve: (&#10;    threadId: string,&#10;    resolved: boolean,&#10;    clientMutationId: string,&#10;  ) =&gt; Promise&lt;CommentMutationResponse&gt;;&#10;  serverVersion: number;&#10;}" data-pagefind-ignore>Copy</button>

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

<script>
(() => {
  if (window.__sheetwriteApiCopy !== undefined) return;
  window.__sheetwriteApiCopy = true;
  const selectCopy = (text) => {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.append(area);
    area.select();
    let copied = false;
    try {
      copied = document.execCommand("copy");
    } catch {
      copied = false;
    }
    area.remove();
    return copied;
  };
  const copy = (button) => {
    const text = button.dataset.copyCode ?? "";
    const confirm = () => {
      button.textContent = "Copied";
      window.setTimeout(() => { button.textContent = "Copy"; }, 1400);
    };
    if (navigator.clipboard === undefined) {
      if (selectCopy(text)) confirm();
      return;
    }
    navigator.clipboard.writeText(text).then(confirm, () => {
      if (selectCopy(text)) confirm();
    });
  };
  document.addEventListener("click", (event) => {
    const target = event.target;
    const button = target instanceof Element ? target.closest(".api-copy") : null;
    if (button !== null) copy(button);
  });
})();
</script>
