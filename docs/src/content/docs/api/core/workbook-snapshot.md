---
title: "WorkbookSnapshot | @sheetwrite/core"
description: "Schema-versioned serializable workbook document."
---
<!-- api-export:@sheetwrite/core|.|WorkbookSnapshot -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Schema-versioned serializable workbook document.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/types/document.ts#L366"><code>packages/core/src/types/document.ts#L366</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>5</span>

<div class="api-member-list">

<details class="api-member" id="workbook-snapshot-schema-version" data-pagefind-weight="1">
<summary><code>schemaVersion</code></summary>

```ts generated
schemaVersion: 1;
```

</details>

<details class="api-member" id="workbook-snapshot-document-id" data-pagefind-weight="1">
<summary><code>documentId</code></summary>

```ts generated
documentId?: string;
```

</details>

<details class="api-member" id="workbook-snapshot-version" data-pagefind-weight="1">
<summary><code>version</code></summary>

```ts generated
version?: number;
```

</details>

<details class="api-member" id="workbook-snapshot-workbook" data-pagefind-weight="1">
<summary><code>workbook</code></summary>

```ts generated
workbook: { activeSheet: SheetId; namedRanges?: NamedRangeSnapshot[]; };
```

</details>

<details class="api-member" id="workbook-snapshot-sheets" data-pagefind-weight="1">
<summary><code>sheets</code></summary>

```ts generated
sheets: SheetSnapshot[];
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface WorkbookSnapshot {
  schemaVersion: 1;
  documentId?: string;
  version?: number;
  workbook: {
    activeSheet: SheetId;
    namedRanges?: NamedRangeSnapshot[];
  };
  sheets: SheetSnapshot[];
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

<p class="api-consumers-label">Public exports naming <code>WorkbookSnapshot</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/document-validation-result/"><code>DocumentValidationResult</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/from-xlsx-workbook/"><code>fromXlsxWorkbook</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/grid/"><code>Grid</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/memory-persistence-adapter/"><code>MemoryPersistenceAdapter</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/persistence-adapter/"><code>PersistenceAdapter</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/persistence-commit-response/"><code>PersistenceCommitResponse</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/revision-restore-response/"><code>RevisionRestoreResponse</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/sheetwrite-store/"><code>SheetwriteStore</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/store/"><code>Store</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/sync-coordinator/"><code>SyncCoordinator</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/sync-coordinator-event/"><code>SyncCoordinatorEvent</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/sync-coordinator-options/"><code>SyncCoordinatorOptions</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li class="api-consumer-more">and 5 more</li>
</ul>
</div>
