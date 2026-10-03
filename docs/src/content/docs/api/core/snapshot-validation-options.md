---
title: "SnapshotValidationOptions | @sheetwrite/core"
description: "Validation and allocation policy for an untrusted workbook snapshot."
---
<!-- api-export:@sheetwrite/core|.|SnapshotValidationOptions -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Validation and allocation policy for an untrusted workbook snapshot.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/document-protocol.ts#L312"><code>packages/core/src/document-protocol.ts#L312</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>2</span>

<div class="api-member-list">

<details class="api-member" id="snapshot-validation-options-storage" data-pagefind-weight="1">
<summary><code>storage</code> <span class="api-member-summary">Allocation model used for capacity checks; defaults to dense.</span></summary>

```ts generated
storage?: SnapshotStorageMode;
```

</details>

<details class="api-member" id="snapshot-validation-options-resource-limits" data-pagefind-weight="1">
<summary><code>resourceLimits</code> <span class="api-member-summary">Non-negative safe-integer overrides merged over DEFAULTSNAPSHOTRESOURCELIMITS.</span></summary>

```ts generated
resourceLimits?: Partial<SnapshotResourceLimits>;
```

<p class="api-member-doc">Non-negative safe-integer overrides merged over `DEFAULT_SNAPSHOT_RESOURCE_LIMITS`.</p>
</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface SnapshotValidationOptions {
  storage?: SnapshotStorageMode;
  resourceLimits?: Partial<SnapshotResourceLimits>;
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

<p class="api-consumers-label">Public exports naming <code>SnapshotValidationOptions</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/validate-workbook-snapshot/"><code>validateWorkbookSnapshot</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
