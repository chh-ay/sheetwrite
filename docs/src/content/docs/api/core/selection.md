---
title: "Selection | @sheetwrite/core"
description: "Current cell, range, row, column, or multi-range selection."
---
<!-- api-export:@sheetwrite/core|.|Selection -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

Current cell, range, row, column, or multi-range selection.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/coordinates.ts#L48</code></dd></div>
</dl>

## Variants <span class="api-count" data-pagefind-ignore>5</span>

<div class="api-variant-list" data-pagefind-ignore>
<div class="api-variant">

<button class="api-copy" type="button" data-copy-code="{ kind: &quot;cell&quot;; addr: CellAddress }" data-pagefind-ignore>Copy</button>

```ts generated
{ kind: "cell"; addr: CellAddress }
```

</div>
<div class="api-variant">

<button class="api-copy" type="button" data-copy-code="{ kind: &quot;range&quot;; range: Range }" data-pagefind-ignore>Copy</button>

```ts generated
{ kind: "range"; range: Range }
```

</div>
<div class="api-variant">

<button class="api-copy" type="button" data-copy-code="{ kind: &quot;row&quot;; sheet: SheetId; row: number }" data-pagefind-ignore>Copy</button>

```ts generated
{ kind: "row"; sheet: SheetId; row: number }
```

</div>
<div class="api-variant">

<button class="api-copy" type="button" data-copy-code="{ kind: &quot;column&quot;; sheet: SheetId; col: number }" data-pagefind-ignore>Copy</button>

```ts generated
{ kind: "column"; sheet: SheetId; col: number }
```

</div>
<div class="api-variant">

<button class="api-copy" type="button" data-copy-code="{ kind: &quot;multi&quot;; ranges: Range[] }" data-pagefind-ignore>Copy</button>

```ts generated
{ kind: "multi"; ranges: Range[] }
```

</div>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export type Selection =&#10;  | {&#10;      kind: &quot;cell&quot;;&#10;      addr: CellAddress;&#10;    }&#10;  | {&#10;      kind: &quot;range&quot;;&#10;      range: Range;&#10;    }&#10;  | {&#10;      kind: &quot;row&quot;;&#10;      sheet: SheetId;&#10;      row: number;&#10;    }&#10;  | {&#10;      kind: &quot;column&quot;;&#10;      sheet: SheetId;&#10;      col: number;&#10;    }&#10;  | {&#10;      kind: &quot;multi&quot;;&#10;      ranges: Range[];&#10;    };" data-pagefind-ignore>Copy</button>

```ts generated
export type Selection =
  | {
      kind: "cell";
      addr: CellAddress;
    }
  | {
      kind: "range";
      range: Range;
    }
  | {
      kind: "row";
      sheet: SheetId;
      row: number;
    }
  | {
      kind: "column";
      sheet: SheetId;
      col: number;
    }
  | {
      kind: "multi";
      ranges: Range[];
    };
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

<p class="api-consumers-label">Public exports naming <code>Selection</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/grid/"><code>Grid</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/grid-events/"><code>GridEvents</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-adapter/grid-adapter-event-handlers/"><code>GridAdapterEventHandlers</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-adapter/grid-controller-handlers/"><code>GridControllerHandlers</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-shell/describe-selection/"><code>describeSelection</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-shell/spreadsheet-shell-options/"><code>SpreadsheetShellOptions</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/react/grid/"><code>Grid</code></a><span class="api-consumer-kind">@sheetwrite/react</span></li>
<li><a href="/docs/api/react/sheetwrite-grid-props/"><code>SheetwriteGridProps</code></a><span class="api-consumer-kind">@sheetwrite/react</span></li>
<li><a href="/docs/api/svelte/grid/"><code>Grid</code></a><span class="api-consumer-kind">@sheetwrite/svelte</span></li>
<li><a href="/docs/api/svelte/sheetwrite-grid-props/"><code>SheetwriteGridProps</code></a><span class="api-consumer-kind">@sheetwrite/svelte</span></li>
<li><a href="/docs/api/vue/grid/"><code>Grid</code></a><span class="api-consumer-kind">@sheetwrite/vue</span></li>
<li><a href="/docs/api/vue/sheetwrite-grid-emits/"><code>SheetwriteGridEmits</code></a><span class="api-consumer-kind">@sheetwrite/vue</span></li>
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
