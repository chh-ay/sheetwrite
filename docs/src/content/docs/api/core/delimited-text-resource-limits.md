---
title: "DelimitedTextResourceLimits | @sheetwrite/core"
description: "Resource ceilings shared by synchronous CSV and TSV parsing and encoding."
---
<!-- api-export:@sheetwrite/core|.|DelimitedTextResourceLimits -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Resource ceilings shared by synchronous CSV and TSV parsing and encoding.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/delimited-text.ts#L3</code></dd></div>
</dl>

<nav class="api-member-index" aria-label="Member index" data-pagefind-ignore>
<a href="#delimited-text-resource-limits-max-input-bytes"><code>maxInputBytes</code></a>
<a href="#delimited-text-resource-limits-max-output-bytes"><code>maxOutputBytes</code></a>
<a href="#delimited-text-resource-limits-max-rows"><code>maxRows</code></a>
<a href="#delimited-text-resource-limits-max-columns"><code>maxColumns</code></a>
<a href="#delimited-text-resource-limits-max-cells"><code>maxCells</code></a>
<a href="#delimited-text-resource-limits-max-field-bytes"><code>maxFieldBytes</code></a>
<a href="#delimited-text-resource-limits-max-writer-window-rows"><code>maxWriterWindowRows</code></a>
</nav>

## Members <span class="api-count" data-pagefind-ignore>7</span>

<div class="api-member-list">

<details class="api-member" id="delimited-text-resource-limits-max-input-bytes" data-pagefind-weight="1" open>
<summary><code>maxInputBytes</code> <span class="api-member-summary">Input string size in UTF-8 bytes; defaults to 32 MiB.</span></summary>

<button class="api-copy" type="button" data-copy-code="maxInputBytes: number;" data-pagefind-ignore>Copy</button>

```ts generated
maxInputBytes: number;
```

</details>

<details class="api-member" id="delimited-text-resource-limits-max-output-bytes" data-pagefind-weight="1" open>
<summary><code>maxOutputBytes</code> <span class="api-member-summary">Output string size in UTF-8 bytes, including a BOM; defaults to 64 MiB.</span></summary>

<button class="api-copy" type="button" data-copy-code="maxOutputBytes: number;" data-pagefind-ignore>Copy</button>

```ts generated
maxOutputBytes: number;
```

</details>

<details class="api-member" id="delimited-text-resource-limits-max-rows" data-pagefind-weight="1" open>
<summary><code>maxRows</code> <span class="api-member-summary">Syntactically present records; defaults to 1,000,000.</span></summary>

<button class="api-copy" type="button" data-copy-code="maxRows: number;" data-pagefind-ignore>Copy</button>

```ts generated
maxRows: number;
```

</details>

<details class="api-member" id="delimited-text-resource-limits-max-columns" data-pagefind-weight="1" open>
<summary><code>maxColumns</code> <span class="api-member-summary">Fields in any one record; defaults to 16,384.</span></summary>

<button class="api-copy" type="button" data-copy-code="maxColumns: number;" data-pagefind-ignore>Copy</button>

```ts generated
maxColumns: number;
```

</details>

<details class="api-member" id="delimited-text-resource-limits-max-cells" data-pagefind-weight="1" open>
<summary><code>maxCells</code> <span class="api-member-summary">Aggregate fields across all records; defaults to 1,000,000.</span></summary>

<button class="api-copy" type="button" data-copy-code="maxCells: number;" data-pagefind-ignore>Copy</button>

```ts generated
maxCells: number;
```

</details>

<details class="api-member" id="delimited-text-resource-limits-max-field-bytes" data-pagefind-weight="1" open>
<summary><code>maxFieldBytes</code> <span class="api-member-summary">Decoded UTF-8 bytes in one field; defaults to 1 MiB.</span></summary>

<button class="api-copy" type="button" data-copy-code="maxFieldBytes: number;" data-pagefind-ignore>Copy</button>

```ts generated
maxFieldBytes: number;
```

</details>

<details class="api-member" id="delimited-text-resource-limits-max-writer-window-rows" data-pagefind-weight="1" open>
<summary><code>maxWriterWindowRows</code> <span class="api-member-summary">Rows fetched by an export writer in one packed store read; defaults to 4,096.</span></summary>

<button class="api-copy" type="button" data-copy-code="maxWriterWindowRows: number;" data-pagefind-ignore>Copy</button>

```ts generated
maxWriterWindowRows: number;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface DelimitedTextResourceLimits {&#10;  maxInputBytes: number;&#10;  maxOutputBytes: number;&#10;  maxRows: number;&#10;  maxColumns: number;&#10;  maxCells: number;&#10;  maxFieldBytes: number;&#10;  maxWriterWindowRows: number;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
export interface DelimitedTextResourceLimits {
  maxInputBytes: number;
  maxOutputBytes: number;
  maxRows: number;
  maxColumns: number;
  maxCells: number;
  maxFieldBytes: number;
  maxWriterWindowRows: number;
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

<p class="api-consumers-label">Public exports naming <code>DelimitedTextResourceLimits</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/default-delimited-text-resource-limits/"><code>DEFAULT_DELIMITED_TEXT_RESOURCE_LIMITS</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/delimited-text-options/"><code>DelimitedTextOptions</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/delimited-text-options-error/"><code>DelimitedTextOptionsError</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/delimited-text-resource-error/"><code>DelimitedTextResourceError</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
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
