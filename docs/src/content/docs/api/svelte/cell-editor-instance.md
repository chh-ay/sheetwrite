---
title: "CellEditorInstance | @sheetwrite/svelte"
description: "Retained lifecycle returned by a custom editor's mount method."
---
<!-- api-export:@sheetwrite/svelte|.|CellEditorInstance -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/svelte/">@sheetwrite/svelte</a><span class="api-status" data-kind="interface">interface</span></div>

Retained lifecycle returned by a custom editor's mount method.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/dist/types/grid.d.ts#L36"><code>packages/core/dist/types/grid.d.ts#L36</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>5</span>

<div class="api-member-list">

<details class="api-member" id="cell-editor-instance-update" data-pagefind-weight="1">
<summary><code>update</code></summary>

```ts generated
update(context: CellEditorContext): void;
```

</details>

<details class="api-member" id="cell-editor-instance-reposition" data-pagefind-weight="1">
<summary><code>reposition</code></summary>

```ts generated
reposition(rect: CellEditorRect): void;
```

</details>

<details class="api-member" id="cell-editor-instance-commit" data-pagefind-weight="1">
<summary><code>commit</code></summary>

```ts generated
commit(navigation: CellEditorNavigation): string | undefined | Promise<string | undefined>;
```

</details>

<details class="api-member" id="cell-editor-instance-cancel" data-pagefind-weight="1">
<summary><code>cancel</code></summary>

```ts generated
cancel(): void;
```

</details>

<details class="api-member" id="cell-editor-instance-destroy" data-pagefind-weight="1">
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
export interface CellEditorInstance {
  update(context: CellEditorContext): void;
  reposition(rect: CellEditorRect): void;
  commit(
    navigation: CellEditorNavigation,
  ): string | undefined | Promise<string | undefined>;
  cancel(): void;
  destroy(): void;
}
```

</details>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/svelte</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>CellEditorInstance</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/cell-editor/"><code>CellEditor</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/react/cell-editor/"><code>CellEditor</code></a><span class="api-consumer-kind">@sheetwrite/react</span></li>
<li><a href="/docs/api/svelte/cell-editor/"><code>CellEditor</code></a><span class="api-consumer-kind">@sheetwrite/svelte</span></li>
<li><a href="/docs/api/vue/cell-editor/"><code>CellEditor</code></a><span class="api-consumer-kind">@sheetwrite/vue</span></li>
</ul>
</div>
