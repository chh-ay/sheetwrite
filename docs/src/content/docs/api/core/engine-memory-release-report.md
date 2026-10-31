---
title: "EngineMemoryReleaseReport | @sheetwrite/core"
description: "EngineMemoryReleaseReport interface in @sheetwrite/core: Result of an explicit, all-store engine memory release."
---
<!-- api-export:@sheetwrite/core|.|EngineMemoryReleaseReport -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Result of an explicit, all-store engine memory release.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/engine-memory.ts#L15"><code>packages/core/src/engine-memory.ts#L15</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>4</span>

<div class="api-member-list">

<details class="api-member" id="engine-memory-release-report-stores" data-pagefind-weight="1">
<summary><code>stores</code> <span class="api-member-summary">Stores migrated together; disposed stores are excluded.</span></summary>

```ts generated
readonly stores: number;
```

</details>

<details class="api-member" id="engine-memory-release-report-wasm-bytes-before" data-pagefind-weight="1">
<summary><code>wasmBytesBefore</code> <span class="api-member-summary">Committed linear memory of the retired engine.</span></summary>

```ts generated
readonly wasmBytesBefore: number;
```

</details>

<details class="api-member" id="engine-memory-release-report-wasm-bytes-after" data-pagefind-weight="1">
<summary><code>wasmBytesAfter</code> <span class="api-member-summary">Committed linear memory of its replacement, including migration scratch.</span></summary>

```ts generated
readonly wasmBytesAfter: number;
```

</details>

<details class="api-member" id="engine-memory-release-report-pause-ms" data-pagefind-weight="1">
<summary><code>pauseMs</code> <span class="api-member-summary">Main-thread migration pause, excluding the wait for active work.</span></summary>

```ts generated
readonly pauseMs: number;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface EngineMemoryReleaseReport {
  readonly stores: number;
  readonly wasmBytesBefore: number;
  readonly wasmBytesAfter: number;
  readonly pauseMs: number;
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

<p class="api-consumers-label">Public exports naming <code>EngineMemoryReleaseReport</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/release-engine-memory/"><code>releaseEngineMemory</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
