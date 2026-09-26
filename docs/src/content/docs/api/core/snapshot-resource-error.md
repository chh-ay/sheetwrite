---
title: "SnapshotResourceError | @sheetwrite/core"
description: "Stable resource failure raised by direct workbook construction paths."
---
<!-- api-export:@sheetwrite/core|.|SnapshotResourceError -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="class">class</span></div>

Stable resource failure raised by direct workbook construction paths.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/document-protocol.ts#L194"><code>packages/core/src/document-protocol.ts#L194</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>5</span>

<div class="api-member-list">

<details class="api-member" id="snapshot-resource-error-constructor" data-pagefind-weight="1">
<summary><code>constructor</code></summary>

```ts generated
constructor(resource: keyof SnapshotResourceLimits, limit: number, actual: number, options?: ErrorOptions);
```

</details>

<details class="api-member" id="snapshot-resource-error-actual" data-pagefind-weight="1">
<summary><code>actual</code></summary>

```ts generated
actual: number;
```

</details>

<details class="api-member" id="snapshot-resource-error-limit" data-pagefind-weight="1">
<summary><code>limit</code></summary>

```ts generated
limit: number;
```

</details>

<details class="api-member" id="snapshot-resource-error-name" data-pagefind-weight="1">
<summary><code>name</code></summary>

```ts generated
name: "SnapshotResourceError";
```

</details>

<details class="api-member" id="snapshot-resource-error-resource" data-pagefind-weight="1">
<summary><code>resource</code></summary>

```ts generated
resource: keyof SnapshotResourceLimits
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
class SnapshotResourceError extends SheetwriteError {
  constructor(
    resource: keyof SnapshotResourceLimits,
    limit: number,
    actual: number,
    options?: ErrorOptions,
  );
  actual: number;
  limit: number;
  name: "SnapshotResourceError";
  resource: keyof SnapshotResourceLimits;
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

<p class="api-consumers-label">Public exports naming <code>SnapshotResourceError</code></p>

<ul class="api-consumer-list">
<li>None.</li>
</ul>
</div>
