---
title: "XlsxResourceError | @sheetwrite/core"
description: "Stable resource-limit failure surfaced before an XLSX codec allocates unsafe data."
---
<!-- api-export:@sheetwrite/core|.|XlsxResourceError -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="class">class</span></div>

Stable resource-limit failure surfaced before an XLSX codec allocates unsafe data.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/export.ts#L302"><code>packages/core/src/export.ts#L302</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>5</span>

<div class="api-member-list">

<details class="api-member" id="xlsx-resource-error-constructor" data-pagefind-weight="1">
<summary><code>constructor</code></summary>

```ts generated
constructor(resource: keyof XlsxResourceLimits, limit: number, actual: number, operation: "import" | "export");
```

</details>

<details class="api-member" id="xlsx-resource-error-actual" data-pagefind-weight="1">
<summary><code>actual</code></summary>

```ts generated
actual: number;
```

</details>

<details class="api-member" id="xlsx-resource-error-limit" data-pagefind-weight="1">
<summary><code>limit</code></summary>

```ts generated
limit: number;
```

</details>

<details class="api-member" id="xlsx-resource-error-name" data-pagefind-weight="1">
<summary><code>name</code></summary>

```ts generated
name: "XlsxResourceError";
```

</details>

<details class="api-member" id="xlsx-resource-error-resource" data-pagefind-weight="1">
<summary><code>resource</code></summary>

```ts generated
resource: keyof XlsxResourceLimits
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
class XlsxResourceError extends SheetwriteError {
  constructor(
    resource: keyof XlsxResourceLimits,
    limit: number,
    actual: number,
    operation: "import" | "export",
  );
  actual: number;
  limit: number;
  name: "XlsxResourceError";
  resource: keyof XlsxResourceLimits;
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

<p class="api-consumers-label">Public exports naming <code>XlsxResourceError</code></p>

<ul class="api-consumer-list">
<li>None.</li>
</ul>
</div>
