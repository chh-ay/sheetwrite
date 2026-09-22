---
title: "XlsxWorkbookWarning | @sheetwrite/core"
description: "Structured fidelity warning emitted during XLSX conversion."
---
<!-- api-export:@sheetwrite/core|.|XlsxWorkbookWarning -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Structured fidelity warning emitted during XLSX conversion.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/export.ts#L388</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>5</span>

<div class="api-member-list">

<details class="api-member" id="xlsx-workbook-warning-code" data-pagefind-weight="1">
<summary><code>code</code></summary>

<button class="api-copy" type="button" data-copy-code="code: | &quot;boolean-literal&quot; | &quot;rich-text&quot; | &quot;hyperlink&quot; | &quot;unsupported-cell-value&quot; | &quot;unsupported-feature&quot; | &quot;external-relationship&quot; | &quot;external-formula&quot; | &quot;format-loss&quot; | &quot;validation-loss&quot; | &quot;invalid-metadata&quot;;" data-pagefind-ignore>Copy</button>

```ts generated
code: | "boolean-literal" | "rich-text" | "hyperlink" | "unsupported-cell-value" | "unsupported-feature" | "external-relationship" | "external-formula" | "format-loss" | "validation-loss" | "invalid-metadata";
```

</details>

<details class="api-member" id="xlsx-workbook-warning-message" data-pagefind-weight="1" open>
<summary><code>message</code></summary>

<button class="api-copy" type="button" data-copy-code="message: string;" data-pagefind-ignore>Copy</button>

```ts generated
message: string;
```

</details>

<details class="api-member" id="xlsx-workbook-warning-sheet" data-pagefind-weight="1" open>
<summary><code>sheet</code></summary>

<button class="api-copy" type="button" data-copy-code="sheet?: string;" data-pagefind-ignore>Copy</button>

```ts generated
sheet?: string;
```

</details>

<details class="api-member" id="xlsx-workbook-warning-cell" data-pagefind-weight="1" open>
<summary><code>cell</code></summary>

<button class="api-copy" type="button" data-copy-code="cell?: string;" data-pagefind-ignore>Copy</button>

```ts generated
cell?: string;
```

</details>

<details class="api-member" id="xlsx-workbook-warning-part" data-pagefind-weight="1" open>
<summary><code>part</code></summary>

<button class="api-copy" type="button" data-copy-code="part?: string;" data-pagefind-ignore>Copy</button>

```ts generated
part?: string;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface XlsxWorkbookWarning {&#10;  code:&#10;    | &quot;boolean-literal&quot;&#10;    | &quot;rich-text&quot;&#10;    | &quot;hyperlink&quot;&#10;    | &quot;unsupported-cell-value&quot;&#10;    | &quot;unsupported-feature&quot;&#10;    | &quot;external-relationship&quot;&#10;    | &quot;external-formula&quot;&#10;    | &quot;format-loss&quot;&#10;    | &quot;validation-loss&quot;&#10;    | &quot;invalid-metadata&quot;;&#10;  message: string;&#10;  sheet?: string;&#10;  cell?: string;&#10;  part?: string;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
export interface XlsxWorkbookWarning {
  code:
    | "boolean-literal"
    | "rich-text"
    | "hyperlink"
    | "unsupported-cell-value"
    | "unsupported-feature"
    | "external-relationship"
    | "external-formula"
    | "format-loss"
    | "validation-loss"
    | "invalid-metadata";
  message: string;
  sheet?: string;
  cell?: string;
  part?: string;
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

<p class="api-consumers-label">Public exports naming <code>XlsxWorkbookWarning</code></p>

<ul class="api-consumer-list">
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
