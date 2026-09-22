---
title: "DataValidationRule | @sheetwrite/core"
description: "One stable, range-scoped data-entry rule."
---
<!-- api-export:@sheetwrite/core|.|DataValidationRule -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

One stable, range-scoped data-entry rule. Blank cells are allowed unless disabled.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/document.ts#L176</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>6</span>

<div class="api-member-list">

<details class="api-member" id="data-validation-rule-id" data-pagefind-weight="1" open>
<summary><code>id</code></summary>

<button class="api-copy" type="button" data-copy-code="id: string;" data-pagefind-ignore>Copy</button>

```ts generated
id: string;
```

</details>

<details class="api-member" id="data-validation-rule-range" data-pagefind-weight="1" open>
<summary><code>range</code></summary>

<button class="api-copy" type="button" data-copy-code="range: Range;" data-pagefind-ignore>Copy</button>

```ts generated
range: Range;
```

</details>

<details class="api-member" id="data-validation-rule-condition" data-pagefind-weight="1" open>
<summary><code>condition</code></summary>

<button class="api-copy" type="button" data-copy-code="condition: DataValidationCondition;" data-pagefind-ignore>Copy</button>

```ts generated
condition: DataValidationCondition;
```

</details>

<details class="api-member" id="data-validation-rule-policy" data-pagefind-weight="1" open>
<summary><code>policy</code></summary>

<button class="api-copy" type="button" data-copy-code="policy: ValidationPolicy;" data-pagefind-ignore>Copy</button>

```ts generated
policy: ValidationPolicy;
```

</details>

<details class="api-member" id="data-validation-rule-allow-blank" data-pagefind-weight="1" open>
<summary><code>allowBlank</code></summary>

<button class="api-copy" type="button" data-copy-code="allowBlank?: boolean;" data-pagefind-ignore>Copy</button>

```ts generated
allowBlank?: boolean;
```

</details>

<details class="api-member" id="data-validation-rule-help-text" data-pagefind-weight="1" open>
<summary><code>helpText</code></summary>

<button class="api-copy" type="button" data-copy-code="helpText?: string;" data-pagefind-ignore>Copy</button>

```ts generated
helpText?: string;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface DataValidationRule {&#10;  id: string;&#10;  range: Range;&#10;  condition: DataValidationCondition;&#10;  policy: ValidationPolicy;&#10;  allowBlank?: boolean;&#10;  helpText?: string;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
export interface DataValidationRule {
  id: string;
  range: Range;
  condition: DataValidationCondition;
  policy: ValidationPolicy;
  allowBlank?: boolean;
  helpText?: string;
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

<p class="api-consumers-label">Public exports naming <code>DataValidationRule</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/document-op/"><code>DocumentOp</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/grid/"><code>Grid</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/sheet/"><code>Sheet</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/sheet-snapshot/"><code>SheetSnapshot</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
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
