---
title: "XlsxResourceLimits | @sheetwrite/core"
description: "Resource dimensions bounded by every XLSX import and export path."
---
<!-- api-export:@sheetwrite/core|.|XlsxResourceLimits -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Resource dimensions bounded by every XLSX import and export path.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/export.ts#L211</code></dd></div>
</dl>

<nav class="api-member-index" aria-label="Member index" data-pagefind-ignore>
<a href="#xlsx-resource-limits-max-input-bytes"><code>maxInputBytes</code></a>
<a href="#xlsx-resource-limits-max-output-bytes"><code>maxOutputBytes</code></a>
<a href="#xlsx-resource-limits-max-archive-entries"><code>maxArchiveEntries</code></a>
<a href="#xlsx-resource-limits-max-entry-uncompressed-bytes"><code>maxEntryUncompressedBytes</code></a>
<a href="#xlsx-resource-limits-max-total-uncompressed-bytes"><code>maxTotalUncompressedBytes</code></a>
<a href="#xlsx-resource-limits-max-compression-ratio"><code>maxCompressionRatio</code></a>
<a href="#xlsx-resource-limits-max-sheets"><code>maxSheets</code></a>
<a href="#xlsx-resource-limits-max-rows-per-sheet"><code>maxRowsPerSheet</code></a>
<a href="#xlsx-resource-limits-max-columns-per-sheet"><code>maxColumnsPerSheet</code></a>
<a href="#xlsx-resource-limits-max-cells"><code>maxCells</code></a>
<a href="#xlsx-resource-limits-max-merges"><code>maxMerges</code></a>
<a href="#xlsx-resource-limits-max-shared-strings"><code>maxSharedStrings</code></a>
<a href="#xlsx-resource-limits-max-styles"><code>maxStyles</code></a>
<a href="#xlsx-resource-limits-max-xml-elements"><code>maxXmlElements</code></a>
<a href="#xlsx-resource-limits-max-xml-depth"><code>maxXmlDepth</code></a>
<a href="#xlsx-resource-limits-max-xml-attributes-per-element"><code>maxXmlAttributesPerElement</code></a>
<a href="#xlsx-resource-limits-max-xml-text-bytes"><code>maxXmlTextBytes</code></a>
</nav>

## Members <span class="api-count" data-pagefind-ignore>17</span>

<div class="api-member-list">

<details class="api-member" id="xlsx-resource-limits-max-input-bytes" data-pagefind-weight="1" open>
<summary><code>maxInputBytes</code> <span class="api-member-summary">Compressed workbook input bytes; defaults to 32 MiB.</span></summary>

<button class="api-copy" type="button" data-copy-code="maxInputBytes: number;" data-pagefind-ignore>Copy</button>

```ts generated
maxInputBytes: number;
```

</details>

<details class="api-member" id="xlsx-resource-limits-max-output-bytes" data-pagefind-weight="1" open>
<summary><code>maxOutputBytes</code> <span class="api-member-summary">Encoded workbook output bytes; defaults to 128 MiB.</span></summary>

<button class="api-copy" type="button" data-copy-code="maxOutputBytes: number;" data-pagefind-ignore>Copy</button>

```ts generated
maxOutputBytes: number;
```

</details>

<details class="api-member" id="xlsx-resource-limits-max-archive-entries" data-pagefind-weight="1" open>
<summary><code>maxArchiveEntries</code> <span class="api-member-summary">ZIP archive entries; defaults to 1,024.</span></summary>

<button class="api-copy" type="button" data-copy-code="maxArchiveEntries: number;" data-pagefind-ignore>Copy</button>

```ts generated
maxArchiveEntries: number;
```

</details>

<details class="api-member" id="xlsx-resource-limits-max-entry-uncompressed-bytes" data-pagefind-weight="1" open>
<summary><code>maxEntryUncompressedBytes</code> <span class="api-member-summary">Uncompressed bytes in any one ZIP entry; defaults to 64 MiB.</span></summary>

<button class="api-copy" type="button" data-copy-code="maxEntryUncompressedBytes: number;" data-pagefind-ignore>Copy</button>

```ts generated
maxEntryUncompressedBytes: number;
```

</details>

<details class="api-member" id="xlsx-resource-limits-max-total-uncompressed-bytes" data-pagefind-weight="1" open>
<summary><code>maxTotalUncompressedBytes</code> <span class="api-member-summary">Aggregate uncompressed ZIP entry bytes; defaults to 256 MiB.</span></summary>

<button class="api-copy" type="button" data-copy-code="maxTotalUncompressedBytes: number;" data-pagefind-ignore>Copy</button>

```ts generated
maxTotalUncompressedBytes: number;
```

</details>

<details class="api-member" id="xlsx-resource-limits-max-compression-ratio" data-pagefind-weight="1" open>
<summary><code>maxCompressionRatio</code> <span class="api-member-summary">Uncompressed-to-compressed ratio for one ZIP entry; defaults to 100.</span></summary>

<button class="api-copy" type="button" data-copy-code="maxCompressionRatio: number;" data-pagefind-ignore>Copy</button>

```ts generated
maxCompressionRatio: number;
```

</details>

<details class="api-member" id="xlsx-resource-limits-max-sheets" data-pagefind-weight="1" open>
<summary><code>maxSheets</code> <span class="api-member-summary">Workbook worksheets; defaults to 256.</span></summary>

<button class="api-copy" type="button" data-copy-code="maxSheets: number;" data-pagefind-ignore>Copy</button>

```ts generated
maxSheets: number;
```

</details>

<details class="api-member" id="xlsx-resource-limits-max-rows-per-sheet" data-pagefind-weight="1" open>
<summary><code>maxRowsPerSheet</code> <span class="api-member-summary">Rows in any worksheet; defaults to 1,048,576.</span></summary>

<button class="api-copy" type="button" data-copy-code="maxRowsPerSheet: number;" data-pagefind-ignore>Copy</button>

```ts generated
maxRowsPerSheet: number;
```

</details>

<details class="api-member" id="xlsx-resource-limits-max-columns-per-sheet" data-pagefind-weight="1" open>
<summary><code>maxColumnsPerSheet</code> <span class="api-member-summary">Columns in any worksheet; defaults to 16,384.</span></summary>

<button class="api-copy" type="button" data-copy-code="maxColumnsPerSheet: number;" data-pagefind-ignore>Copy</button>

```ts generated
maxColumnsPerSheet: number;
```

</details>

<details class="api-member" id="xlsx-resource-limits-max-cells" data-pagefind-weight="1" open>
<summary><code>maxCells</code> <span class="api-member-summary">Cells accounted by the active conversion path; defaults to 1,000,000.</span></summary>

<button class="api-copy" type="button" data-copy-code="maxCells: number;" data-pagefind-ignore>Copy</button>

```ts generated
maxCells: number;
```

</details>

<details class="api-member" id="xlsx-resource-limits-max-merges" data-pagefind-weight="1" open>
<summary><code>maxMerges</code> <span class="api-member-summary">Aggregate merged ranges; defaults to 100,000.</span></summary>

<button class="api-copy" type="button" data-copy-code="maxMerges: number;" data-pagefind-ignore>Copy</button>

```ts generated
maxMerges: number;
```

</details>

<details class="api-member" id="xlsx-resource-limits-max-shared-strings" data-pagefind-weight="1" open>
<summary><code>maxSharedStrings</code> <span class="api-member-summary">Shared-string table entries; defaults to 1,000,000.</span></summary>

<button class="api-copy" type="button" data-copy-code="maxSharedStrings: number;" data-pagefind-ignore>Copy</button>

```ts generated
maxSharedStrings: number;
```

</details>

<details class="api-member" id="xlsx-resource-limits-max-styles" data-pagefind-weight="1" open>
<summary><code>maxStyles</code> <span class="api-member-summary">Style-related records; defaults to 65,536.</span></summary>

<button class="api-copy" type="button" data-copy-code="maxStyles: number;" data-pagefind-ignore>Copy</button>

```ts generated
maxStyles: number;
```

</details>

<details class="api-member" id="xlsx-resource-limits-max-xml-elements" data-pagefind-weight="1" open>
<summary><code>maxXmlElements</code> <span class="api-member-summary">Elements in any one XML part; defaults to 2,000,000.</span></summary>

<button class="api-copy" type="button" data-copy-code="maxXmlElements: number;" data-pagefind-ignore>Copy</button>

```ts generated
maxXmlElements: number;
```

</details>

<details class="api-member" id="xlsx-resource-limits-max-xml-depth" data-pagefind-weight="1" open>
<summary><code>maxXmlDepth</code> <span class="api-member-summary">Element nesting depth in any one XML part; defaults to 64.</span></summary>

<button class="api-copy" type="button" data-copy-code="maxXmlDepth: number;" data-pagefind-ignore>Copy</button>

```ts generated
maxXmlDepth: number;
```

</details>

<details class="api-member" id="xlsx-resource-limits-max-xml-attributes-per-element" data-pagefind-weight="1" open>
<summary><code>maxXmlAttributesPerElement</code> <span class="api-member-summary">Attributes on any one XML element; defaults to 128.</span></summary>

<button class="api-copy" type="button" data-copy-code="maxXmlAttributesPerElement: number;" data-pagefind-ignore>Copy</button>

```ts generated
maxXmlAttributesPerElement: number;
```

</details>

<details class="api-member" id="xlsx-resource-limits-max-xml-text-bytes" data-pagefind-weight="1" open>
<summary><code>maxXmlTextBytes</code> <span class="api-member-summary">UTF-8 text bytes in one XML element or attribute; defaults to 16 MiB.</span></summary>

<button class="api-copy" type="button" data-copy-code="maxXmlTextBytes: number;" data-pagefind-ignore>Copy</button>

```ts generated
maxXmlTextBytes: number;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface XlsxResourceLimits {&#10;  maxInputBytes: number;&#10;  maxOutputBytes: number;&#10;  maxArchiveEntries: number;&#10;  maxEntryUncompressedBytes: number;&#10;  maxTotalUncompressedBytes: number;&#10;  maxCompressionRatio: number;&#10;  maxSheets: number;&#10;  maxRowsPerSheet: number;&#10;  maxColumnsPerSheet: number;&#10;  maxCells: number;&#10;  maxMerges: number;&#10;  maxSharedStrings: number;&#10;  maxStyles: number;&#10;  maxXmlElements: number;&#10;  maxXmlDepth: number;&#10;  maxXmlAttributesPerElement: number;&#10;  maxXmlTextBytes: number;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
export interface XlsxResourceLimits {
  maxInputBytes: number;
  maxOutputBytes: number;
  maxArchiveEntries: number;
  maxEntryUncompressedBytes: number;
  maxTotalUncompressedBytes: number;
  maxCompressionRatio: number;
  maxSheets: number;
  maxRowsPerSheet: number;
  maxColumnsPerSheet: number;
  maxCells: number;
  maxMerges: number;
  maxSharedStrings: number;
  maxStyles: number;
  maxXmlElements: number;
  maxXmlDepth: number;
  maxXmlAttributesPerElement: number;
  maxXmlTextBytes: number;
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

<p class="api-consumers-label">Public exports naming <code>XlsxResourceLimits</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/default-xlsx-resource-limits/"><code>DEFAULT_XLSX_RESOURCE_LIMITS</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/xlsx-resource-error/"><code>XlsxResourceError</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/xlsx-workbook-options/"><code>XlsxWorkbookOptions</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
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
