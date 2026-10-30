---
title: "FormulaFunctionMetadata | @sheetwrite/core/functions"
description: "FormulaFunctionMetadata interface in @sheetwrite/core/functions: One metadata format for built-in and host functions."
---
<!-- api-export:@sheetwrite/core|./functions|FormulaFunctionMetadata -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-functions/">@sheetwrite/core/functions</a><span class="api-status" data-kind="interface">interface</span></div>

One metadata format for built-in and host functions.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/functions/types.ts#L16"><code>packages/core/src/functions/types.ts#L16</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>6</span>

<div class="api-member-list">

<details class="api-member" id="formula-function-metadata-name" data-pagefind-weight="1">
<summary><code>name</code></summary>

```ts generated
readonly name: string;
```

</details>

<details class="api-member" id="formula-function-metadata-description" data-pagefind-weight="1">
<summary><code>description</code></summary>

```ts generated
readonly description: string;
```

</details>

<details class="api-member" id="formula-function-metadata-arguments" data-pagefind-weight="1">
<summary><code>arguments</code></summary>

```ts generated
readonly arguments: readonly FormulaArgumentMetadata[];
```

</details>

<details class="api-member" id="formula-function-metadata-return-kind" data-pagefind-weight="1">
<summary><code>returnKind</code></summary>

```ts generated
readonly returnKind: string;
```

</details>

<details class="api-member" id="formula-function-metadata-examples" data-pagefind-weight="1">
<summary><code>examples</code></summary>

```ts generated
readonly examples?: readonly string[];
```

</details>

<details class="api-member" id="formula-function-metadata-volatile" data-pagefind-weight="1">
<summary><code>volatile</code></summary>

```ts generated
readonly volatile?: boolean;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface FormulaFunctionMetadata {
  readonly name: string;
  readonly description: string;
  readonly arguments: readonly FormulaArgumentMetadata[];
  readonly returnKind: string;
  readonly examples?: readonly string[];
  readonly volatile?: boolean;
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

<p class="api-consumers-label">Public exports naming <code>FormulaFunctionMetadata</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core-functions/list-functions/"><code>listFunctions</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-functions/register-function/"><code>registerFunction</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
