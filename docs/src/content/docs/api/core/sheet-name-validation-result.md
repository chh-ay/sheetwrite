---
title: "SheetNameValidationResult | @sheetwrite/core"
description: "Successful canonical name or an actionable validation failure."
---
<!-- api-export:@sheetwrite/core|.|SheetNameValidationResult -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

Successful canonical name or an actionable validation failure.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/document.ts#L24</code></dd></div>
</dl>

## Variants <span class="api-count" data-pagefind-ignore>2</span>

<div class="api-variant-list" data-pagefind-ignore>
<div class="api-variant">

<button class="api-copy" type="button" data-copy-code="{&#10;  readonly ok: true;&#10;  readonly name: string;&#10;  readonly key: string;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
{
  readonly ok: true;
  readonly name: string;
  readonly key: string;
}
```

</div>
<div class="api-variant">

<button class="api-copy" type="button" data-copy-code="{&#10;  readonly ok: false;&#10;  readonly code: SheetNameIssueCode;&#10;  readonly name: string;&#10;  readonly key: string;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
{
  readonly ok: false;
  readonly code: SheetNameIssueCode;
  readonly name: string;
  readonly key: string;
}
```

</div>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export type SheetNameValidationResult =&#10;  | {&#10;      readonly ok: true;&#10;      readonly name: string;&#10;      readonly key: string;&#10;    }&#10;  | {&#10;      readonly ok: false;&#10;      readonly code: SheetNameIssueCode;&#10;      readonly name: string;&#10;      readonly key: string;&#10;    };" data-pagefind-ignore>Copy</button>

```ts generated
export type SheetNameValidationResult =
  | {
      readonly ok: true;
      readonly name: string;
      readonly key: string;
    }
  | {
      readonly ok: false;
      readonly code: SheetNameIssueCode;
      readonly name: string;
      readonly key: string;
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

<p class="api-consumers-label">Public exports naming <code>SheetNameValidationResult</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/validate-sheet-name/"><code>validateSheetName</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
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
