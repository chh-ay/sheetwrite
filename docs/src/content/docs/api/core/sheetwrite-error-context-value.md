---
title: "SheetwriteErrorContextValue | @sheetwrite/core"
description: "JSON-safe values accepted in a public failure context."
---
<!-- api-export:@sheetwrite/core|.|SheetwriteErrorContextValue -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

JSON-safe values accepted in a public failure context.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/errors.ts#L87"><code>packages/core/src/errors.ts#L87</code></a></dd></div>
</dl>

## Variants <span class="api-count" data-pagefind-ignore>6</span>

<div class="api-variant-list" data-pagefind-ignore>
<div class="api-variant">

```ts generated
null
```

</div>
<div class="api-variant">

```ts generated
string
```

</div>
<div class="api-variant">

```ts generated
number
```

</div>
<div class="api-variant">

```ts generated
boolean
```

</div>
<div class="api-variant">

```ts generated
readonly SheetwriteErrorContextValue[]
```

</div>
<div class="api-variant">

```ts generated
{ readonly [key: string]: SheetwriteErrorContextValue }
```

</div>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export type SheetwriteErrorContextValue =
  | null
  | string
  | number
  | boolean
  | readonly SheetwriteErrorContextValue[]
  | {
      readonly [key: string]: SheetwriteErrorContextValue;
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

<p class="api-consumers-label">Public exports naming <code>SheetwriteErrorContextValue</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/sheetwrite-error/"><code>SheetwriteError</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/sheetwrite-error-context/"><code>SheetwriteErrorContext</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-adapter/sheetwrite-error/"><code>SheetwriteError</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-adapter/sheetwrite-error-context/"><code>SheetwriteErrorContext</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
