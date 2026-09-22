---
title: "Workbook | @sheetwrite/core"
description: "Live workbook schema containing ordered sheets and the active sheet ID."
---
<!-- api-export:@sheetwrite/core|.|Workbook -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Live workbook schema containing ordered sheets and the active sheet ID.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/document.ts#L109</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-member-list">

<details class="api-member" id="workbook-sheets" data-pagefind-weight="1" open>
<summary><code>sheets</code> <span class="api-member-summary">Sheets in display/tab order.</span></summary>

<button class="api-copy" type="button" data-copy-code="sheets: Sheet[];" data-pagefind-ignore>Copy</button>

```ts generated
sheets: Sheet[];
```

</details>

<details class="api-member" id="workbook-active-sheet" data-pagefind-weight="1" open>
<summary><code>activeSheet</code> <span class="api-member-summary">Active sheet ID and initial tab presented when the grid is created.</span></summary>

<button class="api-copy" type="button" data-copy-code="activeSheet: SheetId;" data-pagefind-ignore>Copy</button>

```ts generated
activeSheet: SheetId;
```

</details>

<details class="api-member" id="workbook-named-ranges" data-pagefind-weight="1" open>
<summary><code>namedRanges</code> <span class="api-member-summary">Formula names shared by the workbook or shadowed within a sheet scope.</span></summary>

<button class="api-copy" type="button" data-copy-code="namedRanges?: NamedRangeSnapshot[];" data-pagefind-ignore>Copy</button>

```ts generated
namedRanges?: NamedRangeSnapshot[];
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface Workbook {&#10;  sheets: Sheet[];&#10;  activeSheet: SheetId;&#10;  namedRanges?: NamedRangeSnapshot[];&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
export interface Workbook {
  sheets: Sheet[];
  activeSheet: SheetId;
  namedRanges?: NamedRangeSnapshot[];
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

<p class="api-consumers-label">Public exports naming <code>Workbook</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/grid-options/"><code>GridOptions</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/hyperlink-at/"><code>hyperlinkAt</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/resolve-hyperlink-target/"><code>resolveHyperlinkTarget</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/sheetwrite-store/"><code>SheetwriteStore</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/store/"><code>Store</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/to-xlsx-table/"><code>toXlsxTable</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/xlsx-table-export-backend/"><code>XlsxTableExportBackend</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-adapter/simple-grid-input/"><code>SimpleGridInput</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/react/sheetwrite-grid-props/"><code>SheetwriteGridProps</code></a><span class="api-consumer-kind">@sheetwrite/react</span></li>
<li><a href="/docs/api/vue/sheetwrite-grid-props/"><code>SheetwriteGridProps</code></a><span class="api-consumer-kind">@sheetwrite/vue</span></li>
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
