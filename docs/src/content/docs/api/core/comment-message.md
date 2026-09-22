---
title: "CommentMessage | @sheetwrite/core"
description: "One immutable author message in a comment thread."
---
<!-- api-export:@sheetwrite/core|.|CommentMessage -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

One immutable author message in a comment thread.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/collaboration.ts#L407</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>5</span>

<div class="api-member-list">

<details class="api-member" id="comment-message-id" data-pagefind-weight="1" open>
<summary><code>id</code></summary>

<button class="api-copy" type="button" data-copy-code="id: string;" data-pagefind-ignore>Copy</button>

```ts generated
id: string;
```

</details>

<details class="api-member" id="comment-message-author" data-pagefind-weight="1" open>
<summary><code>author</code></summary>

<button class="api-copy" type="button" data-copy-code="author: CommentAuthorRef;" data-pagefind-ignore>Copy</button>

```ts generated
author: CommentAuthorRef;
```

</details>

<details class="api-member" id="comment-message-body" data-pagefind-weight="1" open>
<summary><code>body</code></summary>

<button class="api-copy" type="button" data-copy-code="body: string;" data-pagefind-ignore>Copy</button>

```ts generated
body: string;
```

</details>

<details class="api-member" id="comment-message-created-at" data-pagefind-weight="1" open>
<summary><code>createdAt</code></summary>

<button class="api-copy" type="button" data-copy-code="createdAt: string;" data-pagefind-ignore>Copy</button>

```ts generated
createdAt: string;
```

</details>

<details class="api-member" id="comment-message-edited-at" data-pagefind-weight="1" open>
<summary><code>editedAt</code></summary>

<button class="api-copy" type="button" data-copy-code="editedAt?: string;" data-pagefind-ignore>Copy</button>

```ts generated
editedAt?: string;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface CommentMessage {&#10;  id: string;&#10;  author: CommentAuthorRef;&#10;  body: string;&#10;  createdAt: string;&#10;  editedAt?: string;&#10;}" data-pagefind-ignore>Copy</button>

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
