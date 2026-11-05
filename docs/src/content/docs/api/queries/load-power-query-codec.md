---
title: "loadPowerQueryCodec | @sheetwrite/queries"
description: "loadPowerQueryCodec function in @sheetwrite/queries: Loads the Power Query codec for XLSX import and export."
---
<!-- api-export:@sheetwrite/queries|.|loadPowerQueryCodec -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/queries/">@sheetwrite/queries</a><span class="api-status" data-kind="function">function</span></div>

Loads the Power Query codec for XLSX import and export. It translates saved
queries to M and reads imported M as text; it never evaluates M.

## Examples

```ts compile
import type { WorkbookSnapshot } from "@sheetwrite/core";
import { loadPowerQueryCodec } from "@sheetwrite/queries";

async function exportedM(snapshot: WorkbookSnapshot) {
  const codec = await loadPowerQueryCodec();
  return codec.encode(snapshot.workbook.queries ?? []).section;
}
```

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/queries/src/index.ts#L126"><code>packages/queries/src/index.ts#L126</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
function loadPowerQueryCodec(
  options?: QueryEngineOptions,
): Promise<PowerQueryCodec>
```

</div>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/queries</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>loadPowerQueryCodec</code></p>

<ul class="api-consumer-list">
<li>None.</li>
</ul>
</div>
