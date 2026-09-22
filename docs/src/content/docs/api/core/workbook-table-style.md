---
title: "WorkbookTableStyle | @sheetwrite/core"
description: "Bounded native subset of ECMA-376 table style information."
---
<!-- api-export:@sheetwrite/core|.|WorkbookTableStyle -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Bounded native subset of ECMA-376 table style information.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/table.ts#L16</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>5</span>

<div class="api-member-list">

<details class="api-member" id="workbook-table-style-name" data-pagefind-weight="1" open>
<summary><code>name</code></summary>

<button class="api-copy" type="button" data-copy-code="name?: string;" data-pagefind-ignore>Copy</button>

```ts generated
name?: string;
```

</details>

<details class="api-member" id="workbook-table-style-show-first-column" data-pagefind-weight="1" open>
<summary><code>showFirstColumn</code></summary>

<button class="api-copy" type="button" data-copy-code="showFirstColumn?: boolean;" data-pagefind-ignore>Copy</button>

```ts generated
showFirstColumn?: boolean;
```

</details>

<details class="api-member" id="workbook-table-style-show-last-column" data-pagefind-weight="1" open>
<summary><code>showLastColumn</code></summary>

<button class="api-copy" type="button" data-copy-code="showLastColumn?: boolean;" data-pagefind-ignore>Copy</button>

```ts generated
showLastColumn?: boolean;
```

</details>

<details class="api-member" id="workbook-table-style-show-row-stripes" data-pagefind-weight="1" open>
<summary><code>showRowStripes</code></summary>

<button class="api-copy" type="button" data-copy-code="showRowStripes?: boolean;" data-pagefind-ignore>Copy</button>

```ts generated
showRowStripes?: boolean;
```

</details>

<details class="api-member" id="workbook-table-style-show-column-stripes" data-pagefind-weight="1" open>
<summary><code>showColumnStripes</code></summary>

<button class="api-copy" type="button" data-copy-code="showColumnStripes?: boolean;" data-pagefind-ignore>Copy</button>

```ts generated
showColumnStripes?: boolean;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface WorkbookTableStyle {&#10;  name?: string;&#10;  showFirstColumn?: boolean;&#10;  showLastColumn?: boolean;&#10;  showRowStripes?: boolean;&#10;  showColumnStripes?: boolean;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
export interface WorkbookTableStyle {
  name?: string;
  showFirstColumn?: boolean;
  showLastColumn?: boolean;
  showRowStripes?: boolean;
  showColumnStripes?: boolean;
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

<p class="api-consumers-label">Public exports naming <code>WorkbookTableStyle</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/workbook-table/"><code>WorkbookTable</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/workbook-table-patch/"><code>WorkbookTablePatch</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
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
