---
title: "XlsxSourcePart | @sheetwrite/core"
description: "One retained OOXML part, kept as its original compressed ZIP payload so a save copies it without inflating or recompressing."
---
<!-- api-export:@sheetwrite/core|.|XlsxSourcePart -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

One retained OOXML part, kept as its original compressed ZIP payload so a
save copies it without inflating or recompressing. Runtime copies are frozen.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/types/document.ts#L384"><code>packages/core/src/types/document.ts#L384</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>6</span>

<div class="api-member-list">

<details class="api-member" id="xlsx-source-part-name" data-pagefind-weight="1">
<summary><code>name</code></summary>

```ts generated
readonly name: string;
```

</details>

<details class="api-member" id="xlsx-source-part-content-type" data-pagefind-weight="1">
<summary><code>contentType</code></summary>

```ts generated
readonly contentType: string;
```

</details>

<details class="api-member" id="xlsx-source-part-method" data-pagefind-weight="1">
<summary><code>method</code></summary>

```ts generated
readonly method: 0 | 8;
```

</details>

<details class="api-member" id="xlsx-source-part-crc32" data-pagefind-weight="1">
<summary><code>crc32</code></summary>

```ts generated
readonly crc32: number;
```

</details>

<details class="api-member" id="xlsx-source-part-uncompressed-size" data-pagefind-weight="1">
<summary><code>uncompressedSize</code></summary>

```ts generated
readonly uncompressedSize: number;
```

</details>

<details class="api-member" id="xlsx-source-part-data" data-pagefind-weight="1">
<summary><code>data</code> <span class="api-member-summary">Base64 of the compressed payload.</span></summary>

```ts generated
readonly data: string;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface XlsxSourcePart {
  readonly name: string;
  readonly contentType: string;
  readonly method: 0 | 8;
  readonly crc32: number;
  readonly uncompressedSize: number;
  readonly data: string;
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

<p class="api-consumers-label">Public exports naming <code>XlsxSourcePart</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/xlsx-source-snapshot/"><code>XlsxSourceSnapshot</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
