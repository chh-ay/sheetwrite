---
title: "NamedRangeSnapshot | @sheetwrite/core"
description: "Workbook-global or sheet-scoped named range used by formulas and persistence."
---
<!-- api-export:@sheetwrite/core|.|NamedRangeSnapshot -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Workbook-global or sheet-scoped named range used by formulas and persistence.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/document.ts#L126</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-member-list">

<details class="api-member" id="named-range-snapshot-name" data-pagefind-weight="1" open>
<summary><code>name</code></summary>

<button class="api-copy" type="button" data-copy-code="name: string;" data-pagefind-ignore>Copy</button>

```ts generated
name: string;
```

</details>

<details class="api-member" id="named-range-snapshot-scope" data-pagefind-weight="1" open>
<summary><code>scope</code> <span class="api-member-summary">Formula-context sheet whose local definition shadows the workbook definition.</span></summary>

<button class="api-copy" type="button" data-copy-code="scope?: SheetId;" data-pagefind-ignore>Copy</button>

```ts generated
scope?: SheetId;
```

</details>

<details class="api-member" id="named-range-snapshot-range" data-pagefind-weight="1" open>
<summary><code>range</code></summary>

<button class="api-copy" type="button" data-copy-code="range: Range;" data-pagefind-ignore>Copy</button>

```ts generated
range: Range;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface NamedRangeSnapshot {&#10;  name: string;&#10;  scope?: SheetId;&#10;  range: Range;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
export interface NamedRangeSnapshot {
  name: string;
  scope?: SheetId;
  range: Range;
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

<p class="api-consumers-label">Public exports naming <code>NamedRangeSnapshot</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/document-op/"><code>DocumentOp</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/workbook/"><code>Workbook</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/workbook-snapshot/"><code>WorkbookSnapshot</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
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
