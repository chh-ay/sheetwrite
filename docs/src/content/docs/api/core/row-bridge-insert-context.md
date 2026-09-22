---
title: "RowBridgeInsertContext | @sheetwrite/core"
description: "Context supplied when a canonical row insertion needs a host identity."
---
<!-- api-export:@sheetwrite/core|.|RowBridgeInsertContext -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Context supplied when a canonical row insertion needs a host identity.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/row-bridge.ts#L15</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>4</span>

<div class="api-member-list">

<details class="api-member" id="row-bridge-insert-context-sheet" data-pagefind-weight="1" open>
<summary><code>sheet</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly sheet: SheetId;" data-pagefind-ignore>Copy</button>

```ts generated
readonly sheet: SheetId;
```

</details>

<details class="api-member" id="row-bridge-insert-context-at" data-pagefind-weight="1" open>
<summary><code>at</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly at: number;" data-pagefind-ignore>Copy</button>

```ts generated
readonly at: number;
```

</details>

<details class="api-member" id="row-bridge-insert-context-offset" data-pagefind-weight="1" open>
<summary><code>offset</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly offset: number;" data-pagefind-ignore>Copy</button>

```ts generated
readonly offset: number;
```

</details>

<details class="api-member" id="row-bridge-insert-context-transaction-id" data-pagefind-weight="1" open>
<summary><code>transactionId</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly transactionId: string;" data-pagefind-ignore>Copy</button>

```ts generated
readonly transactionId: string;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface RowBridgeInsertContext {&#10;  readonly sheet: SheetId;&#10;  readonly at: number;&#10;  readonly offset: number;&#10;  readonly transactionId: string;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
export interface RowBridgeInsertContext {
  readonly sheet: SheetId;
  readonly at: number;
  readonly offset: number;
  readonly transactionId: string;
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

<p class="api-consumers-label">Public exports naming <code>RowBridgeInsertContext</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/row-bridge-options/"><code>RowBridgeOptions</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-adapter/row-bridge-options/"><code>RowBridgeOptions</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/svelte/sheetwrite-props/"><code>SheetwriteProps</code></a><span class="api-consumer-kind">@sheetwrite/svelte</span></li>
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
