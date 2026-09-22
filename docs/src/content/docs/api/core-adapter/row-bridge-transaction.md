---
title: "RowBridgeTransaction | @sheetwrite/core/adapter"
description: "The canonical transaction identity carried by each projected delta."
---
<!-- api-export:@sheetwrite/core|./adapter|RowBridgeTransaction -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-adapter/">@sheetwrite/core/adapter</a><span class="api-status" data-kind="interface">interface</span></div>

The canonical transaction identity carried by each projected delta.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core/adapter</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/row-bridge.ts#L48</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>5</span>

<div class="api-member-list">

<details class="api-member" id="row-bridge-transaction-id" data-pagefind-weight="1" open>
<summary><code>id</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly id: string;" data-pagefind-ignore>Copy</button>

```ts generated
readonly id: string;
```

</details>

<details class="api-member" id="row-bridge-transaction-source" data-pagefind-weight="1" open>
<summary><code>source</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly source: OperationSource;" data-pagefind-ignore>Copy</button>

```ts generated
readonly source: OperationSource;
```

</details>

<details class="api-member" id="row-bridge-transaction-commit-reason" data-pagefind-weight="1" open>
<summary><code>commitReason</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly commitReason: CommitReason;" data-pagefind-ignore>Copy</button>

```ts generated
readonly commitReason: CommitReason;
```

</details>

<details class="api-member" id="row-bridge-transaction-epoch" data-pagefind-weight="1" open>
<summary><code>epoch</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly epoch: number | undefined;" data-pagefind-ignore>Copy</button>

```ts generated
readonly epoch: number | undefined;
```

</details>

<details class="api-member" id="row-bridge-transaction-patches" data-pagefind-weight="1" open>
<summary><code>patches</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly patches: readonly DocumentOp[];" data-pagefind-ignore>Copy</button>

```ts generated
readonly patches: readonly DocumentOp[];
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface RowBridgeTransaction {&#10;  readonly id: string;&#10;  readonly source: OperationSource;&#10;  readonly commitReason: CommitReason;&#10;  readonly epoch: number | undefined;&#10;  readonly patches: readonly DocumentOp[];&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
export interface RowBridgeTransaction {
  readonly id: string;
  readonly source: OperationSource;
  readonly commitReason: CommitReason;
  readonly epoch: number | undefined;
  readonly patches: readonly DocumentOp[];
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

<p class="api-consumers-label">Public exports naming <code>RowBridgeTransaction</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/row-bridge-clear-delta/"><code>RowBridgeClearDelta</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/row-bridge-fill-delta/"><code>RowBridgeFillDelta</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/row-bridge-host-action-delta/"><code>RowBridgeHostActionDelta</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/row-bridge-metadata-delta/"><code>RowBridgeMetadataDelta</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/row-bridge-paste-delta/"><code>RowBridgePasteDelta</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/row-bridge-projection/"><code>RowBridgeProjection</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/row-bridge-range-delta/"><code>RowBridgeRangeDelta</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/row-bridge-row-structure-delta/"><code>RowBridgeRowStructureDelta</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/row-bridge-unprojectable-delta/"><code>RowBridgeUnprojectableDelta</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-adapter/row-bridge-clear-delta/"><code>RowBridgeClearDelta</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-adapter/row-bridge-fill-delta/"><code>RowBridgeFillDelta</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-adapter/row-bridge-host-action-delta/"><code>RowBridgeHostActionDelta</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li class="api-consumer-more">and 9 more</li>
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
