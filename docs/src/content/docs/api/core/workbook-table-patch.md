---
title: "WorkbookTablePatch | @sheetwrite/core"
description: "Mutable table fields accepted by the explicit update operation."
---
<!-- api-export:@sheetwrite/core|.|WorkbookTablePatch -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Mutable table fields accepted by the explicit update operation.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/table.ts#L55</code></dd></div>
</dl>

<nav class="api-member-index" aria-label="Member index" data-pagefind-ignore>
<a href="#workbook-table-patch-name"><code>name</code></a>
<a href="#workbook-table-patch-range"><code>range</code></a>
<a href="#workbook-table-patch-columns"><code>columns</code></a>
<a href="#workbook-table-patch-header-row"><code>headerRow</code></a>
<a href="#workbook-table-patch-totals-row"><code>totalsRow</code></a>
<a href="#workbook-table-patch-style"><code>style</code></a>
<a href="#workbook-table-patch-unsupported-features"><code>unsupportedFeatures</code></a>
</nav>

## Members <span class="api-count" data-pagefind-ignore>7</span>

<div class="api-member-list">

<details class="api-member" id="workbook-table-patch-name" data-pagefind-weight="1" open>
<summary><code>name</code></summary>

<button class="api-copy" type="button" data-copy-code="name?: string;" data-pagefind-ignore>Copy</button>

```ts generated
name?: string;
```

</details>

<details class="api-member" id="workbook-table-patch-range" data-pagefind-weight="1" open>
<summary><code>range</code></summary>

<button class="api-copy" type="button" data-copy-code="range?: Range;" data-pagefind-ignore>Copy</button>

```ts generated
range?: Range;
```

</details>

<details class="api-member" id="workbook-table-patch-columns" data-pagefind-weight="1" open>
<summary><code>columns</code></summary>

<button class="api-copy" type="button" data-copy-code="columns?: WorkbookTableColumn[];" data-pagefind-ignore>Copy</button>

```ts generated
columns?: WorkbookTableColumn[];
```

</details>

<details class="api-member" id="workbook-table-patch-header-row" data-pagefind-weight="1" open>
<summary><code>headerRow</code></summary>

<button class="api-copy" type="button" data-copy-code="headerRow?: boolean;" data-pagefind-ignore>Copy</button>

```ts generated
headerRow?: boolean;
```

</details>

<details class="api-member" id="workbook-table-patch-totals-row" data-pagefind-weight="1" open>
<summary><code>totalsRow</code></summary>

<button class="api-copy" type="button" data-copy-code="totalsRow?: boolean;" data-pagefind-ignore>Copy</button>

```ts generated
totalsRow?: boolean;
```

</details>

<details class="api-member" id="workbook-table-patch-style" data-pagefind-weight="1" open>
<summary><code>style</code></summary>

<button class="api-copy" type="button" data-copy-code="style?: WorkbookTableStyle | null;" data-pagefind-ignore>Copy</button>

```ts generated
style?: WorkbookTableStyle | null;
```

</details>

<details class="api-member" id="workbook-table-patch-unsupported-features" data-pagefind-weight="1" open>
<summary><code>unsupportedFeatures</code></summary>

<button class="api-copy" type="button" data-copy-code="unsupportedFeatures?: WorkbookTableUnsupportedFeature[];" data-pagefind-ignore>Copy</button>

```ts generated
unsupportedFeatures?: WorkbookTableUnsupportedFeature[];
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface WorkbookTablePatch {&#10;  name?: string;&#10;  range?: Range;&#10;  columns?: WorkbookTableColumn[];&#10;  headerRow?: boolean;&#10;  totalsRow?: boolean;&#10;  style?: WorkbookTableStyle | null;&#10;  unsupportedFeatures?: WorkbookTableUnsupportedFeature[];&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
export interface WorkbookTablePatch {
  name?: string;
  range?: Range;
  columns?: WorkbookTableColumn[];
  headerRow?: boolean;
  totalsRow?: boolean;
  style?: WorkbookTableStyle | null;
  unsupportedFeatures?: WorkbookTableUnsupportedFeature[];
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

<p class="api-consumers-label">Public exports naming <code>WorkbookTablePatch</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/document-op/"><code>DocumentOp</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
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
