---
title: "SpreadsheetShell | @sheetwrite/core/shell"
description: "Disposable controller for the framework-neutral spreadsheet shell."
---
<!-- api-export:@sheetwrite/core|./shell|SpreadsheetShell -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-shell/">@sheetwrite/core/shell</a><span class="api-status" data-kind="interface">interface</span></div>

Disposable controller for the framework-neutral spreadsheet shell.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/shell/spreadsheet-shell.ts#L35"><code>packages/core/src/shell/spreadsheet-shell.ts#L35</code></a></dd></div>
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

<details class="api-member" id="spreadsheet-shell-grid" data-pagefind-weight="1">
<summary><code>grid</code> <span class="api-member-summary">The single grid the shell owns; use it for data, search, and actions.</span></summary>

```ts generated
readonly grid: Grid;
```

</details>

<details class="api-member" id="spreadsheet-shell-element" data-pagefind-weight="1">
<summary><code>element</code> <span class="api-member-summary">The shell's root element (already appended to the mount host).</span></summary>

```ts generated
readonly element: HTMLElement;
```

</details>

<details class="api-member" id="spreadsheet-shell-set-theme" data-pagefind-weight="1">
<summary><code>setTheme</code></summary>

```ts generated
setTheme(theme: Partial<Theme>): void;
```

</details>

<details class="api-member" id="spreadsheet-shell-set-read-only" data-pagefind-weight="1">
<summary><code>setReadOnly</code></summary>

```ts generated
setReadOnly(readOnly: boolean): void;
```

</details>

<details class="api-member" id="spreadsheet-shell-set-grid-config" data-pagefind-weight="1">
<summary><code>setGridConfig</code> <span class="api-member-summary">Reconfigure the grid; the shell keeps its own toolbar/tabs suppressed.</span></summary>

```ts generated
setGridConfig(config: GridConfig | undefined): void;
```

</details>

<details class="api-member" id="spreadsheet-shell-set-active-sheet" data-pagefind-weight="1">
<summary><code>setActiveSheet</code></summary>

```ts generated
setActiveSheet(id: SheetId): void;
```

</details>

<details class="api-member" id="spreadsheet-shell-destroy" data-pagefind-weight="1">
<summary><code>destroy</code></summary>

```ts generated
destroy(): void;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

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
