---
title: "CellInputSnapshot | @sheetwrite/core"
description: "View-aware editable snapshot of one cell, for hosts building a detached formula bar or cell inspector."
---
<!-- api-export:@sheetwrite/core|.|CellInputSnapshot -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

View-aware editable snapshot of one cell, for hosts building a detached
formula bar or cell inspector. `address` is the translated *data* address —
the correct target for `Grid.applyTransaction` even under an active
sort/filter view — while the `(row, col)` inputs of
[`Grid.getCellInput`](/docs/api/core/grid/#grid-get-cell-input) are active-sheet view coordinates.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/grid.ts#L424</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-member-list">

<details class="api-member" id="cell-input-snapshot-address" data-pagefind-weight="1" open>
<summary><code>address</code> <span class="api-member-summary">Underlying data address, suitable for a set patch.</span></summary>

<button class="api-copy" type="button" data-copy-code="readonly address: CellAddress;" data-pagefind-ignore>Copy</button>

```ts generated
readonly address: CellAddress;
```

</details>

<details class="api-member" id="cell-input-snapshot-text" data-pagefind-weight="1" open>
<summary><code>text</code> <span class="api-member-summary">Formula source when the cell is a formula, else the literal display text.</span></summary>

<button class="api-copy" type="button" data-copy-code="readonly text: string;" data-pagefind-ignore>Copy</button>

```ts generated
readonly text: string;
```

</details>

<details class="api-member" id="cell-input-snapshot-format" data-pagefind-weight="1" open>
<summary><code>format</code> <span class="api-member-summary">Column input format, for parseCellInput.</span></summary>

<button class="api-copy" type="button" data-copy-code="readonly format: CellFormat;" data-pagefind-ignore>Copy</button>

```ts generated
readonly format: CellFormat;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface CellInputSnapshot {&#10;  readonly address: CellAddress;&#10;  readonly text: string;&#10;  readonly format: CellFormat;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
export interface CellInputSnapshot {
  readonly address: CellAddress;
  readonly text: string;
  readonly format: CellFormat;
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

<p class="api-consumers-label">Public exports naming <code>CellInputSnapshot</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/grid/"><code>Grid</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/react/grid/"><code>Grid</code></a><span class="api-consumer-kind">@sheetwrite/react</span></li>
<li><a href="/docs/api/svelte/grid/"><code>Grid</code></a><span class="api-consumer-kind">@sheetwrite/svelte</span></li>
<li><a href="/docs/api/vue/grid/"><code>Grid</code></a><span class="api-consumer-kind">@sheetwrite/vue</span></li>
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
