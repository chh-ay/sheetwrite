---
title: "Range | @sheetwrite/core"
description: "Inclusive rectangular cell range on a stable sheet ID."
---
<!-- api-export:@sheetwrite/core|.|Range -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Inclusive rectangular cell range on a stable sheet ID.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/coordinates.ts#L23</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-member-list">

<details class="api-member" id="range-sheet" data-pagefind-weight="1" open>
<summary><code>sheet</code></summary>

<button class="api-copy" type="button" data-copy-code="sheet: SheetId;" data-pagefind-ignore>Copy</button>

```ts generated
sheet: SheetId;
```

</details>

<details class="api-member" id="range-start" data-pagefind-weight="1" open>
<summary><code>start</code></summary>

<button class="api-copy" type="button" data-copy-code="start: { row: number; col: number };" data-pagefind-ignore>Copy</button>

```ts generated
start: { row: number; col: number };
```

</details>

<details class="api-member" id="range-end" data-pagefind-weight="1" open>
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

<button class="api-copy" type="button" data-copy-code="export interface Range {&#10;  sheet: SheetId;&#10;  start: {&#10;    row: number;&#10;    col: number;&#10;  };&#10;  end: {&#10;    row: number;&#10;    col: number;&#10;  };&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
export interface Range {
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

<p class="api-consumers-label">Public exports naming <code>Range</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/cell-hyperlink/"><code>CellHyperlink</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/comment-anchor/"><code>CommentAnchor</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/conditional-format-rule/"><code>ConditionalFormatRule</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/data-validation-rule/"><code>DataValidationRule</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/document-op/"><code>DocumentOp</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/grid/"><code>Grid</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/hyperlink-target/"><code>HyperlinkTarget</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/mutation-issue/"><code>MutationIssue</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/named-range-snapshot/"><code>NamedRangeSnapshot</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/presence-message/"><code>PresenceMessage</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/presence-overlay/"><code>PresenceOverlay</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/protected-range/"><code>ProtectedRange</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li class="api-consumer-more">and 16 more</li>
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
