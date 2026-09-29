---
title: "DelimitedTextOptionsError | @sheetwrite/core"
description: "Stable invalid-option failure for a delimited-text resource ceiling."
---
<!-- api-export:@sheetwrite/core|.|DelimitedTextOptionsError -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="class">class</span></div>

Stable invalid-option failure for a delimited-text resource ceiling.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/delimited-text.ts#L71"><code>packages/core/src/delimited-text.ts#L71</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>4</span>

<div class="api-member-list">

<details class="api-member" id="delimited-text-options-error-constructor" data-pagefind-weight="1">
<summary><code>constructor</code></summary>

```ts generated
constructor(resource: keyof DelimitedTextResourceLimits, value: unknown);
```

</details>

<details class="api-member" id="delimited-text-options-error-name" data-pagefind-weight="1">
<summary><code>name</code></summary>

```ts generated
name: "DelimitedTextOptionsError";
```

</details>

<details class="api-member" id="delimited-text-options-error-resource" data-pagefind-weight="1">
<summary><code>resource</code></summary>

```ts generated
resource: keyof DelimitedTextResourceLimits;
```

</details>

<details class="api-member" id="delimited-text-options-error-value" data-pagefind-weight="1">
<summary><code>value</code></summary>

```ts generated
value: unknown
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
class DelimitedTextOptionsError extends SheetwriteError {
  constructor(resource: keyof DelimitedTextResourceLimits, value: unknown);
  name: "DelimitedTextOptionsError";
  resource: keyof DelimitedTextResourceLimits;
  value: unknown;
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

<p class="api-consumers-label">Public exports naming <code>DelimitedTextOptionsError</code></p>

<ul class="api-consumer-list">
<li>None.</li>
</ul>
</div>
