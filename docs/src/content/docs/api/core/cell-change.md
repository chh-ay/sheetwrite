---
title: "CellChange | @sheetwrite/core"
description: "One committed cell edit, carrying enough to roll back."
---
<!-- api-export:@sheetwrite/core|.|CellChange -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

One committed cell edit, carrying enough to roll back.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/transaction.ts#L151</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>5</span>

<div class="api-member-list">

<details class="api-member" id="cell-change-addr" data-pagefind-weight="1" open>
<summary><code>addr</code></summary>

<button class="api-copy" type="button" data-copy-code="addr: CellAddress;" data-pagefind-ignore>Copy</button>

```ts generated
addr: CellAddress;
```

</details>

<details class="api-member" id="cell-change-old-value" data-pagefind-weight="1" open>
<summary><code>oldValue</code></summary>

<button class="api-copy" type="button" data-copy-code="oldValue: CellValue;" data-pagefind-ignore>Copy</button>

```ts generated
oldValue: CellValue;
```

</details>

<details class="api-member" id="cell-change-new-value" data-pagefind-weight="1" open>
<summary><code>newValue</code></summary>

<button class="api-copy" type="button" data-copy-code="newValue: CellValue;" data-pagefind-ignore>Copy</button>

```ts generated
newValue: CellValue;
```

</details>

<details class="api-member" id="cell-change-old-style" data-pagefind-weight="1" open>
<summary><code>oldStyle</code></summary>

<button class="api-copy" type="button" data-copy-code="oldStyle?: CellStyle;" data-pagefind-ignore>Copy</button>

```ts generated
oldStyle?: CellStyle;
```

</details>

<details class="api-member" id="cell-change-new-style" data-pagefind-weight="1" open>
<summary><code>newStyle</code></summary>

<button class="api-copy" type="button" data-copy-code="newStyle?: CellStyle;" data-pagefind-ignore>Copy</button>

```ts generated
newStyle?: CellStyle;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface CellChange {&#10;  addr: CellAddress;&#10;  oldValue: CellValue;&#10;  newValue: CellValue;&#10;  oldStyle?: CellStyle;&#10;  newStyle?: CellStyle;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
export interface CellChange {
  addr: CellAddress;
  oldValue: CellValue;
  newValue: CellValue;
  oldStyle?: CellStyle;
  newStyle?: CellStyle;
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

<p class="api-consumers-label">Public exports naming <code>CellChange</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/change-event/"><code>ChangeEvent</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
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
