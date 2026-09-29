---
title: "ShellPiece | @sheetwrite/core/shell"
description: "A mounted shell piece: its root element plus an idempotent teardown."
---
<!-- api-export:@sheetwrite/core|./shell|ShellPiece -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-shell/">@sheetwrite/core/shell</a><span class="api-status" data-kind="interface">interface</span></div>

A mounted shell piece: its root element plus an idempotent teardown.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/shell/formula-controls.ts#L13"><code>packages/core/src/shell/formula-controls.ts#L13</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>2</span>

<div class="api-member-list">

<details class="api-member" id="shell-piece-element" data-pagefind-weight="1">
<summary><code>element</code></summary>

```ts generated
readonly element: HTMLElement;
```

</details>

<details class="api-member" id="shell-piece-destroy" data-pagefind-weight="1">
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
export interface ShellPiece {
  readonly element: HTMLElement;
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

<p class="api-consumers-label">Public exports naming <code>ShellPiece</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core-shell/create-name-box/"><code>createNameBox</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-shell/create-selection-status/"><code>createSelectionStatus</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-shell/create-toolbar/"><code>createToolbar</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
