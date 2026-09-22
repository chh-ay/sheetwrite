---
title: "SpreadsheetShell | @sheetwrite/core/shell"
description: "Disposable controller for the framework-neutral spreadsheet shell."
---
<!-- api-export:@sheetwrite/core|./shell|SpreadsheetShell -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-shell/">@sheetwrite/core/shell</a><span class="api-status" data-kind="interface">interface</span></div>

Disposable controller for the framework-neutral spreadsheet shell.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core/shell</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/shell/spreadsheet-shell.ts#L35</code></dd></div>
</dl>

<nav class="api-member-index" aria-label="Member index" data-pagefind-ignore>
<a href="#spreadsheet-shell-grid"><code>grid</code></a>
<a href="#spreadsheet-shell-element"><code>element</code></a>
<a href="#spreadsheet-shell-set-theme"><code>setTheme</code></a>
<a href="#spreadsheet-shell-set-read-only"><code>setReadOnly</code></a>
<a href="#spreadsheet-shell-set-grid-config"><code>setGridConfig</code></a>
<a href="#spreadsheet-shell-set-active-sheet"><code>setActiveSheet</code></a>
<a href="#spreadsheet-shell-destroy"><code>destroy</code></a>
</nav>

## Members <span class="api-count" data-pagefind-ignore>7</span>

<div class="api-member-list">

<details class="api-member" id="spreadsheet-shell-grid" data-pagefind-weight="1" open>
<summary><code>grid</code> <span class="api-member-summary">The single grid the shell owns; use it for data, search, and actions.</span></summary>

<button class="api-copy" type="button" data-copy-code="readonly grid: Grid;" data-pagefind-ignore>Copy</button>

```ts generated
readonly grid: Grid;
```

</details>

<details class="api-member" id="spreadsheet-shell-element" data-pagefind-weight="1" open>
<summary><code>element</code> <span class="api-member-summary">The shell's root element (already appended to the mount host).</span></summary>

<button class="api-copy" type="button" data-copy-code="readonly element: HTMLElement;" data-pagefind-ignore>Copy</button>

```ts generated
readonly element: HTMLElement;
```

</details>

<details class="api-member" id="spreadsheet-shell-set-theme" data-pagefind-weight="1" open>
<summary><code>setTheme</code></summary>

<button class="api-copy" type="button" data-copy-code="setTheme(theme: Partial&lt;Theme&gt;): void;" data-pagefind-ignore>Copy</button>

```ts generated
setTheme(theme: Partial<Theme>): void;
```

</details>

<details class="api-member" id="spreadsheet-shell-set-read-only" data-pagefind-weight="1" open>
<summary><code>setReadOnly</code></summary>

<button class="api-copy" type="button" data-copy-code="setReadOnly(readOnly: boolean): void;" data-pagefind-ignore>Copy</button>

```ts generated
setReadOnly(readOnly: boolean): void;
```

</details>

<details class="api-member" id="spreadsheet-shell-set-grid-config" data-pagefind-weight="1" open>
<summary><code>setGridConfig</code> <span class="api-member-summary">Reconfigure the grid; the shell keeps its own toolbar/tabs suppressed.</span></summary>

<button class="api-copy" type="button" data-copy-code="setGridConfig(config: GridConfig | undefined): void;" data-pagefind-ignore>Copy</button>

```ts generated
setGridConfig(config: GridConfig | undefined): void;
```

</details>

<details class="api-member" id="spreadsheet-shell-set-active-sheet" data-pagefind-weight="1" open>
<summary><code>setActiveSheet</code></summary>

<button class="api-copy" type="button" data-copy-code="setActiveSheet(id: SheetId): void;" data-pagefind-ignore>Copy</button>

```ts generated
setActiveSheet(id: SheetId): void;
```

</details>

<details class="api-member" id="spreadsheet-shell-destroy" data-pagefind-weight="1" open>
<summary><code>destroy</code></summary>

<button class="api-copy" type="button" data-copy-code="destroy(): void;" data-pagefind-ignore>Copy</button>

```ts generated
destroy(): void;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface SpreadsheetShell {&#10;  readonly grid: Grid;&#10;  readonly element: HTMLElement;&#10;  setTheme(theme: Partial&lt;Theme&gt;): void;&#10;  setReadOnly(readOnly: boolean): void;&#10;  setGridConfig(config: GridConfig | undefined): void;&#10;  setActiveSheet(id: SheetId): void;&#10;  destroy(): void;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
export interface SpreadsheetShell {
  readonly grid: Grid;
  readonly element: HTMLElement;
  setTheme(theme: Partial<Theme>): void;
  setReadOnly(readOnly: boolean): void;
  setGridConfig(config: GridConfig | undefined): void;
  setActiveSheet(id: SheetId): void;
  destroy(): void;
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

<p class="api-consumers-label">Public exports naming <code>SpreadsheetShell</code></p>

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
