---
title: "SearchOptions | @sheetwrite/core"
description: "Case, whole-cell, sheet, and column constraints for grid search."
---
<!-- api-export:@sheetwrite/core|.|SearchOptions -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Case, whole-cell, sheet, and column constraints for grid search.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/grid.ts#L388</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>4</span>

<div class="api-member-list">

<details class="api-member" id="search-options-match-case" data-pagefind-weight="1" open>
<summary><code>matchCase</code> <span class="api-member-summary">Case-sensitive match (default false).</span></summary>

<button class="api-copy" type="button" data-copy-code="matchCase?: boolean;" data-pagefind-ignore>Copy</button>

```ts generated
matchCase?: boolean;
```

</details>

<details class="api-member" id="search-options-whole-cell" data-pagefind-weight="1" open>
<summary><code>wholeCell</code> <span class="api-member-summary">Match only when the whole cell text equals the query (default false: substring).</span></summary>

<button class="api-copy" type="button" data-copy-code="wholeCell?: boolean;" data-pagefind-ignore>Copy</button>

```ts generated
wholeCell?: boolean;
```

</details>

<details class="api-member" id="search-options-sheet" data-pagefind-weight="1" open>
<summary><code>sheet</code> <span class="api-member-summary">Restrict to a sheet (defaults to the active sheet).</span></summary>

<button class="api-copy" type="button" data-copy-code="sheet?: SheetId;" data-pagefind-ignore>Copy</button>

```ts generated
sheet?: SheetId;
```

</details>

<details class="api-member" id="search-options-columns" data-pagefind-weight="1" open>
<summary><code>columns</code> <span class="api-member-summary">Restrict to these column indices (defaults to all columns).</span></summary>

<button class="api-copy" type="button" data-copy-code="columns?: number[];" data-pagefind-ignore>Copy</button>

```ts generated
columns?: number[];
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface SearchOptions {&#10;  matchCase?: boolean;&#10;  wholeCell?: boolean;&#10;  sheet?: SheetId;&#10;  columns?: number[];&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
export interface SearchOptions {
  matchCase?: boolean;
  wholeCell?: boolean;
  sheet?: SheetId;
  columns?: number[];
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

<p class="api-consumers-label">Public exports naming <code>SearchOptions</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/grid/"><code>Grid</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/react/grid/"><code>Grid</code></a><span class="api-consumer-kind">@sheetwrite/react</span></li>
<li><a href="/docs/api/svelte/grid/"><code>Grid</code></a><span class="api-consumer-kind">@sheetwrite/svelte</span></li>
<li><a href="/docs/api/vue/grid/"><code>Grid</code></a><span class="api-consumer-kind">@sheetwrite/vue</span></li>
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
