---
title: "FormulaArgumentMetadata | @sheetwrite/core/functions"
description: "FormulaArgumentMetadata interface in @sheetwrite/core/functions: Argument documentation used by built-in and host functions."
---
<!-- api-export:@sheetwrite/core|./functions|FormulaArgumentMetadata -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-functions/">@sheetwrite/core/functions</a><span class="api-status" data-kind="interface">interface</span></div>

Argument documentation used by built-in and host functions. Types are descriptive, not coercion rules.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/functions/types.ts#L8"><code>packages/core/src/functions/types.ts#L8</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>4</span>

<div class="api-member-list">

<details class="api-member" id="formula-argument-metadata-name" data-pagefind-weight="1">
<summary><code>name</code></summary>

```ts generated
readonly name: string;
```

</details>

<details class="api-member" id="formula-argument-metadata-types" data-pagefind-weight="1">
<summary><code>types</code></summary>

```ts generated
readonly types: readonly string[];
```

</details>

<details class="api-member" id="formula-argument-metadata-optional" data-pagefind-weight="1">
<summary><code>optional</code></summary>

```ts generated
readonly optional?: boolean;
```

</details>

<details class="api-member" id="formula-argument-metadata-repeating" data-pagefind-weight="1">
<summary><code>repeating</code></summary>

```ts generated
readonly repeating?: boolean;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface FormulaArgumentMetadata {
  readonly name: string;
  readonly types: readonly string[];
  readonly optional?: boolean;
  readonly repeating?: boolean;
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

<p class="api-consumers-label">Public exports naming <code>FormulaArgumentMetadata</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core-functions/formula-function-metadata/"><code>FormulaFunctionMetadata</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
