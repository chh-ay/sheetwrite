---
title: "HistoryVersion | @sheetwrite/core/history"
description: "HistoryVersion interface in @sheetwrite/core/history: A durable marker at one archived revision."
---
<!-- api-export:@sheetwrite/core|./history|HistoryVersion -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-history/">@sheetwrite/core/history</a><span class="api-status" data-kind="interface">interface</span></div>

A durable marker at one archived revision.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/version-history/types.ts#L36"><code>packages/core/src/version-history/types.ts#L36</code></a></dd></div>
</dl>

<nav class="api-member-index" aria-label="Member index" data-pagefind-ignore>
<a href="#history-version-id"><code>id</code></a>
<a href="#history-version-revision"><code>revision</code></a>
<a href="#history-version-kind"><code>kind</code></a>
<a href="#history-version-name"><code>name</code></a>
<a href="#history-version-author-id"><code>authorId</code></a>
<a href="#history-version-time"><code>time</code></a>
<a href="#history-version-checkpoint"><code>checkpoint</code></a>
<a href="#history-version-tail"><code>tail</code></a>
<a href="#history-version-checkpoints"><code>checkpoints</code></a>
</nav>

## Members <span class="api-count" data-pagefind-ignore>9</span>

<div class="api-member-list">

<details class="api-member" id="history-version-id" data-pagefind-weight="1">
<summary><code>id</code> <span class="api-member-summary">Content ID of the marker fields.</span></summary>

```ts generated
id: string;
```

</details>

<details class="api-member" id="history-version-revision" data-pagefind-weight="1">
<summary><code>revision</code></summary>

```ts generated
revision: number;
```

</details>

<details class="api-member" id="history-version-kind" data-pagefind-weight="1">
<summary><code>kind</code></summary>

```ts generated
kind: "named" | "automatic";
```

</details>

<details class="api-member" id="history-version-name" data-pagefind-weight="1">
<summary><code>name</code> <span class="api-member-summary">Present on named versions.</span></summary>

```ts generated
name?: string;
```

</details>

<details class="api-member" id="history-version-author-id" data-pagefind-weight="1">
<summary><code>authorId</code> <span class="api-member-summary">Who saved a named version, or who made the last change of an automatic one.</span></summary>

```ts generated
authorId: string;
```

</details>

<details class="api-member" id="history-version-time" data-pagefind-weight="1">
<summary><code>time</code></summary>

```ts generated
time: number;
```

</details>

<details class="api-member" id="history-version-checkpoint" data-pagefind-weight="1">
<summary><code>checkpoint</code> <span class="api-member-summary">Record ID of the checkpoint the version rebuilds from.</span></summary>

```ts generated
checkpoint: string;
```

</details>

<details class="api-member" id="history-version-tail" data-pagefind-weight="1">
<summary><code>tail</code> <span class="api-member-summary">Transaction envelope IDs applied after the checkpoint, in order.</span></summary>

```ts generated
tail: readonly string[];
```

</details>

<details class="api-member" id="history-version-checkpoints" data-pagefind-weight="1">
<summary><code>checkpoints</code> <span class="api-member-summary">Checkpoints made since the previous marker.</span></summary>

```ts generated
checkpoints: readonly string[];
```

<p class="api-member-doc">Checkpoints made since the previous marker. The marker keeps them, so the
log between two retained versions stays readable for a diff.</p>
</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface HistoryVersion {
  id: string;
  revision: number;
  kind: "named" | "automatic";
  name?: string;
  authorId: string;
  time: number;
  checkpoint: string;
  tail: readonly string[];
  checkpoints: readonly string[];
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

<p class="api-consumers-label">Public exports naming <code>HistoryVersion</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core-history/history-archive/"><code>HistoryArchive</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-history/history-list-page/"><code>HistoryListPage</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-history/history-publish-request/"><code>HistoryPublishRequest</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-history/history-storage-adapter/"><code>HistoryStorageAdapter</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
