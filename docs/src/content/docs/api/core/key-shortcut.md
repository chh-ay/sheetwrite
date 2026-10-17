---
title: "KeyShortcut | @sheetwrite/core"
description: "A platform-neutral key combination."
---
<!-- api-export:@sheetwrite/core|.|KeyShortcut -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

A platform-neutral key combination. `mod` means Command on macOS, Control elsewhere.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/types/grid.ts#L252"><code>packages/core/src/types/grid.ts#L252</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>4</span>

<div class="api-member-list">

<details class="api-member" id="key-shortcut-key" data-pagefind-weight="1">
<summary><code>key</code></summary>

```ts generated
key: string;
```

</details>

<details class="api-member" id="key-shortcut-mod" data-pagefind-weight="1">
<summary><code>mod</code></summary>

```ts generated
mod?: boolean;
```

</details>

<details class="api-member" id="key-shortcut-shift" data-pagefind-weight="1">
<summary><code>shift</code></summary>

```ts generated
shift?: boolean;
```

</details>

<details class="api-member" id="key-shortcut-alt" data-pagefind-weight="1">
<summary><code>alt</code></summary>

```ts generated
alt?: boolean;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface KeyShortcut {
  key: string;
  mod?: boolean;
  shift?: boolean;
  alt?: boolean;
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

<p class="api-consumers-label">Public exports naming <code>KeyShortcut</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/context-menu-item/"><code>ContextMenuItem</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/keyboard-options/"><code>KeyboardOptions</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
