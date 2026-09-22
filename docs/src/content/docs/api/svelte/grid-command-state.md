---
title: "GridCommandState | @sheetwrite/svelte"
description: "Observable availability and selection-derived activity for one command."
---
<!-- api-export:@sheetwrite/svelte|.|GridCommandState -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/svelte/">@sheetwrite/svelte</a><span class="api-status" data-kind="interface">interface</span></div>

Observable availability and selection-derived activity for one command.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/svelte</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/dist/types/grid.d.ts#L107</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>2</span>

<div class="api-member-list">

<details class="api-member" id="grid-command-state-disabled" data-pagefind-weight="1" open>
<summary><code>disabled</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly disabled: boolean;" data-pagefind-ignore>Copy</button>

```ts generated
readonly disabled: boolean;
```

</details>

<details class="api-member" id="grid-command-state-activity" data-pagefind-weight="1" open>
<summary><code>activity</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly activity: &quot;inactive&quot; | &quot;active&quot; | &quot;mixed&quot;;" data-pagefind-ignore>Copy</button>

```ts generated
readonly activity: "inactive" | "active" | "mixed";
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface GridCommandState {&#10;  readonly disabled: boolean;&#10;  readonly activity: &quot;inactive&quot; | &quot;active&quot; | &quot;mixed&quot;;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
export interface GridCommandState {
  readonly disabled: boolean;
  readonly activity: "inactive" | "active" | "mixed";
}
```

</details>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/svelte</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>GridCommandState</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/grid/"><code>Grid</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/grid-command-state-change-event/"><code>GridCommandStateChangeEvent</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
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
