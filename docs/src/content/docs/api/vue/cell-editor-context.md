---
title: "CellEditorContext | @sheetwrite/vue"
description: "Immutable state and guarded completion callbacks for one mounted editor."
---
<!-- api-export:@sheetwrite/vue|.|CellEditorContext -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/vue/">@sheetwrite/vue</a><span class="api-status" data-kind="interface">interface</span></div>

Immutable state and guarded completion callbacks for one mounted editor.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/dist/types/grid.d.ts#L21"><code>packages/core/dist/types/grid.d.ts#L21</code></a></dd></div>
</dl>

<nav class="api-member-index" aria-label="Member index" data-pagefind-ignore>
<a href="#cell-editor-context-grid"><code>grid</code></a>
<a href="#cell-editor-context-address"><code>address</code></a>
<a href="#cell-editor-context-view-address"><code>viewAddress</code></a>
<a href="#cell-editor-context-column"><code>column</code></a>
<a href="#cell-editor-context-value"><code>value</code></a>
<a href="#cell-editor-context-text"><code>text</code></a>
<a href="#cell-editor-context-initial-input"><code>initialInput</code></a>
<a href="#cell-editor-context-select-all"><code>selectAll</code></a>
<a href="#cell-editor-context-label"><code>label</code></a>
<a href="#cell-editor-context-signal"><code>signal</code></a>
<a href="#cell-editor-context-commit"><code>commit</code></a>
<a href="#cell-editor-context-cancel"><code>cancel</code></a>
</nav>

## Members <span class="api-count" data-pagefind-ignore>12</span>

<div class="api-member-list">

<details class="api-member" id="cell-editor-context-grid" data-pagefind-weight="1">
<summary><code>grid</code></summary>

```ts generated
readonly grid: Grid;
```

</details>

<details class="api-member" id="cell-editor-context-address" data-pagefind-weight="1">
<summary><code>address</code></summary>

```ts generated
readonly address: Readonly<CellAddress>;
```

</details>

<details class="api-member" id="cell-editor-context-view-address" data-pagefind-weight="1">
<summary><code>viewAddress</code></summary>

```ts generated
readonly viewAddress: Readonly<CellAddress>;
```

</details>

<details class="api-member" id="cell-editor-context-column" data-pagefind-weight="1">
<summary><code>column</code></summary>

```ts generated
readonly column: Readonly<Column>;
```

</details>

<details class="api-member" id="cell-editor-context-value" data-pagefind-weight="1">
<summary><code>value</code></summary>

```ts generated
readonly value: CellScalar;
```

</details>

<details class="api-member" id="cell-editor-context-text" data-pagefind-weight="1">
<summary><code>text</code></summary>

```ts generated
readonly text: string;
```

</details>

<details class="api-member" id="cell-editor-context-initial-input" data-pagefind-weight="1">
<summary><code>initialInput</code></summary>

```ts generated
readonly initialInput: string | undefined;
```

</details>

<details class="api-member" id="cell-editor-context-select-all" data-pagefind-weight="1">
<summary><code>selectAll</code></summary>

```ts generated
readonly selectAll: boolean;
```

</details>

<details class="api-member" id="cell-editor-context-label" data-pagefind-weight="1">
<summary><code>label</code></summary>

```ts generated
readonly label: string;
```

</details>

<details class="api-member" id="cell-editor-context-signal" data-pagefind-weight="1">
<summary><code>signal</code></summary>

```ts generated
readonly signal: AbortSignal;
```

</details>

<details class="api-member" id="cell-editor-context-commit" data-pagefind-weight="1">
<summary><code>commit</code></summary>

```ts generated
commit(value: string, navigation?: CellEditorNavigation): void;
```

</details>

<details class="api-member" id="cell-editor-context-cancel" data-pagefind-weight="1">
<summary><code>cancel</code></summary>

```ts generated
cancel(): void;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface CellEditorContext {
  readonly grid: Grid;
  readonly address: Readonly<CellAddress>;
  readonly viewAddress: Readonly<CellAddress>;
  readonly column: Readonly<Column>;
  readonly value: CellScalar;
  readonly text: string;
  readonly initialInput: string | undefined;
  readonly selectAll: boolean;
  readonly label: string;
  readonly signal: AbortSignal;
  commit(value: string, navigation?: CellEditorNavigation): void;
  cancel(): void;
}
```

</details>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/vue</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>CellEditorContext</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/cell-editor/"><code>CellEditor</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/cell-editor-instance/"><code>CellEditorInstance</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/react/cell-editor/"><code>CellEditor</code></a><span class="api-consumer-kind">@sheetwrite/react</span></li>
<li><a href="/docs/api/react/cell-editor-instance/"><code>CellEditorInstance</code></a><span class="api-consumer-kind">@sheetwrite/react</span></li>
<li><a href="/docs/api/svelte/cell-editor/"><code>CellEditor</code></a><span class="api-consumer-kind">@sheetwrite/svelte</span></li>
<li><a href="/docs/api/svelte/cell-editor-instance/"><code>CellEditorInstance</code></a><span class="api-consumer-kind">@sheetwrite/svelte</span></li>
<li><a href="/docs/api/vue/cell-editor/"><code>CellEditor</code></a><span class="api-consumer-kind">@sheetwrite/vue</span></li>
<li><a href="/docs/api/vue/cell-editor-instance/"><code>CellEditorInstance</code></a><span class="api-consumer-kind">@sheetwrite/vue</span></li>
</ul>
</div>
