---
title: "CellEditorContext | @sheetwrite/react"
description: "Immutable state and guarded completion callbacks for one mounted editor."
---
<!-- api-export:@sheetwrite/react|.|CellEditorContext -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/react/">@sheetwrite/react</a><span class="api-status" data-kind="interface">interface</span></div>

Immutable state and guarded completion callbacks for one mounted editor.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/react</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/dist/types/grid.d.ts#L21</code></dd></div>
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

<details class="api-member" id="cell-editor-context-grid" data-pagefind-weight="1" open>
<summary><code>grid</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly grid: Grid;" data-pagefind-ignore>Copy</button>

```ts generated
readonly grid: Grid;
```

</details>

<details class="api-member" id="cell-editor-context-address" data-pagefind-weight="1" open>
<summary><code>address</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly address: Readonly&lt;CellAddress&gt;;" data-pagefind-ignore>Copy</button>

```ts generated
readonly address: Readonly<CellAddress>;
```

</details>

<details class="api-member" id="cell-editor-context-view-address" data-pagefind-weight="1" open>
<summary><code>viewAddress</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly viewAddress: Readonly&lt;CellAddress&gt;;" data-pagefind-ignore>Copy</button>

```ts generated
readonly viewAddress: Readonly<CellAddress>;
```

</details>

<details class="api-member" id="cell-editor-context-column" data-pagefind-weight="1" open>
<summary><code>column</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly column: Readonly&lt;Column&gt;;" data-pagefind-ignore>Copy</button>

```ts generated
readonly column: Readonly<Column>;
```

</details>

<details class="api-member" id="cell-editor-context-value" data-pagefind-weight="1" open>
<summary><code>value</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly value: CellScalar;" data-pagefind-ignore>Copy</button>

```ts generated
readonly value: CellScalar;
```

</details>

<details class="api-member" id="cell-editor-context-text" data-pagefind-weight="1" open>
<summary><code>text</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly text: string;" data-pagefind-ignore>Copy</button>

```ts generated
readonly text: string;
```

</details>

<details class="api-member" id="cell-editor-context-initial-input" data-pagefind-weight="1" open>
<summary><code>initialInput</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly initialInput: string | undefined;" data-pagefind-ignore>Copy</button>

```ts generated
readonly initialInput: string | undefined;
```

</details>

<details class="api-member" id="cell-editor-context-select-all" data-pagefind-weight="1" open>
<summary><code>selectAll</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly selectAll: boolean;" data-pagefind-ignore>Copy</button>

```ts generated
readonly selectAll: boolean;
```

</details>

<details class="api-member" id="cell-editor-context-label" data-pagefind-weight="1" open>
<summary><code>label</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly label: string;" data-pagefind-ignore>Copy</button>

```ts generated
readonly label: string;
```

</details>

<details class="api-member" id="cell-editor-context-signal" data-pagefind-weight="1" open>
<summary><code>signal</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly signal: AbortSignal;" data-pagefind-ignore>Copy</button>

```ts generated
readonly signal: AbortSignal;
```

</details>

<details class="api-member" id="cell-editor-context-commit" data-pagefind-weight="1" open>
<summary><code>commit</code></summary>

<button class="api-copy" type="button" data-copy-code="commit(value: string, navigation?: CellEditorNavigation): void;" data-pagefind-ignore>Copy</button>

```ts generated
commit(value: string, navigation?: CellEditorNavigation): void;
```

</details>

<details class="api-member" id="cell-editor-context-cancel" data-pagefind-weight="1" open>
<summary><code>cancel</code></summary>

<button class="api-copy" type="button" data-copy-code="cancel(): void;" data-pagefind-ignore>Copy</button>

```ts generated
cancel(): void;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface CellEditorContext {&#10;  readonly grid: Grid;&#10;  readonly address: Readonly&lt;CellAddress&gt;;&#10;  readonly viewAddress: Readonly&lt;CellAddress&gt;;&#10;  readonly column: Readonly&lt;Column&gt;;&#10;  readonly value: CellScalar;&#10;  readonly text: string;&#10;  readonly initialInput: string | undefined;&#10;  readonly selectAll: boolean;&#10;  readonly label: string;&#10;  readonly signal: AbortSignal;&#10;  commit(value: string, navigation?: CellEditorNavigation): void;&#10;  cancel(): void;&#10;}" data-pagefind-ignore>Copy</button>

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
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/react</code></p>

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
