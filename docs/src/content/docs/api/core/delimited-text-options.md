---
title: "DelimitedTextOptions | @sheetwrite/core"
description: "Optional resource ceilings for an in-memory delimited-text operation."
---
<!-- api-export:@sheetwrite/core|.|DelimitedTextOptions -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Optional resource ceilings for an in-memory delimited-text operation.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/delimited-text.ts#L21"><code>packages/core/src/delimited-text.ts#L21</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>1</span>

<div class="api-member-list">

<details class="api-member" id="delimited-text-options-resource-limits" data-pagefind-weight="1">
<summary><code>resourceLimits</code> <span class="api-member-summary">Positive safe-integer overrides merged over DEFAULTDELIMITEDTEXTRESOURCELIMITS.</span></summary>

```ts generated
resourceLimits?: Partial<DelimitedTextResourceLimits>;
```

<p class="api-member-doc">Positive safe-integer overrides merged over `DEFAULT_DELIMITED_TEXT_RESOURCE_LIMITS`.</p>
</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface DelimitedTextOptions {
  resourceLimits?: Partial<DelimitedTextResourceLimits>;
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

<p class="api-consumers-label">Public exports naming <code>DelimitedTextOptions</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/from-csv/"><code>fromCsv</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/parse-csv/"><code>parseCsv</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/to-csv/"><code>toCsv</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/to-tsv/"><code>toTsv</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
