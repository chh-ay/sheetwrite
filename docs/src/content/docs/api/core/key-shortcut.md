---
title: "KeyShortcut | @sheetwrite/core"
description: "A compact modified key combination or a key object."
---
<!-- api-export:@sheetwrite/core|.|KeyShortcut -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

A compact modified key combination or a key object. Modifiers may appear in
any order before the final key, for example "Mod+Shift+K" or "Ctrl+Alt+Delete".
`Mod`/`mod` means Command on macOS and Control elsewhere; Ctrl and Meta are literal.
The parser rejects unknown/repeated modifiers and missing keys.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/types/grid.ts#L352"><code>packages/core/src/types/grid.ts#L352</code></a></dd></div>
</dl>

## Variants <span class="api-count" data-pagefind-ignore>2</span>

<div class="api-variant-list" data-pagefind-ignore>
<div class="api-variant">

```ts generated
`${"Mod" | "Ctrl" | "Meta" | "Alt" | "Shift"}+${string}`
```

</div>
<div class="api-variant">

```ts generated
{
  key: string;
  mod?: boolean;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
}
```

</div>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export type KeyShortcut =
  | `${"Mod" | "Ctrl" | "Meta" | "Alt" | "Shift"}+${string}`
  | {
      key: string;
      mod?: boolean;
      ctrl?: boolean;
      meta?: boolean;
      shift?: boolean;
      alt?: boolean;
    };
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
