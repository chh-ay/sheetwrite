---
title: "loadQueryEngine | @sheetwrite/queries"
description: "loadQueryEngine function in @sheetwrite/queries: Importing this package loads no WASM; only this explicit call loads query execution."
---
<!-- api-export:@sheetwrite/queries|.|loadQueryEngine -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/queries/">@sheetwrite/queries</a><span class="api-status" data-kind="function">function</span></div>

Importing this package loads no WASM; only this explicit call loads query execution.

## Examples

```ts compile
import { loadQueryEngine } from "@sheetwrite/queries";

async function selectLargeTotals() {
  const engine = await loadQueryEngine();
  const source = engine.parse(
    new TextEncoder().encode('[{"Total":120},{"Total":75}]'),
    { format: "json", columns: [{ id: "total", name: "Total", type: "number" }] },
  );

  return engine.execute(source, [
    { kind: "filter", predicate: { kind: "compare", column: "total", op: "gte", value: 100 } },
  ]);
}
```

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/queries/src/index.ts#L71"><code>packages/queries/src/index.ts#L71</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
function loadQueryEngine(
  options?: QueryEngineOptions,
): Promise<QueryEngine>
```

</div>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/queries</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>loadQueryEngine</code></p>

<ul class="api-consumer-list">
<li>None.</li>
</ul>
</div>
