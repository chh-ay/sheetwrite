---
title: "GridSizeProps | @sheetwrite/core/adapter"
description: "Explicit width and height accepted by framework adapters."
---
<!-- api-export:@sheetwrite/core|./adapter|GridSizeProps -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-adapter/">@sheetwrite/core/adapter</a><span class="api-status" data-kind="type">type</span></div>

Explicit width and height accepted by framework adapters.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core/adapter</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/adapter.ts#L148</code></dd></div>
</dl>

## Variants <span class="api-count" data-pagefind-ignore>2</span>

<div class="api-variant-list" data-pagefind-ignore>
<div class="api-variant">

<button class="api-copy" type="button" data-copy-code="{ height: number | string; fill?: never }" data-pagefind-ignore>Copy</button>

```ts generated
{ height: number | string; fill?: never }
```

</div>
<div class="api-variant">

<button class="api-copy" type="button" data-copy-code="{ fill: true; height?: never }" data-pagefind-ignore>Copy</button>

```ts generated
{ fill: true; height?: never }
```

</div>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export type GridSizeProps =&#10;  | {&#10;      height: number | string;&#10;      fill?: never;&#10;    }&#10;  | {&#10;      fill: true;&#10;      height?: never;&#10;    };" data-pagefind-ignore>Copy</button>

```ts generated
export type GridSizeProps =
  | {
      height: number | string;
      fill?: never;
    }
  | {
      fill: true;
      height?: never;
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

<p class="api-consumers-label">Public exports naming <code>GridSizeProps</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/react/sheetwrite-props/"><code>SheetwriteProps</code></a><span class="api-consumer-kind">@sheetwrite/react</span></li>
<li><a href="/docs/api/svelte/sheetwrite-props/"><code>SheetwriteProps</code></a><span class="api-consumer-kind">@sheetwrite/svelte</span></li>
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
