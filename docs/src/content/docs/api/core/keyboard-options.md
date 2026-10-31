---
title: "KeyboardOptions | @sheetwrite/core"
description: "KeyboardOptions interface in @sheetwrite/core: Overrides replace all default keys for an action; null disables that action's keys."
---
<!-- api-export:@sheetwrite/core|.|KeyboardOptions -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Overrides replace all default keys for an action; null disables that action's keys.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/types/grid.ts#L437"><code>packages/core/src/types/grid.ts#L437</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>1</span>

<div class="api-member-list">

<details class="api-member" id="keyboard-options-bindings" data-pagefind-weight="1">
<summary><code>bindings</code></summary>

```ts generated
bindings?: Partial<Record<KeyboardAction, KeyShortcut | readonly KeyShortcut[] | null>>;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface KeyboardOptions {
  bindings?: Partial<
    Record<KeyboardAction, KeyShortcut | readonly KeyShortcut[] | null>
  >;
}
```

</details>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/core</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/bench</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/charts</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/react</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/svelte</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/vue</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/xlsx</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>KeyboardOptions</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/grid-config/"><code>GridConfig</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
