---
title: "SheetwriteErrorContextValue | @sheetwrite/core"
description: "JSON-safe values accepted in a public failure context."
---
<!-- api-export:@sheetwrite/core|.|SheetwriteErrorContextValue -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

JSON-safe values accepted in a public failure context.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/errors.ts#L85</code></dd></div>
</dl>

## Variants <span class="api-count" data-pagefind-ignore>6</span>

<div class="api-variant-list" data-pagefind-ignore>
<div class="api-variant">

<button class="api-copy" type="button" data-copy-code="null" data-pagefind-ignore>Copy</button>

```ts generated
null
```

</div>
<div class="api-variant">

<button class="api-copy" type="button" data-copy-code="string" data-pagefind-ignore>Copy</button>

```ts generated
string
```

</div>
<div class="api-variant">

<button class="api-copy" type="button" data-copy-code="number" data-pagefind-ignore>Copy</button>

```ts generated
number
```

</div>
<div class="api-variant">

<button class="api-copy" type="button" data-copy-code="boolean" data-pagefind-ignore>Copy</button>

```ts generated
boolean
```

</div>
<div class="api-variant">

<button class="api-copy" type="button" data-copy-code="readonly SheetwriteErrorContextValue[]" data-pagefind-ignore>Copy</button>

```ts generated
readonly SheetwriteErrorContextValue[]
```

</div>
<div class="api-variant">

<button class="api-copy" type="button" data-copy-code="{ readonly [key: string]: SheetwriteErrorContextValue }" data-pagefind-ignore>Copy</button>

```ts generated
{ readonly [key: string]: SheetwriteErrorContextValue }
```

</div>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export type SheetwriteErrorContextValue =&#10;  | null&#10;  | string&#10;  | number&#10;  | boolean&#10;  | readonly SheetwriteErrorContextValue[]&#10;  | {&#10;      readonly [key: string]: SheetwriteErrorContextValue;&#10;    };" data-pagefind-ignore>Copy</button>

```ts generated
export type SheetwriteErrorContextValue =
  | null
  | string
  | number
  | boolean
  | readonly SheetwriteErrorContextValue[]
  | {
      readonly [key: string]: SheetwriteErrorContextValue;
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

<p class="api-consumers-label">Public exports naming <code>SheetwriteErrorContextValue</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/sheetwrite-error/"><code>SheetwriteError</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/sheetwrite-error-context/"><code>SheetwriteErrorContext</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-adapter/sheetwrite-error/"><code>SheetwriteError</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-adapter/sheetwrite-error-context/"><code>SheetwriteErrorContext</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
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
