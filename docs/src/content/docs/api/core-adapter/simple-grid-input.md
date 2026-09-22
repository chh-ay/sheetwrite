---
title: "SimpleGridInput | @sheetwrite/core/adapter"
description: "Normalized workbook and columnar data produced from simple adapter props."
---
<!-- api-export:@sheetwrite/core|./adapter|SimpleGridInput -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-adapter/">@sheetwrite/core/adapter</a><span class="api-status" data-kind="interface">interface</span></div>

Normalized workbook and columnar data produced from simple adapter props.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core/adapter</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/adapter.ts#L273</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-member-list">

<details class="api-member" id="simple-grid-input-workbook" data-pagefind-weight="1" open>
<summary><code>workbook</code></summary>

<button class="api-copy" type="button" data-copy-code="workbook: Workbook;" data-pagefind-ignore>Copy</button>

```ts generated
workbook: Workbook;
```

</details>

<details class="api-member" id="simple-grid-input-data" data-pagefind-weight="1" open>
<summary><code>data</code></summary>

<button class="api-copy" type="button" data-copy-code="data: ColumnarData;" data-pagefind-ignore>Copy</button>

```ts generated
data: ColumnarData;
```

</details>

<details class="api-member" id="simple-grid-input-presentation" data-pagefind-weight="1" open>
<summary><code>presentation</code> <span class="api-member-summary">Simple row-object input always opts into semantic data-grid presentation.</span></summary>

<button class="api-copy" type="button" data-copy-code="presentation: &quot;data-grid&quot;;" data-pagefind-ignore>Copy</button>

```ts generated
presentation: "data-grid";
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface SimpleGridInput {&#10;  workbook: Workbook;&#10;  data: ColumnarData;&#10;  presentation: &quot;data-grid&quot;;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
export interface SimpleGridInput {
  workbook: Workbook;
  data: ColumnarData;
  presentation: "data-grid";
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

<p class="api-consumers-label">Public exports naming <code>SimpleGridInput</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core-adapter/create-simple-grid-input/"><code>createSimpleGridInput</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
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
