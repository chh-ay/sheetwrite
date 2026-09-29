---
title: "RevisionAdapter | @sheetwrite/core"
description: "Host persistence contract for revision history and restore."
---
<!-- api-export:@sheetwrite/core|.|RevisionAdapter -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Host persistence contract for revision history and restore.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/collaboration.ts#L272"><code>packages/core/src/collaboration.ts#L272</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-member-list">

<details class="api-member" id="revision-adapter-list-revisions" data-pagefind-weight="1">
<summary><code>listRevisions</code></summary>

```ts generated
listRevisions(documentId: string, signal?: AbortSignal): Promise<readonly RevisionSummary[]>;
```

</details>

<details class="api-member" id="revision-adapter-load-revision" data-pagefind-weight="1">
<summary><code>loadRevision</code></summary>

```ts generated
loadRevision(documentId: string, version: number, signal?: AbortSignal): Promise<unknown>;
```

</details>

<details class="api-member" id="revision-adapter-restore-revision" data-pagefind-weight="1">
<summary><code>restoreRevision</code> <span class="api-member-summary">Must create a new auditable server version; never rewind storage in place.</span></summary>

```ts generated
restoreRevision(request: RevisionRestoreRequest): Promise<RevisionRestoreResponse>;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface RevisionAdapter {
  listRevisions(
    documentId: string,
    signal?: AbortSignal,
  ): Promise<readonly RevisionSummary[]>;
  loadRevision(
    documentId: string,
    version: number,
    signal?: AbortSignal,
  ): Promise<unknown>;
  restoreRevision(
    request: RevisionRestoreRequest,
  ): Promise<RevisionRestoreResponse>;
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

<p class="api-consumers-label">Public exports naming <code>RevisionAdapter</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/revision-coordinator/"><code>RevisionCoordinator</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
