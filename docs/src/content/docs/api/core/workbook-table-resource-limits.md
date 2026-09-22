---
title: "WorkbookTableResourceLimits | @sheetwrite/core"
description: "Resource ceilings for canonical workbook-table metadata and identifiers."
---
<!-- api-export:@sheetwrite/core|.|WorkbookTableResourceLimits -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Resource ceilings for canonical workbook-table metadata and identifiers.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/workbook-table.ts#L11</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>6</span>

<div class="api-member-list">

<details class="api-member" id="workbook-table-resource-limits-max-tables" data-pagefind-weight="1" open>
<summary><code>maxTables</code></summary>

<button class="api-copy" type="button" data-copy-code="maxTables: number;" data-pagefind-ignore>Copy</button>

```ts generated
maxTables: number;
```

</details>

<details class="api-member" id="workbook-table-resource-limits-max-columns-per-table" data-pagefind-weight="1" open>
<summary><code>maxColumnsPerTable</code></summary>

<button class="api-copy" type="button" data-copy-code="maxColumnsPerTable: number;" data-pagefind-ignore>Copy</button>

```ts generated
maxColumnsPerTable: number;
```

</details>

<details class="api-member" id="workbook-table-resource-limits-max-name-length" data-pagefind-weight="1" open>
<summary><code>maxNameLength</code></summary>

<button class="api-copy" type="button" data-copy-code="maxNameLength: number;" data-pagefind-ignore>Copy</button>

```ts generated
maxNameLength: number;
```

</details>

<details class="api-member" id="workbook-table-resource-limits-max-id-length" data-pagefind-weight="1" open>
<summary><code>maxIdLength</code></summary>

<button class="api-copy" type="button" data-copy-code="maxIdLength: number;" data-pagefind-ignore>Copy</button>

```ts generated
maxIdLength: number;
```

</details>

<details class="api-member" id="workbook-table-resource-limits-max-style-name-length" data-pagefind-weight="1" open>
<summary><code>maxStyleNameLength</code></summary>

<button class="api-copy" type="button" data-copy-code="maxStyleNameLength: number;" data-pagefind-ignore>Copy</button>

```ts generated
maxStyleNameLength: number;
```

</details>

<details class="api-member" id="workbook-table-resource-limits-max-unsupported-features-per-table" data-pagefind-weight="1" open>
<summary><code>maxUnsupportedFeaturesPerTable</code></summary>

<button class="api-copy" type="button" data-copy-code="maxUnsupportedFeaturesPerTable: number;" data-pagefind-ignore>Copy</button>

```ts generated
maxUnsupportedFeaturesPerTable: number;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface WorkbookTableResourceLimits {&#10;  maxTables: number;&#10;  maxColumnsPerTable: number;&#10;  maxNameLength: number;&#10;  maxIdLength: number;&#10;  maxStyleNameLength: number;&#10;  maxUnsupportedFeaturesPerTable: number;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
export interface WorkbookTableResourceLimits {
  maxTables: number;
  maxColumnsPerTable: number;
  maxNameLength: number;
  maxIdLength: number;
  maxStyleNameLength: number;
  maxUnsupportedFeaturesPerTable: number;
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

<p class="api-consumers-label">Public exports naming <code>WorkbookTableResourceLimits</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/assert-workbook-tables/"><code>assertWorkbookTables</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/default-workbook-table-resource-limits/"><code>DEFAULT_WORKBOOK_TABLE_RESOURCE_LIMITS</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/valid-workbook-table/"><code>validWorkbookTable</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
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
