---
title: "RevisionCoordinatorEvent | @sheetwrite/core"
description: "State or restore transition emitted by revision coordination."
---
<!-- api-export:@sheetwrite/core|.|RevisionCoordinatorEvent -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

State or restore transition emitted by revision coordination.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/collaboration.ts#L287</code></dd></div>
</dl>

## Variants <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-variant-list" data-pagefind-ignore>
<div class="api-variant">

<button class="api-copy" type="button" data-copy-code="{ type: &quot;restored&quot;; targetVersion: number; version: number }" data-pagefind-ignore>Copy</button>

```ts generated
{ type: "restored"; targetVersion: number; version: number }
```

</div>
<div class="api-variant">

<button class="api-copy" type="button" data-copy-code="{&#10;  type: &quot;conflict&quot;;&#10;  targetVersion: number;&#10;  currentVersion: number;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
{
  type: "conflict";
  targetVersion: number;
  currentVersion: number;
}
```

</div>
<div class="api-variant">

<button class="api-copy" type="button" data-copy-code="{ type: &quot;error&quot;; error: SheetwriteError }" data-pagefind-ignore>Copy</button>

```ts generated
{ type: "error"; error: SheetwriteError }
```

</div>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export type RevisionCoordinatorEvent =&#10;  | {&#10;      type: &quot;restored&quot;;&#10;      targetVersion: number;&#10;      version: number;&#10;    }&#10;  | {&#10;      type: &quot;conflict&quot;;&#10;      targetVersion: number;&#10;      currentVersion: number;&#10;    }&#10;  | {&#10;      type: &quot;error&quot;;&#10;      error: SheetwriteError;&#10;    };" data-pagefind-ignore>Copy</button>

```ts generated
export type RevisionCoordinatorEvent =
  | {
      type: "restored";
      targetVersion: number;
      version: number;
    }
  | {
      type: "conflict";
      targetVersion: number;
      currentVersion: number;
    }
  | {
      type: "error";
      error: SheetwriteError;
    };
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

<p class="api-consumers-label">Public exports naming <code>RevisionCoordinatorEvent</code></p>

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
