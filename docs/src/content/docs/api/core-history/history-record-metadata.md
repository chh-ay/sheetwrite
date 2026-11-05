---
title: "HistoryRecordMetadata | @sheetwrite/core/history"
description: "HistoryRecordMetadata interface in @sheetwrite/core/history: Metadata for one immutable record; listings never return payload bytes."
---
<!-- api-export:@sheetwrite/core|./history|HistoryRecordMetadata -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-history/">@sheetwrite/core/history</a><span class="api-status" data-kind="interface">interface</span></div>

Metadata for one immutable record; listings never return payload bytes.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/version-history/types.ts#L136"><code>packages/core/src/version-history/types.ts#L136</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>4</span>

<div class="api-member-list">

<details class="api-member" id="history-record-metadata-id" data-pagefind-weight="1">
<summary><code>id</code></summary>

```ts generated
id: string;
```

</details>

<details class="api-member" id="history-record-metadata-kind" data-pagefind-weight="1">
<summary><code>kind</code></summary>

```ts generated
kind: HistoryStoredRecord["kind"];
```

</details>

<details class="api-member" id="history-record-metadata-encoded-bytes" data-pagefind-weight="1">
<summary><code>encodedBytes</code></summary>

```ts generated
encodedBytes: number;
```

</details>

<details class="api-member" id="history-record-metadata-decoded-bytes" data-pagefind-weight="1">
<summary><code>decodedBytes</code></summary>

```ts generated
decodedBytes: number;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface HistoryRecordMetadata {
  id: string;
  kind: HistoryStoredRecord["kind"];
  encodedBytes: number;
  decodedBytes: number;
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

<p class="api-consumers-label">Public exports naming <code>HistoryRecordMetadata</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core-history/history-list-page/"><code>HistoryListPage</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
