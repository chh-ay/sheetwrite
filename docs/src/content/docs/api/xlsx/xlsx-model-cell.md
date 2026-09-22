---
title: "XlsxModelCell | @sheetwrite/xlsx"
description: "Implementation-neutral cell in the first-sheet table export model."
---
<!-- api-export:@sheetwrite/xlsx|.|XlsxModelCell -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/xlsx/">@sheetwrite/xlsx</a><span class="api-status" data-kind="interface">interface</span></div>

Implementation-neutral cell in the first-sheet table export model.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/xlsx</code></dd></div>
<div><dt>Source</dt><dd><code>packages/xlsx/src/table-export.ts#L14</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>5</span>

<div class="api-member-list">

<details class="api-member" id="xlsx-model-cell-value" data-pagefind-weight="1" open>
<summary><code>value</code></summary>

<button class="api-copy" type="button" data-copy-code="value: CellScalar;" data-pagefind-ignore>Copy</button>

```ts generated
value: CellScalar;
```

</details>

<details class="api-member" id="xlsx-model-cell-style" data-pagefind-weight="1" open>
<summary><code>style</code></summary>

<button class="api-copy" type="button" data-copy-code="style?: CellStyle;" data-pagefind-ignore>Copy</button>

```ts generated
style?: CellStyle;
```

</details>

<details class="api-member" id="xlsx-model-cell-number-format" data-pagefind-weight="1" open>
<summary><code>numberFormat</code></summary>

<button class="api-copy" type="button" data-copy-code="numberFormat?: string;" data-pagefind-ignore>Copy</button>

```ts generated
numberFormat?: string;
```

</details>

<details class="api-member" id="xlsx-model-cell-column-span" data-pagefind-weight="1" open>
<summary><code>columnSpan</code></summary>

<button class="api-copy" type="button" data-copy-code="columnSpan?: number;" data-pagefind-ignore>Copy</button>

```ts generated
columnSpan?: number;
```

</details>

<details class="api-member" id="xlsx-model-cell-row-span" data-pagefind-weight="1" open>
<summary><code>rowSpan</code></summary>

<button class="api-copy" type="button" data-copy-code="rowSpan?: number;" data-pagefind-ignore>Copy</button>

```ts generated
rowSpan?: number;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface XlsxModelCell {&#10;  value: CellScalar;&#10;  style?: CellStyle;&#10;  numberFormat?: string;&#10;  columnSpan?: number;&#10;  rowSpan?: number;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
export interface XlsxModelCell {
  value: CellScalar;
  style?: CellStyle;
  numberFormat?: string;
  columnSpan?: number;
  rowSpan?: number;
}
```

</details>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/xlsx</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>XlsxModelCell</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/xlsx/xlsx-model/"><code>XlsxModel</code></a><span class="api-consumer-kind">@sheetwrite/xlsx</span></li>
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
