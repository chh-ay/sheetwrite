---
title: "CommentAnchor | @sheetwrite/core"
description: "Document location to which a comment thread is attached."
---
<!-- api-export:@sheetwrite/core|.|CommentAnchor -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

Document location to which a comment thread is attached.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/collaboration.ts#L402</code></dd></div>
</dl>

## Variants <span class="api-count" data-pagefind-ignore>2</span>

<div class="api-variant-list" data-pagefind-ignore>
<div class="api-variant">

<button class="api-copy" type="button" data-copy-code="{&#10;  kind: &quot;cell&quot;;&#10;  address: { sheet: string; row: number; col: number };&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
{
  kind: "cell";
  address: { sheet: string; row: number; col: number };
}
```

</div>
<div class="api-variant">

<button class="api-copy" type="button" data-copy-code="{ kind: &quot;range&quot;; range: Range }" data-pagefind-ignore>Copy</button>

```ts generated
{ kind: "range"; range: Range }
```

</div>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export type CommentAnchor =&#10;  | {&#10;      kind: &quot;cell&quot;;&#10;      address: {&#10;        sheet: string;&#10;        row: number;&#10;        col: number;&#10;      };&#10;    }&#10;  | {&#10;      kind: &quot;range&quot;;&#10;      range: Range;&#10;    };" data-pagefind-ignore>Copy</button>

```ts generated
export type CommentAnchor =
  | {
      kind: "cell";
      address: {
        sheet: string;
        row: number;
        col: number;
      };
    }
  | {
      kind: "range";
      range: Range;
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

<p class="api-consumers-label">Public exports naming <code>CommentAnchor</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/comment-coordinator/"><code>CommentCoordinator</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/comment-mutation/"><code>CommentMutation</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
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
