---
title: "HighlightRange | @sheetwrite/core"
description: "A highlight target: a range plus an optional per-range color override."
---
<!-- api-export:@sheetwrite/core|.|HighlightRange -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

A highlight target: a range plus an optional per-range color override.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/coordinates.ts#L30</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>4</span>

<div class="api-member-list">

<details class="api-member" id="highlight-range-color" data-pagefind-weight="1" open>
<summary><code>color</code> <span class="api-member-summary">Overrides the call-level color / theme highlight for this range only.</span></summary>

<button class="api-copy" type="button" data-copy-code="color?: string;" data-pagefind-ignore>Copy</button>

```ts generated
color?: string;
```

</details>

<details class="api-member" id="highlight-range-sheet" data-pagefind-weight="1" open>
<summary><code>sheet</code></summary>

<button class="api-copy" type="button" data-copy-code="sheet: SheetId;" data-pagefind-ignore>Copy</button>

```ts generated
sheet: SheetId;
```

</details>

<details class="api-member" id="highlight-range-start" data-pagefind-weight="1" open>
<summary><code>start</code></summary>

<button class="api-copy" type="button" data-copy-code="start: { row: number; col: number };" data-pagefind-ignore>Copy</button>

```ts generated
start: { row: number; col: number };
```

</details>

<details class="api-member" id="highlight-range-end" data-pagefind-weight="1" open>
<summary><code>end</code></summary>

<button class="api-copy" type="button" data-copy-code="end: { row: number; col: number };" data-pagefind-ignore>Copy</button>

```ts generated
end: { row: number; col: number };
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface HighlightRange {&#10;  color?: string;&#10;  sheet: SheetId;&#10;  start: {&#10;    row: number;&#10;    col: number;&#10;  };&#10;  end: {&#10;    row: number;&#10;    col: number;&#10;  };&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
export interface HighlightRange {
  color?: string;
  sheet: SheetId;
  start: {
    row: number;
    col: number;
  };
  end: {
    row: number;
    col: number;
  };
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

<p class="api-consumers-label">Public exports naming <code>HighlightRange</code></p>

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
