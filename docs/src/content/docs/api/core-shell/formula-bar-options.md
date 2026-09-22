---
title: "FormulaBarOptions | @sheetwrite/core/shell"
description: "Host elements and callbacks used to bind a formula bar to a Grid."
---
<!-- api-export:@sheetwrite/core|./shell|FormulaBarOptions -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-shell/">@sheetwrite/core/shell</a><span class="api-status" data-kind="interface">interface</span></div>

Host elements and callbacks used to bind a formula bar to a Grid.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core/shell</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/shell/formula-controls.ts#L116</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>2</span>

<div class="api-member-list">

<details class="api-member" id="formula-bar-options-focus-grid" data-pagefind-weight="1" open>
<summary><code>focusGrid</code> <span class="api-member-summary">Called after Enter commits or Escape cancels, so the grid regains focus.</span></summary>

<button class="api-copy" type="button" data-copy-code="focusGrid?: () =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
focusGrid?: () => void;
```

</details>

<details class="api-member" id="formula-bar-options-label" data-pagefind-weight="1" open>
<summary><code>label</code> <span class="api-member-summary">Accessible label (default &quot;Formula bar&quot;).</span></summary>

<button class="api-copy" type="button" data-copy-code="label?: string;" data-pagefind-ignore>Copy</button>

```ts generated
label?: string;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface FormulaBarOptions {&#10;  focusGrid?: () =&gt; void;&#10;  label?: string;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
export interface FormulaBarOptions {
  focusGrid?: () => void;
  label?: string;
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

<p class="api-consumers-label">Public exports naming <code>FormulaBarOptions</code></p>

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
