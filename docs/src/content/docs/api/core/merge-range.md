---
title: "MergeRange | @sheetwrite/core"
description: "Inclusive merged-cell rectangle in data-row/column coordinates."
---
<!-- api-export:@sheetwrite/core|.|MergeRange -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Inclusive merged-cell rectangle in data-row/column coordinates.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/coordinates.ts#L15</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>4</span>

<div class="api-member-list">

<details class="api-member" id="merge-range-r0" data-pagefind-weight="1" open>
<summary><code>r0</code></summary>

<button class="api-copy" type="button" data-copy-code="r0: number;" data-pagefind-ignore>Copy</button>

```ts generated
r0: number;
```

</details>

<details class="api-member" id="merge-range-c0" data-pagefind-weight="1" open>
<summary><code>c0</code></summary>

<button class="api-copy" type="button" data-copy-code="c0: number;" data-pagefind-ignore>Copy</button>

```ts generated
c0: number;
```

</details>

<details class="api-member" id="merge-range-r1" data-pagefind-weight="1" open>
<summary><code>r1</code></summary>

<button class="api-copy" type="button" data-copy-code="r1: number;" data-pagefind-ignore>Copy</button>

```ts generated
r1: number;
```

</details>

<details class="api-member" id="merge-range-c1" data-pagefind-weight="1" open>
<summary><code>c1</code></summary>

<button class="api-copy" type="button" data-copy-code="c1: number;" data-pagefind-ignore>Copy</button>

```ts generated
c1: number;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface MergeRange {&#10;  r0: number;&#10;  c0: number;&#10;  r1: number;&#10;  c1: number;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
export interface MergeRange {
  r0: number;
  c0: number;
  r1: number;
  c1: number;
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

<p class="api-consumers-label">Public exports naming <code>MergeRange</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/document-op/"><code>DocumentOp</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/sheet/"><code>Sheet</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/sheet-snapshot/"><code>SheetSnapshot</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
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
