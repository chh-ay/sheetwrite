---
title: "PowerQueryUnsupported | @sheetwrite/core"
description: "PowerQueryUnsupported interface in @sheetwrite/core: An imported section member outside the supported subset, kept as text."
---
<!-- api-export:@sheetwrite/core|.|PowerQueryUnsupported -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

An imported section member outside the supported subset, kept as text.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/types/query.ts#L159"><code>packages/core/src/types/query.ts#L159</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>4</span>

<div class="api-member-list">

<details class="api-member" id="power-query-unsupported-member" data-pagefind-weight="1">
<summary><code>member</code></summary>

```ts generated
readonly member: string;
```

</details>

<details class="api-member" id="power-query-unsupported-reason" data-pagefind-weight="1">
<summary><code>reason</code> <span class="api-member-summary">Stable code, such as syntax, source, step or dependency.</span></summary>

```ts generated
readonly reason: string;
```

</details>

<details class="api-member" id="power-query-unsupported-detail" data-pagefind-weight="1">
<summary><code>detail</code> <span class="api-member-summary">The M function or form involved, if known.</span></summary>

```ts generated
readonly detail: string;
```

</details>

<details class="api-member" id="power-query-unsupported-text" data-pagefind-weight="1">
<summary><code>text</code> <span class="api-member-summary">The member's original text.</span></summary>

```ts generated
readonly text: string;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface PowerQueryUnsupported {
  readonly member: string;
  readonly reason: string;
  readonly detail: string;
  readonly text: string;
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
<li><code>@sheetwrite/queries</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/react</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/svelte</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/vue</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/xlsx</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>PowerQueryUnsupported</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/power-query-import/"><code>PowerQueryImport</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
