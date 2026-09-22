---
title: "CellBorders | @sheetwrite/core"
description: "Per-side borders; all applies to any side not given its own border."
---
<!-- api-export:@sheetwrite/core|.|CellBorders -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Per-side borders; `all` applies to any side not given its own border.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/cell.ts#L18</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>5</span>

<div class="api-member-list">

<details class="api-member" id="cell-borders-all" data-pagefind-weight="1" open>
<summary><code>all</code></summary>

<button class="api-copy" type="button" data-copy-code="all?: CellBorder;" data-pagefind-ignore>Copy</button>

```ts generated
all?: CellBorder;
```

</details>

<details class="api-member" id="cell-borders-top" data-pagefind-weight="1" open>
<summary><code>top</code></summary>

<button class="api-copy" type="button" data-copy-code="top?: CellBorder;" data-pagefind-ignore>Copy</button>

```ts generated
top?: CellBorder;
```

</details>

<details class="api-member" id="cell-borders-right" data-pagefind-weight="1" open>
<summary><code>right</code></summary>

<button class="api-copy" type="button" data-copy-code="right?: CellBorder;" data-pagefind-ignore>Copy</button>

```ts generated
right?: CellBorder;
```

</details>

<details class="api-member" id="cell-borders-bottom" data-pagefind-weight="1" open>
<summary><code>bottom</code></summary>

<button class="api-copy" type="button" data-copy-code="bottom?: CellBorder;" data-pagefind-ignore>Copy</button>

```ts generated
bottom?: CellBorder;
```

</details>

<details class="api-member" id="cell-borders-left" data-pagefind-weight="1" open>
<summary><code>left</code></summary>

<button class="api-copy" type="button" data-copy-code="left?: CellBorder;" data-pagefind-ignore>Copy</button>

```ts generated
left?: CellBorder;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface CellBorders {&#10;  all?: CellBorder;&#10;  top?: CellBorder;&#10;  right?: CellBorder;&#10;  bottom?: CellBorder;&#10;  left?: CellBorder;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
export interface CellBorders {
  all?: CellBorder;
  top?: CellBorder;
  right?: CellBorder;
  bottom?: CellBorder;
  left?: CellBorder;
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

<p class="api-consumers-label">Public exports naming <code>CellBorders</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/cell-style/"><code>CellStyle</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
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
