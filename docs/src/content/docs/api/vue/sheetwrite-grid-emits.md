---
title: "SheetwriteGridEmits | @sheetwrite/vue"
description: "Event payloads emitted by the Vue components, keyed by template event name."
---
<!-- api-export:@sheetwrite/vue|.|SheetwriteGridEmits -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/vue/">@sheetwrite/vue</a><span class="api-status" data-kind="interface">interface</span></div>

Event payloads emitted by the Vue components, keyed by template event name.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/vue</code></dd></div>
<div><dt>Source</dt><dd><code>packages/vue/src/index.ts#L121</code></dd></div>
</dl>

<nav class="api-member-index" aria-label="Member index" data-pagefind-ignore>
<a href="#sheetwrite-grid-emits-row-delta"><code>row-delta</code></a>
<a href="#sheetwrite-grid-emits-grid-change"><code>grid-change</code></a>
<a href="#sheetwrite-grid-emits-selection-change"><code>selection-change</code></a>
<a href="#sheetwrite-grid-emits-viewport-change"><code>viewport-change</code></a>
<a href="#sheetwrite-grid-emits-edit-begin"><code>edit-begin</code></a>
<a href="#sheetwrite-grid-emits-edit-commit"><code>edit-commit</code></a>
<a href="#sheetwrite-grid-emits-search"><code>search</code></a>
<a href="#sheetwrite-grid-emits-command-state-change"><code>command-state-change</code></a>
<a href="#sheetwrite-grid-emits-active-sheet-change"><code>active-sheet-change</code></a>
<a href="#sheetwrite-grid-emits-mutation-rejected"><code>mutation-rejected</code></a>
<a href="#sheetwrite-grid-emits-renderer-fallback"><code>renderer-fallback</code></a>
<a href="#sheetwrite-grid-emits-datasource-error"><code>datasource-error</code></a>
<a href="#sheetwrite-grid-emits-export-error"><code>export-error</code></a>
<a href="#sheetwrite-grid-emits-ready"><code>ready</code></a>
<a href="#sheetwrite-grid-emits-initialization-error"><code>initialization-error</code></a>
</nav>

## Members <span class="api-count" data-pagefind-ignore>15</span>

<div class="api-member-list">

<details class="api-member" id="sheetwrite-grid-emits-row-delta" data-pagefind-weight="1" open>
<summary><code>row-delta</code> <span class="api-member-summary">Projected host-row changes.</span></summary>

<button class="api-copy" type="button" data-copy-code="&quot;row-delta&quot;: Parameters&lt;RowBridgeHandler&lt;Id&gt;&gt;[0];" data-pagefind-ignore>Copy</button>

```ts generated
"row-delta": Parameters<RowBridgeHandler<Id>>[0];
```

</details>

<details class="api-member" id="sheetwrite-grid-emits-grid-change" data-pagefind-weight="1" open>
<summary><code>grid-change</code> <span class="api-member-summary">Committed Grid change, including its applied transaction.</span></summary>

<button class="api-copy" type="button" data-copy-code="&quot;grid-change&quot;: ChangeEvent;" data-pagefind-ignore>Copy</button>

```ts generated
"grid-change": ChangeEvent;
```

</details>

<details class="api-member" id="sheetwrite-grid-emits-selection-change" data-pagefind-weight="1" open>
<summary><code>selection-change</code> <span class="api-member-summary">Current selection, or null after it is cleared.</span></summary>

<button class="api-copy" type="button" data-copy-code="&quot;selection-change&quot;: Selection | null;" data-pagefind-ignore>Copy</button>

```ts generated
"selection-change": Selection | null;
```

</details>

<details class="api-member" id="sheetwrite-grid-emits-viewport-change" data-pagefind-weight="1" open>
<summary><code>viewport-change</code> <span class="api-member-summary">Visible row bounds and vertical scroll offset after scrolling.</span></summary>

<button class="api-copy" type="button" data-copy-code="&quot;viewport-change&quot;: GridEvents[&quot;scroll&quot;];" data-pagefind-ignore>Copy</button>

```ts generated
"viewport-change": GridEvents["scroll"];
```

</details>

<details class="api-member" id="sheetwrite-grid-emits-edit-begin" data-pagefind-weight="1" open>
<summary><code>edit-begin</code> <span class="api-member-summary">Cell editing began.</span></summary>

<button class="api-copy" type="button" data-copy-code="&quot;edit-begin&quot;: GridEvents[&quot;edit-begin&quot;];" data-pagefind-ignore>Copy</button>

```ts generated
"edit-begin": GridEvents["edit-begin"];
```

</details>

<details class="api-member" id="sheetwrite-grid-emits-edit-commit" data-pagefind-weight="1" open>
<summary><code>edit-commit</code> <span class="api-member-summary">An edit committed its parsed cell value.</span></summary>

<button class="api-copy" type="button" data-copy-code="&quot;edit-commit&quot;: GridEvents[&quot;edit-commit&quot;];" data-pagefind-ignore>Copy</button>

```ts generated
"edit-commit": GridEvents["edit-commit"];
```

</details>

<details class="api-member" id="sheetwrite-grid-emits-search" data-pagefind-weight="1" open>
<summary><code>search</code> <span class="api-member-summary">Refreshed search matches and active-match index.</span></summary>

<button class="api-copy" type="button" data-copy-code="search: GridEvents[&quot;search&quot;];" data-pagefind-ignore>Copy</button>

```ts generated
search: GridEvents["search"];
```

</details>

<details class="api-member" id="sheetwrite-grid-emits-command-state-change" data-pagefind-weight="1" open>
<summary><code>command-state-change</code> <span class="api-member-summary">Command availability or formatting activity changed.</span></summary>

<button class="api-copy" type="button" data-copy-code="&quot;command-state-change&quot;: GridEvents[&quot;command-state-change&quot;];" data-pagefind-ignore>Copy</button>

```ts generated
"command-state-change": GridEvents["command-state-change"];
```

</details>

<details class="api-member" id="sheetwrite-grid-emits-active-sheet-change" data-pagefind-weight="1" open>
<summary><code>active-sheet-change</code> <span class="api-member-summary">The visible sheet changed.</span></summary>

<button class="api-copy" type="button" data-copy-code="&quot;active-sheet-change&quot;: GridEvents[&quot;active-sheet&quot;];" data-pagefind-ignore>Copy</button>

```ts generated
"active-sheet-change": GridEvents["active-sheet"];
```

</details>

<details class="api-member" id="sheetwrite-grid-emits-mutation-rejected" data-pagefind-weight="1" open>
<summary><code>mutation-rejected</code> <span class="api-member-summary">A Grid mutation was rejected.</span></summary>

<button class="api-copy" type="button" data-copy-code="&quot;mutation-rejected&quot;: GridEvents[&quot;mutation-rejected&quot;];" data-pagefind-ignore>Copy</button>

```ts generated
"mutation-rejected": GridEvents["mutation-rejected"];
```

</details>

<details class="api-member" id="sheetwrite-grid-emits-renderer-fallback" data-pagefind-weight="1" open>
<summary><code>renderer-fallback</code> <span class="api-member-summary">Worker rendering fell back to the main-thread canvas renderer.</span></summary>

<button class="api-copy" type="button" data-copy-code="&quot;renderer-fallback&quot;: GridEvents[&quot;renderer-fallback&quot;];" data-pagefind-ignore>Copy</button>

```ts generated
"renderer-fallback": GridEvents["renderer-fallback"];
```

</details>

<details class="api-member" id="sheetwrite-grid-emits-datasource-error" data-pagefind-weight="1" open>
<summary><code>datasource-error</code> <span class="api-member-summary">A datasource request failed.</span></summary>

<button class="api-copy" type="button" data-copy-code="&quot;datasource-error&quot;: GridEvents[&quot;datasource-error&quot;];" data-pagefind-ignore>Copy</button>

```ts generated
"datasource-error": GridEvents["datasource-error"];
```

</details>

<details class="api-member" id="sheetwrite-grid-emits-export-error" data-pagefind-weight="1" open>
<summary><code>export-error</code> <span class="api-member-summary">A built-in XLSX export action failed.</span></summary>

<button class="api-copy" type="button" data-copy-code="&quot;export-error&quot;: GridEvents[&quot;export-error&quot;];" data-pagefind-ignore>Copy</button>

```ts generated
"export-error": GridEvents["export-error"];
```

</details>

<details class="api-member" id="sheetwrite-grid-emits-ready" data-pagefind-weight="1" open>
<summary><code>ready</code> <span class="api-member-summary">The adapter published a ready Grid generation.</span></summary>

<button class="api-copy" type="button" data-copy-code="ready: GridReadyEvent;" data-pagefind-ignore>Copy</button>

```ts generated
ready: GridReadyEvent;
```

</details>

<details class="api-member" id="sheetwrite-grid-emits-initialization-error" data-pagefind-weight="1" open>
<summary><code>initialization-error</code> <span class="api-member-summary">WASM initialization failed while the component stayed mounted.</span></summary>

<button class="api-copy" type="button" data-copy-code="&quot;initialization-error&quot;: SheetwriteError;" data-pagefind-ignore>Copy</button>

```ts generated
"initialization-error": SheetwriteError;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface SheetwriteGridEmits&lt;Id extends RowBridgeId = RowBridgeId&gt; {&#10;  &quot;row-delta&quot;: Parameters&lt;RowBridgeHandler&lt;Id&gt;&gt;[0];&#10;  &quot;grid-change&quot;: ChangeEvent;&#10;  &quot;selection-change&quot;: Selection | null;&#10;  &quot;viewport-change&quot;: GridEvents[&quot;scroll&quot;];&#10;  &quot;edit-begin&quot;: GridEvents[&quot;edit-begin&quot;];&#10;  &quot;edit-commit&quot;: GridEvents[&quot;edit-commit&quot;];&#10;  search: GridEvents[&quot;search&quot;];&#10;  &quot;command-state-change&quot;: GridEvents[&quot;command-state-change&quot;];&#10;  &quot;active-sheet-change&quot;: GridEvents[&quot;active-sheet&quot;];&#10;  &quot;mutation-rejected&quot;: GridEvents[&quot;mutation-rejected&quot;];&#10;  &quot;renderer-fallback&quot;: GridEvents[&quot;renderer-fallback&quot;];&#10;  &quot;datasource-error&quot;: GridEvents[&quot;datasource-error&quot;];&#10;  &quot;export-error&quot;: GridEvents[&quot;export-error&quot;];&#10;  ready: GridReadyEvent;&#10;  &quot;initialization-error&quot;: SheetwriteError;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
export interface SheetwriteGridEmits<Id extends RowBridgeId = RowBridgeId> {
  "row-delta": Parameters<RowBridgeHandler<Id>>[0];
  "grid-change": ChangeEvent;
  "selection-change": Selection | null;
  "viewport-change": GridEvents["scroll"];
  "edit-begin": GridEvents["edit-begin"];
  "edit-commit": GridEvents["edit-commit"];
  search: GridEvents["search"];
  "command-state-change": GridEvents["command-state-change"];
  "active-sheet-change": GridEvents["active-sheet"];
  "mutation-rejected": GridEvents["mutation-rejected"];
  "renderer-fallback": GridEvents["renderer-fallback"];
  "datasource-error": GridEvents["datasource-error"];
  "export-error": GridEvents["export-error"];
  ready: GridReadyEvent;
  "initialization-error": SheetwriteError;
}
```

</details>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/vue</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>SheetwriteGridEmits</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/vue/sheetwrite/"><code>Sheetwrite</code></a><span class="api-consumer-kind">@sheetwrite/vue</span></li>
<li><a href="/docs/api/vue/sheetwrite-grid/"><code>SheetwriteGrid</code></a><span class="api-consumer-kind">@sheetwrite/vue</span></li>
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
