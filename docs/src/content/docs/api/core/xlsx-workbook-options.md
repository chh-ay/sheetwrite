---
title: "XlsxWorkbookOptions | @sheetwrite/core"
description: "Shared options passed to every registered table and workbook XLSX backend."
---
<!-- api-export:@sheetwrite/core|.|XlsxWorkbookOptions -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Shared options passed to every registered table and workbook XLSX backend.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/export.ts#L407</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>4</span>

<div class="api-member-list">

<details class="api-member" id="xlsx-workbook-options-signal" data-pagefind-weight="1" open>
<summary><code>signal</code> <span class="api-member-summary">Abort before or between bounded codec operations.</span></summary>

<button class="api-copy" type="button" data-copy-code="signal?: AbortSignal;" data-pagefind-ignore>Copy</button>

```ts generated
signal?: AbortSignal;
```

</details>

<details class="api-member" id="xlsx-workbook-options-max-cells" data-pagefind-weight="1" open>
<summary><code>maxCells</code> <span class="api-member-summary">Cells accounted by the active conversion path; defaults to 1,000,000.</span></summary>

<button class="api-copy" type="button" data-copy-code="maxCells?: number;" data-pagefind-ignore>Copy</button>

```ts generated
maxCells?: number;
```

</details>

<details class="api-member" id="xlsx-workbook-options-resource-limits" data-pagefind-weight="1" open>
<summary><code>resourceLimits</code> <span class="api-member-summary">Positive overrides for every XLSX resource dimension except maxCells.</span></summary>

<button class="api-copy" type="button" data-copy-code="resourceLimits?: Partial&lt;Omit&lt;XlsxResourceLimits, &quot;maxCells&quot;&gt;&gt;;" data-pagefind-ignore>Copy</button>

```ts generated
resourceLimits?: Partial<Omit<XlsxResourceLimits, "maxCells">>;
```

</details>

<details class="api-member" id="xlsx-workbook-options-on-warning" data-pagefind-weight="1" open>
<summary><code>onWarning</code></summary>

<button class="api-copy" type="button" data-copy-code="onWarning?: (warning: XlsxWorkbookWarning) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
onWarning?: (warning: XlsxWorkbookWarning) => void;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface XlsxWorkbookOptions {&#10;  signal?: AbortSignal;&#10;  maxCells?: number;&#10;  resourceLimits?: Partial&lt;Omit&lt;XlsxResourceLimits, &quot;maxCells&quot;&gt;&gt;;&#10;  onWarning?: (warning: XlsxWorkbookWarning) =&gt; void;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
export interface XlsxWorkbookOptions {
  signal?: AbortSignal;
  maxCells?: number;
  resourceLimits?: Partial<Omit<XlsxResourceLimits, "maxCells">>;
  onWarning?: (warning: XlsxWorkbookWarning) => void;
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

<p class="api-consumers-label">Public exports naming <code>XlsxWorkbookOptions</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/from-xlsx-table/"><code>fromXlsxTable</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/from-xlsx-workbook/"><code>fromXlsxWorkbook</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/to-xlsx-table/"><code>toXlsxTable</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/to-xlsx-workbook/"><code>toXlsxWorkbook</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/xlsx-table-export-backend/"><code>XlsxTableExportBackend</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/xlsx-table-import-backend/"><code>XlsxTableImportBackend</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/xlsx-workbook-backend/"><code>XlsxWorkbookBackend</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
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
