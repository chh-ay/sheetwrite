---
title: "SnapshotValidationError | @sheetwrite/core"
description: "Path-qualified schema failure found while validating an untrusted snapshot."
---
<!-- api-export:@sheetwrite/core|.|SnapshotValidationError -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="class">class</span></div>

Path-qualified schema failure found while validating an untrusted snapshot.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/document-protocol.ts#L362"><code>packages/core/src/document-protocol.ts#L362</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-member-list">

<details class="api-member" id="snapshot-validation-error-constructor" data-pagefind-weight="1">
<summary><code>constructor</code></summary>

```ts generated
constructor(errors: readonly DocumentValidationError[]);
```

</details>

<details class="api-member" id="snapshot-validation-error-errors" data-pagefind-weight="1">
<summary><code>errors</code></summary>

```ts generated
errors: readonly DocumentValidationError[];
```

</details>

<details class="api-member" id="snapshot-validation-error-name" data-pagefind-weight="1">
<summary><code>name</code></summary>

```ts generated
name: "SnapshotValidationError"
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
class SnapshotValidationError extends SheetwriteError {
  constructor(errors: readonly DocumentValidationError[]);
  errors: readonly DocumentValidationError[];
  name: "SnapshotValidationError";
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

<p class="api-consumers-label">Public exports naming <code>SnapshotValidationError</code></p>

<ul class="api-consumer-list">
<li>None.</li>
</ul>
</div>
