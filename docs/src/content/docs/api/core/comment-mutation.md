---
title: "CommentMutation | @sheetwrite/core"
description: "Serializable operation that creates or updates comment state."
---
<!-- api-export:@sheetwrite/core|.|CommentMutation -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

Serializable operation that creates or updates comment state.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/collaboration.ts#L428</code></dd></div>
</dl>

## Variants <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-variant-list" data-pagefind-ignore>
<div class="api-variant">

<button class="api-copy" type="button" data-copy-code="{&#10;  kind: &quot;create&quot;;&#10;  threadId: string;&#10;  messageId: string;&#10;  anchor: CommentAnchor;&#10;  body: string;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
{
  kind: "create";
  threadId: string;
  messageId: string;
  anchor: CommentAnchor;
  body: string;
}
```

</div>
<div class="api-variant">

<button class="api-copy" type="button" data-copy-code="{&#10;  kind: &quot;reply&quot;;&#10;  threadId: string;&#10;  messageId: string;&#10;  body: string;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
{
  kind: "reply";
  threadId: string;
  messageId: string;
  body: string;
}
```

</div>
<div class="api-variant">

<button class="api-copy" type="button" data-copy-code="{ kind: &quot;resolve&quot;; threadId: string; resolved: boolean }" data-pagefind-ignore>Copy</button>

```ts generated
{ kind: "resolve"; threadId: string; resolved: boolean }
```

</div>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export type CommentMutation =&#10;  | {&#10;      kind: &quot;create&quot;;&#10;      threadId: string;&#10;      messageId: string;&#10;      anchor: CommentAnchor;&#10;      body: string;&#10;    }&#10;  | {&#10;      kind: &quot;reply&quot;;&#10;      threadId: string;&#10;      messageId: string;&#10;      body: string;&#10;    }&#10;  | {&#10;      kind: &quot;resolve&quot;;&#10;      threadId: string;&#10;      resolved: boolean;&#10;    };" data-pagefind-ignore>Copy</button>

```ts generated
export type CommentMutation =
  | {
      kind: "create";
      threadId: string;
      messageId: string;
      anchor: CommentAnchor;
      body: string;
    }
  | {
      kind: "reply";
      threadId: string;
      messageId: string;
      body: string;
    }
  | {
      kind: "resolve";
      threadId: string;
      resolved: boolean;
    };
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

<p class="api-consumers-label">Public exports naming <code>CommentMutation</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/comment-coordinator/"><code>CommentCoordinator</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/comment-mutation-request/"><code>CommentMutationRequest</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
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
