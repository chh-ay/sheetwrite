---
title: "IncompleteDataError | @sheetwrite/core"
description: "Error thrown when an operation requires datasource cells that are not loaded."
---
<!-- api-export:@sheetwrite/core|.|IncompleteDataError -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="class">class</span></div>

Error thrown when an operation requires datasource cells that are not loaded.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/store/data-engine.ts#L242</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-member-list">

<details class="api-member" id="incomplete-data-error-constructor" data-pagefind-weight="1" open>
<summary><code>constructor</code></summary>

<button class="api-copy" type="button" data-copy-code="constructor(sheet: SheetId, capability: Extract&lt;QueryCapability, { status: &quot;incomplete&quot;; }&gt;);" data-pagefind-ignore>Copy</button>

```ts generated
constructor(sheet: SheetId, capability: Extract<QueryCapability, { status: "incomplete"; }>);
```

</details>

<details class="api-member" id="incomplete-data-error-capability" data-pagefind-weight="1" open>
<summary><code>capability</code></summary>

<button class="api-copy" type="button" data-copy-code="capability: { status: &quot;incomplete&quot;; loadedCells: number; totalCells: number; };" data-pagefind-ignore>Copy</button>

```ts generated
capability: { status: "incomplete"; loadedCells: number; totalCells: number; };
```

</details>

<details class="api-member" id="incomplete-data-error-name" data-pagefind-weight="1" open>
<summary><code>name</code></summary>

<button class="api-copy" type="button" data-copy-code="name: &quot;IncompleteDataError&quot;" data-pagefind-ignore>Copy</button>

```ts generated
name: "IncompleteDataError"
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="class IncompleteDataError extends SheetwriteError {&#10;  constructor(&#10;    sheet: SheetId,&#10;    capability: Extract&lt;&#10;      QueryCapability,&#10;      {&#10;        status: &quot;incomplete&quot;;&#10;      }&#10;    &gt;,&#10;  );&#10;  capability: {&#10;    status: &quot;incomplete&quot;;&#10;    loadedCells: number;&#10;    totalCells: number;&#10;  };&#10;  name: &quot;IncompleteDataError&quot;;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
class IncompleteDataError extends SheetwriteError {
  constructor(
    sheet: SheetId,
    capability: Extract<
      QueryCapability,
      {
        status: "incomplete";
      }
    >,
  );
  capability: {
    status: "incomplete";
    loadedCells: number;
    totalCells: number;
  };
  name: "IncompleteDataError";
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

<p class="api-consumers-label">Public exports naming <code>IncompleteDataError</code></p>

<ul class="api-consumer-list">
<li>None.</li>
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
