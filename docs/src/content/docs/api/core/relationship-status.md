---
title: "RelationshipStatus | @sheetwrite/core"
description: "RelationshipStatus type in @sheetwrite/core: Whether the keys of a relationship resolve, checked from the current cell values."
---
<!-- api-export:@sheetwrite/core|.|RelationshipStatus -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

Whether the keys of a relationship resolve, checked from the current cell
values. Rows are data-row offsets in their table, header row excluded.

- `ok`: every non-blank one-side key is unique; `unmatched` counts the
  non-blank many-side keys that match no one-side row.
- `missingTable`, `missingColumn`: a table or column was removed.
- `typeMismatch`: the key at `row` on `side` is a boolean, an error on the
  one side, or not the same kind (number or text) as the other keys.
- `duplicateKey`: two one-side rows hold equal keys (text without case).
- `unavailable`: the loaded engine does not check keys (the default
  engine), or no relationship has this ID.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/types/data-model.ts#L50"><code>packages/core/src/types/data-model.ts#L50</code></a></dd></div>
</dl>

## Variants <span class="api-count" data-pagefind-ignore>6</span>

<div class="api-variant-list" data-pagefind-ignore>
<div class="api-variant">

```ts generated
{ status: "ok"; unmatched: number }
```

</div>
<div class="api-variant">

```ts generated
{ status: "missingTable" }
```

</div>
<div class="api-variant">

```ts generated
{ status: "missingColumn" }
```

</div>
<div class="api-variant">

```ts generated
{ status: "typeMismatch"; side: "from" | "to"; row: number }
```

</div>
<div class="api-variant">

```ts generated
{ status: "duplicateKey"; rows: [number, number] }
```

</div>
<div class="api-variant">

```ts generated
{ status: "unavailable" }
```

</div>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export type RelationshipStatus =
  | {
      status: "ok";
      unmatched: number;
    }
  | {
      status: "missingTable";
    }
  | {
      status: "missingColumn";
    }
  | {
      status: "typeMismatch";
      side: "from" | "to";
      row: number;
    }
  | {
      status: "duplicateKey";
      rows: [number, number];
    }
  | {
      status: "unavailable";
    };
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

<p class="api-consumers-label">Public exports naming <code>RelationshipStatus</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/sheetwrite-store/"><code>SheetwriteStore</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
