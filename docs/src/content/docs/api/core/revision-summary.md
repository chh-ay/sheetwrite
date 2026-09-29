---
title: "RevisionSummary | @sheetwrite/core"
description: "Host-provided metadata describing a saved workbook revision."
---
<!-- api-export:@sheetwrite/core|.|RevisionSummary -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Host-provided metadata describing a saved workbook revision.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/collaboration.ts#L244"><code>packages/core/src/collaboration.ts#L244</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>4</span>

<div class="api-member-list">

<details class="api-member" id="revision-summary-version" data-pagefind-weight="1">
<summary><code>version</code></summary>

```ts generated
version: number;
```

</details>

<details class="api-member" id="revision-summary-created-at" data-pagefind-weight="1">
<summary><code>createdAt</code></summary>

```ts generated
createdAt: string;
```

</details>

<details class="api-member" id="revision-summary-actor" data-pagefind-weight="1">
<summary><code>actor</code></summary>

```ts generated
actor?: PresenceActor;
```

</details>

<details class="api-member" id="revision-summary-label" data-pagefind-weight="1">
<summary><code>label</code></summary>

```ts generated
label?: string;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface RevisionSummary {
  version: number;
  createdAt: string;
  actor?: PresenceActor;
  label?: string;
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

<p class="api-consumers-label">Public exports naming <code>RevisionSummary</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/revision-adapter/"><code>RevisionAdapter</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/revision-coordinator/"><code>RevisionCoordinator</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
