---
title: "SpreadsheetShellOptions | @sheetwrite/core/shell"
description: "Host elements and feature options used to create a spreadsheet shell."
---
<!-- api-export:@sheetwrite/core|./shell|SpreadsheetShellOptions -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-shell/">@sheetwrite/core/shell</a><span class="api-status" data-kind="interface">interface</span></div>

Host elements and feature options used to create a spreadsheet shell.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core/shell</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/shell/spreadsheet-shell.ts#L23</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>5</span>

<div class="api-member-list">

<details class="api-member" id="spreadsheet-shell-options-grid" data-pagefind-weight="1" open>
<summary><code>grid</code> <span class="api-member-summary">Options for the single grid the shell owns.</span></summary>

<button class="api-copy" type="button" data-copy-code="grid: GridOptions;" data-pagefind-ignore>Copy</button>

```ts generated
grid: GridOptions;
```

<p class="api-member-doc">Options for the single grid the shell owns. `initSheetwrite` must already be awaited.</p>
</details>

<details class="api-member" id="spreadsheet-shell-options-toolbar" data-pagefind-weight="1" open>
<summary><code>toolbar</code> <span class="api-member-summary">Toolbar items (default: the full built-in action set).</span></summary>

<button class="api-copy" type="button" data-copy-code="toolbar?: readonly ToolbarItem[];" data-pagefind-ignore>Copy</button>

```ts generated
toolbar?: readonly ToolbarItem[];
```

</details>

<details class="api-member" id="spreadsheet-shell-options-on-change" data-pagefind-weight="1" open>
<summary><code>onChange</code> <span class="api-member-summary">Event callbacks forwarded from the owned grid.</span></summary>

<button class="api-copy" type="button" data-copy-code="onChange?: (event: ChangeEvent) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
onChange?: (event: ChangeEvent) => void;
```

</details>

<details class="api-member" id="spreadsheet-shell-options-on-selection-change" data-pagefind-weight="1" open>
<summary><code>onSelectionChange</code></summary>

<button class="api-copy" type="button" data-copy-code="onSelectionChange?: (selection: Selection | null) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
onSelectionChange?: (selection: Selection | null) => void;
```

</details>

<details class="api-member" id="spreadsheet-shell-options-on-ready" data-pagefind-weight="1" open>
<summary><code>onReady</code></summary>

<button class="api-copy" type="button" data-copy-code="onReady?: (grid: Grid) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
onReady?: (grid: Grid) => void;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface SpreadsheetShellOptions {&#10;  grid: GridOptions;&#10;  toolbar?: readonly ToolbarItem[];&#10;  onChange?: (event: ChangeEvent) =&gt; void;&#10;  onSelectionChange?: (selection: Selection | null) =&gt; void;&#10;  onReady?: (grid: Grid) =&gt; void;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
export interface SpreadsheetShellOptions {
  grid: GridOptions;
  toolbar?: readonly ToolbarItem[];
  onChange?: (event: ChangeEvent) => void;
  onSelectionChange?: (selection: Selection | null) => void;
  onReady?: (grid: Grid) => void;
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

<p class="api-consumers-label">Public exports naming <code>SpreadsheetShellOptions</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core-shell/create-spreadsheet-shell/"><code>createSpreadsheetShell</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
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
