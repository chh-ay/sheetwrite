---
title: "CommentAdapter | @sheetwrite/core"
description: "Host persistence contract for versioned comment threads."
---
<!-- api-export:@sheetwrite/core|.|CommentAdapter -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Host persistence contract for versioned comment threads.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/collaboration.ts#L473</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-member-list">

<details class="api-member" id="comment-adapter-list-comments" data-pagefind-weight="1" open>
<summary><code>listComments</code></summary>

<button class="api-copy" type="button" data-copy-code="listComments(documentId: string, signal?: AbortSignal): Promise&lt;CommentListResult&gt;;" data-pagefind-ignore>Copy</button>

```ts generated
listComments(documentId: string, signal?: AbortSignal): Promise<CommentListResult>;
```

</details>

<details class="api-member" id="comment-adapter-mutate-comment" data-pagefind-weight="1" open>
<summary><code>mutateComment</code></summary>

<button class="api-copy" type="button" data-copy-code="mutateComment(request: CommentMutationRequest): Promise&lt;CommentMutationResponse&gt;;" data-pagefind-ignore>Copy</button>

```ts generated
mutateComment(request: CommentMutationRequest): Promise<CommentMutationResponse>;
```

</details>

<details class="api-member" id="comment-adapter-subscribe-comments" data-pagefind-weight="1">
<summary><code>subscribeComments</code></summary>

<button class="api-copy" type="button" data-copy-code="subscribeComments?( documentId: string, listener: (event: VersionedCommentEvent) =&gt; void, signal?: AbortSignal, ): undefined | (() =&gt; void);" data-pagefind-ignore>Copy</button>

```ts generated
subscribeComments?( documentId: string, listener: (event: VersionedCommentEvent) => void, signal?: AbortSignal, ): undefined | (() => void);
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface CommentAdapter {&#10;  listComments(&#10;    documentId: string,&#10;    signal?: AbortSignal,&#10;  ): Promise&lt;CommentListResult&gt;;&#10;  mutateComment(&#10;    request: CommentMutationRequest,&#10;  ): Promise&lt;CommentMutationResponse&gt;;&#10;  subscribeComments?(&#10;    documentId: string,&#10;    listener: (event: VersionedCommentEvent) =&gt; void,&#10;    signal?: AbortSignal,&#10;  ): undefined | (() =&gt; void);&#10;}" data-pagefind-ignore>Copy</button>

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
