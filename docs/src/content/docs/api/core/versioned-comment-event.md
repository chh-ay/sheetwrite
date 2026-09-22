---
title: "VersionedCommentEvent | @sheetwrite/core"
description: "Comment mutation paired with its assigned server version."
---
<!-- api-export:@sheetwrite/core|.|VersionedCommentEvent -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Comment mutation paired with its assigned server version.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/collaboration.ts#L466</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-member-list">

<details class="api-member" id="versioned-comment-event-version" data-pagefind-weight="1" open>
<summary><code>version</code></summary>

<button class="api-copy" type="button" data-copy-code="version: number;" data-pagefind-ignore>Copy</button>

```ts generated
version: number;
```

</details>

<details class="api-member" id="versioned-comment-event-thread" data-pagefind-weight="1" open>
<summary><code>thread</code></summary>

<button class="api-copy" type="button" data-copy-code="thread: CommentThread;" data-pagefind-ignore>Copy</button>

```ts generated
thread: CommentThread;
```

</details>

<details class="api-member" id="versioned-comment-event-client-mutation-id" data-pagefind-weight="1" open>
<summary><code>clientMutationId</code></summary>

<button class="api-copy" type="button" data-copy-code="clientMutationId?: string;" data-pagefind-ignore>Copy</button>

```ts generated
clientMutationId?: string;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface VersionedCommentEvent {&#10;  version: number;&#10;  thread: CommentThread;&#10;  clientMutationId?: string;&#10;}" data-pagefind-ignore>Copy</button>

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
