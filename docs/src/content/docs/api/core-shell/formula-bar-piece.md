---
title: "FormulaBarPiece | @sheetwrite/core/shell"
description: "A formula bar piece; setReadOnly blocks commits without unmounting."
---
<!-- api-export:@sheetwrite/core|./shell|FormulaBarPiece -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-shell/">@sheetwrite/core/shell</a><span class="api-status" data-kind="interface">interface</span></div>

A formula bar piece; `setReadOnly` blocks commits without unmounting.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core/shell</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/shell/formula-controls.ts#L124</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-member-list">

<details class="api-member" id="formula-bar-piece-set-read-only" data-pagefind-weight="1" open>
<summary><code>setReadOnly</code></summary>

<button class="api-copy" type="button" data-copy-code="setReadOnly(readOnly: boolean): void;" data-pagefind-ignore>Copy</button>

```ts generated
setReadOnly(readOnly: boolean): void;
```

</details>

<details class="api-member" id="formula-bar-piece-element" data-pagefind-weight="1" open>
<summary><code>element</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly element: HTMLElement;" data-pagefind-ignore>Copy</button>

```ts generated
readonly element: HTMLElement;
```

</details>

<details class="api-member" id="formula-bar-piece-destroy" data-pagefind-weight="1" open>
<summary><code>destroy</code></summary>

<button class="api-copy" type="button" data-copy-code="destroy(): void;" data-pagefind-ignore>Copy</button>

```ts generated
destroy(): void;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface FormulaBarPiece {&#10;  setReadOnly(readOnly: boolean): void;&#10;  readonly element: HTMLElement;&#10;  destroy(): void;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
export interface FormulaBarPiece {
  setReadOnly(readOnly: boolean): void;
  readonly element: HTMLElement;
  destroy(): void;
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

<p class="api-consumers-label">Public exports naming <code>FormulaBarPiece</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core-shell/create-formula-bar/"><code>createFormulaBar</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
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
