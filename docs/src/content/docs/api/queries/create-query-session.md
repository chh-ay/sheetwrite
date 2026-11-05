---
title: "createQuerySession | @sheetwrite/queries"
description: "createQuerySession function in @sheetwrite/queries: The one registration call for workbook queries: loads the engine and binds saved queries of grid to the…"
---
<!-- api-export:@sheetwrite/queries|.|createQuerySession -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/queries/">@sheetwrite/queries</a><span class="api-status" data-kind="function">function</span></div>

The one registration call for workbook queries: loads the engine and binds
saved queries of `grid` to the host's `fetchSource`. Workbooks that never
call it load no query code or WASM.

## Examples

```ts compile
import type { Grid, PowerQueryCodec } from "@sheetwrite/core";
import { createQuerySession } from "@sheetwrite/queries";

async function refreshSales(grid: Grid) {
  const session = await createQuerySession(grid, {
    fetchSource: async (request, { signal }) => {
      const response = await fetch(`/sources/${request.sourceId}`, { signal });
      return { kind: "bytes", bytes: new Uint8Array(await response.arrayBuffer()) };
    },
  });

  return session.refreshAll();
}
```

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/queries/src/index.ts#L97"><code>packages/queries/src/index.ts#L97</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
function createQuerySession(
  grid: Grid,
  options: QuerySessionOptions & QueryEngineOptions,
): Promise<QuerySession>
```

</div>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/queries</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>createQuerySession</code></p>

<ul class="api-consumer-list">
<li>None.</li>
</ul>
</div>
