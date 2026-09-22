---
title: "RowBridgeCell | @sheetwrite/core"
description: "A cell effect with semantic column and host row identity."
---
<!-- api-export:@sheetwrite/core|.|RowBridgeCell -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

A cell effect with semantic column and host row identity.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/row-bridge.ts#L37</code></dd></div>
</dl>

<nav class="api-member-index" aria-label="Member index" data-pagefind-ignore>
<a href="#row-bridge-cell-sheet"><code>sheet</code></a>
<a href="#row-bridge-cell-row"><code>row</code></a>
<a href="#row-bridge-cell-row-id"><code>rowId</code></a>
<a href="#row-bridge-cell-col"><code>col</code></a>
<a href="#row-bridge-cell-column-key"><code>columnKey</code></a>
<a href="#row-bridge-cell-previous"><code>previous</code></a>
<a href="#row-bridge-cell-next"><code>next</code></a>
</nav>

## Members <span class="api-count" data-pagefind-ignore>7</span>

<div class="api-member-list">

<details class="api-member" id="row-bridge-cell-sheet" data-pagefind-weight="1" open>
<summary><code>sheet</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly sheet: SheetId;" data-pagefind-ignore>Copy</button>

```ts generated
readonly sheet: SheetId;
```

</details>

<details class="api-member" id="row-bridge-cell-row" data-pagefind-weight="1" open>
<summary><code>row</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly row: number;" data-pagefind-ignore>Copy</button>

```ts generated
readonly row: number;
```

</details>

<details class="api-member" id="row-bridge-cell-row-id" data-pagefind-weight="1" open>
<summary><code>rowId</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly rowId: Id | null;" data-pagefind-ignore>Copy</button>

```ts generated
readonly rowId: Id | null;
```

</details>

<details class="api-member" id="row-bridge-cell-col" data-pagefind-weight="1" open>
<summary><code>col</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly col: number;" data-pagefind-ignore>Copy</button>

```ts generated
readonly col: number;
```

</details>

<details class="api-member" id="row-bridge-cell-column-key" data-pagefind-weight="1" open>
<summary><code>columnKey</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly columnKey: string | null;" data-pagefind-ignore>Copy</button>

```ts generated
readonly columnKey: string | null;
```

</details>

<details class="api-member" id="row-bridge-cell-previous" data-pagefind-weight="1" open>
<summary><code>previous</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly previous: CellValue | undefined;" data-pagefind-ignore>Copy</button>

```ts generated
readonly previous: CellValue | undefined;
```

</details>

<details class="api-member" id="row-bridge-cell-next" data-pagefind-weight="1" open>
<summary><code>next</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly next: CellValue | undefined;" data-pagefind-ignore>Copy</button>

```ts generated
readonly next: CellValue | undefined;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface RowBridgeCell&lt;Id extends RowBridgeId = RowBridgeId&gt; {&#10;  readonly sheet: SheetId;&#10;  readonly row: number;&#10;  readonly rowId: Id | null;&#10;  readonly col: number;&#10;  readonly columnKey: string | null;&#10;  readonly previous: CellValue | undefined;&#10;  readonly next: CellValue | undefined;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
export interface RowBridgeCell<Id extends RowBridgeId = RowBridgeId> {
  readonly sheet: SheetId;
  readonly row: number;
  readonly rowId: Id | null;
  readonly col: number;
  readonly columnKey: string | null;
  readonly previous: CellValue | undefined;
  readonly next: CellValue | undefined;
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

<p class="api-consumers-label">Public exports naming <code>RowBridgeCell</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/row-bridge-clear-delta/"><code>RowBridgeClearDelta</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/row-bridge-fill-delta/"><code>RowBridgeFillDelta</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/row-bridge-paste-delta/"><code>RowBridgePasteDelta</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/row-bridge-range-delta/"><code>RowBridgeRangeDelta</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-adapter/row-bridge-clear-delta/"><code>RowBridgeClearDelta</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-adapter/row-bridge-fill-delta/"><code>RowBridgeFillDelta</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-adapter/row-bridge-paste-delta/"><code>RowBridgePasteDelta</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-adapter/row-bridge-range-delta/"><code>RowBridgeRangeDelta</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
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
