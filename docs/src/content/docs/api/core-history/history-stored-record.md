---
title: "HistoryStoredRecord | @sheetwrite/core/history"
description: "HistoryStoredRecord interface in @sheetwrite/core/history: Immutable, content-addressed history payload and the records it refers to."
---
<!-- api-export:@sheetwrite/core|./history|HistoryStoredRecord -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-history/">@sheetwrite/core/history</a><span class="api-status" data-kind="interface">interface</span></div>

Immutable, content-addressed history payload and the records it refers to.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/version-history/types.ts#L53"><code>packages/core/src/version-history/types.ts#L53</code></a></dd></div>
</dl>

<nav class="api-member-index" aria-label="Member index" data-pagefind-ignore>
<a href="#history-stored-record-schema-version"><code>schemaVersion</code></a>
<a href="#history-stored-record-id"><code>id</code></a>
<a href="#history-stored-record-kind"><code>kind</code></a>
<a href="#history-stored-record-encoding"><code>encoding</code></a>
<a href="#history-stored-record-decoded-bytes"><code>decodedBytes</code></a>
<a href="#history-stored-record-bytes"><code>bytes</code></a>
<a href="#history-stored-record-references"><code>references</code></a>
</nav>

## Members <span class="api-count" data-pagefind-ignore>7</span>

<div class="api-member-list">

<details class="api-member" id="history-stored-record-schema-version" data-pagefind-weight="1">
<summary><code>schemaVersion</code></summary>

```ts generated
schemaVersion: 1;
```

</details>

<details class="api-member" id="history-stored-record-id" data-pagefind-weight="1">
<summary><code>id</code> <span class="api-member-summary">SHA-256 over the header and compressed bytes, as 64 lowercase hex digits.</span></summary>

```ts generated
id: string;
```

</details>

<details class="api-member" id="history-stored-record-kind" data-pagefind-weight="1">
<summary><code>kind</code></summary>

```ts generated
kind: "cells" | "metadata" | "sheet" | "checkpoint" | "segment" | "transaction";
```

</details>

<details class="api-member" id="history-stored-record-encoding" data-pagefind-weight="1">
<summary><code>encoding</code></summary>

```ts generated
encoding: "deflate-json-v1" | "deflate-bytes-v1";
```

</details>

<details class="api-member" id="history-stored-record-decoded-bytes" data-pagefind-weight="1">
<summary><code>decodedBytes</code> <span class="api-member-summary">Exact size after inflate.</span></summary>

```ts generated
decodedBytes: number;
```

</details>

<details class="api-member" id="history-stored-record-bytes" data-pagefind-weight="1">
<summary><code>bytes</code> <span class="api-member-summary">Deflate-compressed payload.</span></summary>

```ts generated
bytes: Uint8Array;
```

</details>

<details class="api-member" id="history-stored-record-references" data-pagefind-weight="1">
<summary><code>references</code> <span class="api-member-summary">Records this record needs; they stay while this record exists.</span></summary>

```ts generated
references: readonly string[];
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface HistoryStoredRecord {
  schemaVersion: 1;
  id: string;
  kind:
    "cells" | "metadata" | "sheet" | "checkpoint" | "segment" | "transaction";
  encoding: "deflate-json-v1" | "deflate-bytes-v1";
  decodedBytes: number;
  bytes: Uint8Array;
  references: readonly string[];
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
<li><code>@sheetwrite/react</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/svelte</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/vue</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/xlsx</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>HistoryStoredRecord</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core-history/history-list-request/"><code>HistoryListRequest</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-history/history-publish-request/"><code>HistoryPublishRequest</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-history/history-record-metadata/"><code>HistoryRecordMetadata</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-history/history-storage-adapter/"><code>HistoryStorageAdapter</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
