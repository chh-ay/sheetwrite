---
title: "SheetNameValidationResult | @sheetwrite/core"
description: "Successful canonical name or an actionable validation failure."
---
<!-- api-export:@sheetwrite/core|.|SheetNameValidationResult -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

Successful canonical name or an actionable validation failure.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/types/document.ts#L24"><code>packages/core/src/types/document.ts#L24</code></a></dd></div>
</dl>

## Variants <span class="api-count" data-pagefind-ignore>2</span>

<div class="api-variant-list" data-pagefind-ignore>
<div class="api-variant">

```ts generated
{
  readonly ok: true;
  readonly name: string;
  readonly key: string;
}
```

</div>
<div class="api-variant">

```ts generated
{
  readonly ok: false;
  readonly code: SheetNameIssueCode;
  readonly name: string;
  readonly key: string;
}
```

</div>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export type SheetNameValidationResult =
  | {
      readonly ok: true;
      readonly name: string;
      readonly key: string;
    }
  | {
      readonly ok: false;
      readonly code: SheetNameIssueCode;
      readonly name: string;
      readonly key: string;
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

<p class="api-consumers-label">Public exports naming <code>SheetNameValidationResult</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/validate-sheet-name/"><code>validateSheetName</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
