---
title: "SnapshotCell | @sheetwrite/core"
description: "Serializable cell value and optional style inside a snapshot block."
---
<!-- api-export:@sheetwrite/core|.|SnapshotCell -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Serializable cell value and optional style inside a snapshot block.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/document.ts#L305</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>4</span>

<div class="api-member-list">

<details class="api-member" id="snapshot-cell-row-offset" data-pagefind-weight="1" open>
<summary><code>rowOffset</code></summary>

<button class="api-copy" type="button" data-copy-code="rowOffset: number;" data-pagefind-ignore>Copy</button>

```ts generated
rowOffset: number;
```

</details>

<details class="api-member" id="snapshot-cell-col-offset" data-pagefind-weight="1" open>
<summary><code>colOffset</code></summary>

<button class="api-copy" type="button" data-copy-code="colOffset: number;" data-pagefind-ignore>Copy</button>

```ts generated
colOffset: number;
```

</details>

<details class="api-member" id="snapshot-cell-value" data-pagefind-weight="1" open>
<summary><code>value</code></summary>

<button class="api-copy" type="button" data-copy-code="value: CellValue;" data-pagefind-ignore>Copy</button>

```ts generated
value: CellValue;
```

</details>

<details class="api-member" id="snapshot-cell-style" data-pagefind-weight="1" open>
<summary><code>style</code></summary>

<button class="api-copy" type="button" data-copy-code="style?: CellStyle;" data-pagefind-ignore>Copy</button>

```ts generated
style?: CellStyle;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface SnapshotCell {&#10;  rowOffset: number;&#10;  colOffset: number;&#10;  value: CellValue;&#10;  style?: CellStyle;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
export interface SnapshotCell {
  rowOffset: number;
  colOffset: number;
  value: CellValue;
  style?: CellStyle;
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

<p class="api-consumers-label">Public exports naming <code>SnapshotCell</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/cell-block/"><code>CellBlock</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/document-op/"><code>DocumentOp</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
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
