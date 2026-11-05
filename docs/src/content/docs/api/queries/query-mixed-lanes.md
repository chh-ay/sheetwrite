---
title: "QueryMixedLanes | @sheetwrite/queries"
description: "QueryMixedLanes interface in @sheetwrite/queries: The tag selects a compact lane; indexes address that lane or the error-code pool."
---
<!-- api-export:@sheetwrite/queries|.|QueryMixedLanes -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/queries/">@sheetwrite/queries</a><span class="api-status" data-kind="interface">interface</span></div>

The tag selects a compact lane; indexes address that lane or the error-code pool.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/queries/src/types.ts#L60"><code>packages/queries/src/types.ts#L60</code></a></dd></div>
</dl>

<nav class="api-member-index" aria-label="Member index" data-pagefind-ignore>
<a href="#query-mixed-lanes-tags"><code>tags</code></a>
<a href="#query-mixed-lanes-indexes"><code>indexes</code></a>
<a href="#query-mixed-lanes-numbers"><code>numbers</code></a>
<a href="#query-mixed-lanes-logical"><code>logical</code></a>
<a href="#query-mixed-lanes-text"><code>text</code></a>
<a href="#query-mixed-lanes-offsets"><code>offsets</code></a>
<a href="#query-mixed-lanes-dates"><code>dates</code></a>
<a href="#query-mixed-lanes-date-times"><code>dateTimes</code></a>
</nav>

## Members <span class="api-count" data-pagefind-ignore>8</span>

<div class="api-member-list">

<details class="api-member" id="query-mixed-lanes-tags" data-pagefind-weight="1">
<summary><code>tags</code> <span class="api-member-summary">0 = null, 1 = number, 2 = logical, 3 = text, 4 = date, 5 = dateTime, 6 = error.</span></summary>

```ts generated
readonly tags: Uint8Array;
```

</details>

<details class="api-member" id="query-mixed-lanes-indexes" data-pagefind-weight="1">
<summary><code>indexes</code> <span class="api-member-summary">Index in the typed lane selected by the row's tag.</span></summary>

```ts generated
readonly indexes: Uint32Array;
```

</details>

<details class="api-member" id="query-mixed-lanes-numbers" data-pagefind-weight="1">
<summary><code>numbers</code></summary>

```ts generated
readonly numbers: Float64Array;
```

</details>

<details class="api-member" id="query-mixed-lanes-logical" data-pagefind-weight="1">
<summary><code>logical</code></summary>

```ts generated
readonly logical: Uint8Array;
```

</details>

<details class="api-member" id="query-mixed-lanes-text" data-pagefind-weight="1">
<summary><code>text</code></summary>

```ts generated
readonly text: Uint8Array;
```

</details>

<details class="api-member" id="query-mixed-lanes-offsets" data-pagefind-weight="1">
<summary><code>offsets</code></summary>

```ts generated
readonly offsets: Uint32Array;
```

</details>

<details class="api-member" id="query-mixed-lanes-dates" data-pagefind-weight="1">
<summary><code>dates</code></summary>

```ts generated
readonly dates: Int32Array;
```

</details>

<details class="api-member" id="query-mixed-lanes-date-times" data-pagefind-weight="1">
<summary><code>dateTimes</code></summary>

```ts generated
readonly dateTimes: BigInt64Array;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface QueryMixedLanes {
  readonly tags: Uint8Array;
  readonly indexes: Uint32Array;
  readonly numbers: Float64Array;
  readonly logical: Uint8Array;
  readonly text: Uint8Array;
  readonly offsets: Uint32Array;
  readonly dates: Int32Array;
  readonly dateTimes: BigInt64Array;
}
```

</details>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/queries</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>QueryMixedLanes</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/queries/query-column/"><code>QueryColumn</code></a><span class="api-consumer-kind">@sheetwrite/queries</span></li>
</ul>
</div>
