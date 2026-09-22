---
title: "XlsxModel | @sheetwrite/xlsx"
description: "Implementation-neutral first-sheet table export model."
---
<!-- api-export:@sheetwrite/xlsx|.|XlsxModel -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/xlsx/">@sheetwrite/xlsx</a><span class="api-status" data-kind="interface">interface</span></div>

Implementation-neutral first-sheet table export model.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/xlsx</code></dd></div>
<div><dt>Source</dt><dd><code>packages/xlsx/src/table-export.ts#L23</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>4</span>

<div class="api-member-list">

<details class="api-member" id="xlsx-model-sheet-name" data-pagefind-weight="1" open>
<summary><code>sheetName</code></summary>

<button class="api-copy" type="button" data-copy-code="sheetName: string;" data-pagefind-ignore>Copy</button>

```ts generated
sheetName: string;
```

</details>

<details class="api-member" id="xlsx-model-column-widths" data-pagefind-weight="1" open>
<summary><code>columnWidths</code></summary>

<button class="api-copy" type="button" data-copy-code="columnWidths: number[];" data-pagefind-ignore>Copy</button>

```ts generated
columnWidths: number[];
```

</details>

<details class="api-member" id="xlsx-model-row-heights" data-pagefind-weight="1" open>
<summary><code>rowHeights</code></summary>

<button class="api-copy" type="button" data-copy-code="rowHeights: (number | undefined)[];" data-pagefind-ignore>Copy</button>

```ts generated
rowHeights: (number | undefined)[];
```

</details>

<details class="api-member" id="xlsx-model-rows" data-pagefind-weight="1" open>
<summary><code>rows</code></summary>

<button class="api-copy" type="button" data-copy-code="rows: (XlsxModelCell | null)[][];" data-pagefind-ignore>Copy</button>

```ts generated
rows: (XlsxModelCell | null)[][];
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface XlsxModel {&#10;  sheetName: string;&#10;  columnWidths: number[];&#10;  rowHeights: (number | undefined)[];&#10;  rows: (XlsxModelCell | null)[][];&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
export interface XlsxModel {
  sheetName: string;
  columnWidths: number[];
  rowHeights: (number | undefined)[];
  rows: (XlsxModelCell | null)[][];
}
```

</details>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/xlsx</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>XlsxModel</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/xlsx/build-xlsx-model/"><code>buildXlsxModel</code></a><span class="api-consumer-kind">@sheetwrite/xlsx</span></li>
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
