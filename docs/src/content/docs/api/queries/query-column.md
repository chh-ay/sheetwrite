---
title: "QueryColumn | @sheetwrite/queries"
description: "QueryColumn type in @sheetwrite/queries: Typed host buffers; validity and sparse error lanes preserve null/error distinctions."
---
<!-- api-export:@sheetwrite/queries|.|QueryColumn -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/queries/">@sheetwrite/queries</a><span class="api-status" data-kind="type">type</span></div>

Typed host buffers; validity and sparse error lanes preserve null/error distinctions.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/queries/src/types.ts#L74"><code>packages/queries/src/types.ts#L74</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
export type QueryColumn = ColumnState &
  (
    | {
        readonly type: "number";
        readonly values: Float64Array;
      }
    | {
        readonly type: "logical";
        readonly values: Uint8Array;
      }
    | {
        readonly type: "text";
        readonly bytes: Uint8Array;
        readonly offsets: Uint32Array;
      }
    | {
        readonly type: "date";
        readonly values: Int32Array;
      }
    | {
        readonly type: "dateTime";
        readonly values: BigInt64Array;
      }
    | ({
        readonly type: "mixed";
      } & QueryMixedLanes)
  );
```

</div>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/queries</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>QueryColumn</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/queries/query-batch/"><code>QueryBatch</code></a><span class="api-consumer-kind">@sheetwrite/queries</span></li>
</ul>
</div>
