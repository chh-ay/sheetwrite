---
title: "RowBridge | @sheetwrite/vue"
description: "Projects canonical document transactions into host-owned row changes."
---
<!-- api-export:@sheetwrite/vue|.|RowBridge -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/vue/">@sheetwrite/vue</a><span class="api-status" data-kind="class">class</span></div>

Projects canonical document transactions into host-owned row changes.

The bridge only owns compact data-space identity arrays. It never writes to
`defaultRows`, never renders, and never creates a second document store.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/vue</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/dist/row-bridge.d.ts#L143</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>5</span>

<div class="api-member-list">

<details class="api-member" id="row-bridge-constructor" data-pagefind-weight="1">
<summary><code>constructor</code></summary>

<button class="api-copy" type="button" data-copy-code="constructor&lt;Id extends RowBridgeId = RowBridgeId, Row extends Record&lt;string, CellScalar&gt; = Record&lt;string, CellScalar&gt;&gt;(options: RowBridgeOptions&lt;Row, Id&gt;);" data-pagefind-ignore>Copy</button>

```ts generated
constructor<Id extends RowBridgeId = RowBridgeId, Row extends Record<string, CellScalar> = Record<string, CellScalar>>(options: RowBridgeOptions<Row, Id>);
```

</details>

<details class="api-member" id="row-bridge-column-keys" data-pagefind-weight="1" open>
<summary><code>columnKeys</code> <span class="api-member-summary">Current semantic column keys in canonical column order.</span></summary>

<button class="api-copy" type="button" data-copy-code="columnKeys: (sheet?: SheetId) =&gt; readonly string[];" data-pagefind-ignore>Copy</button>

```ts generated
columnKeys: (sheet?: SheetId) => readonly string[];
```

</details>

<details class="api-member" id="row-bridge-project" data-pagefind-weight="1">
<summary><code>project</code> <span class="api-member-summary">Project an applied Grid change as an accepted, transformed, or remote result.</span></summary>

<button class="api-copy" type="button" data-copy-code="project: (event: ChangeEvent, requestedOperations?: readonly DocumentOp[], transactionId?: string) =&gt; RowBridgeProjection&lt;Id&gt;;" data-pagefind-ignore>Copy</button>

```ts generated
project: (event: ChangeEvent, requestedOperations?: readonly DocumentOp[], transactionId?: string) => RowBridgeProjection<Id>;
```

</details>

<details class="api-member" id="row-bridge-reconcile" data-pagefind-weight="1" open>
<summary><code>reconcile</code> <span class="api-member-summary">Reconcile a canonical transaction response without synchronizing host rows implicitly.</span></summary>

<button class="api-copy" type="button" data-copy-code="reconcile: (input: RowBridgeReconciliationInput&lt;Id&gt;) =&gt; RowBridgeProjection&lt;Id&gt;;" data-pagefind-ignore>Copy</button>

```ts generated
reconcile: (input: RowBridgeReconciliationInput<Id>) => RowBridgeProjection<Id>;
```

</details>

<details class="api-member" id="row-bridge-row-ids" data-pagefind-weight="1" open>
<summary><code>rowIds</code> <span class="api-member-summary">Current data-space row identities; visual sort and filters do not affect this order.</span></summary>

<button class="api-copy" type="button" data-copy-code="rowIds: (sheet?: SheetId) =&gt; readonly (Id | null)[]" data-pagefind-ignore>Copy</button>

```ts generated
rowIds: (sheet?: SheetId) => readonly (Id | null)[]
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="class RowBridge {&#10;  constructor&lt;&#10;    Id extends RowBridgeId = RowBridgeId,&#10;    Row extends Record&lt;string, CellScalar&gt; = Record&lt;string, CellScalar&gt;,&#10;  &gt;(options: RowBridgeOptions&lt;Row, Id&gt;);&#10;  columnKeys: (sheet?: SheetId) =&gt; readonly string[];&#10;  project: (&#10;    event: ChangeEvent,&#10;    requestedOperations?: readonly DocumentOp[],&#10;    transactionId?: string,&#10;  ) =&gt; RowBridgeProjection&lt;Id&gt;;&#10;  reconcile: (&#10;    input: RowBridgeReconciliationInput&lt;Id&gt;,&#10;  ) =&gt; RowBridgeProjection&lt;Id&gt;;&#10;  rowIds: (sheet?: SheetId) =&gt; readonly (Id | null)[];&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
class RowBridge {
  constructor<
    Id extends RowBridgeId = RowBridgeId,
    Row extends Record<string, CellScalar> = Record<string, CellScalar>,
  >(options: RowBridgeOptions<Row, Id>);
  columnKeys: (sheet?: SheetId) => readonly string[];
  project: (
    event: ChangeEvent,
    requestedOperations?: readonly DocumentOp[],
    transactionId?: string,
  ) => RowBridgeProjection<Id>;
  reconcile: (
    input: RowBridgeReconciliationInput<Id>,
  ) => RowBridgeProjection<Id>;
  rowIds: (sheet?: SheetId) => readonly (Id | null)[];
}
```

</details>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/vue</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>RowBridge</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/create-row-bridge/"><code>createRowBridge</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-adapter/create-grid-controller/"><code>createGridController</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-adapter/create-row-bridge/"><code>createRowBridge</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/react/sheetwrite-grid-props/"><code>SheetwriteGridProps</code></a><span class="api-consumer-kind">@sheetwrite/react</span></li>
<li><a href="/docs/api/svelte/sheetwrite-grid-props/"><code>SheetwriteGridProps</code></a><span class="api-consumer-kind">@sheetwrite/svelte</span></li>
<li><a href="/docs/api/vue/sheetwrite-grid-props/"><code>SheetwriteGridProps</code></a><span class="api-consumer-kind">@sheetwrite/vue</span></li>
</ul>
</div>

<script>
(() => {
  if (window.__sheetwriteApiCopy !== undefined) return;
  window.__sheetwriteApiCopy = true;
  const selectCopy = (text) => {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.append(area);
    area.select();
    let copied = false;
    try {
      copied = document.execCommand("copy");
    } catch {
      copied = false;
    }
    area.remove();
    return copied;
  };
  const copy = (button) => {
    const text = button.dataset.copyCode ?? "";
    const confirm = () => {
      button.textContent = "Copied";
      window.setTimeout(() => { button.textContent = "Copy"; }, 1400);
    };
    if (navigator.clipboard === undefined) {
      if (selectCopy(text)) confirm();
      return;
    }
    navigator.clipboard.writeText(text).then(confirm, () => {
      if (selectCopy(text)) confirm();
    });
  };
  document.addEventListener("click", (event) => {
    const target = event.target;
    const button = target instanceof Element ? target.closest(".api-copy") : null;
    if (button !== null) copy(button);
  });
})();
</script>
