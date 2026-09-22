---
title: "SheetwriteErrorEnvelope | @sheetwrite/core"
description: "Structural form preserved across realms and JSON serialization."
---
<!-- api-export:@sheetwrite/core|.|SheetwriteErrorEnvelope -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Structural form preserved across realms and JSON serialization.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/errors.ts#L97</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>6</span>

<div class="api-member-list">

<details class="api-member" id="sheetwrite-error-envelope-name" data-pagefind-weight="1" open>
<summary><code>name</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly name: string;" data-pagefind-ignore>Copy</button>

```ts generated
readonly name: string;
```

</details>

<details class="api-member" id="sheetwrite-error-envelope-message" data-pagefind-weight="1" open>
<summary><code>message</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly message: string;" data-pagefind-ignore>Copy</button>

```ts generated
readonly message: string;
```

</details>

<details class="api-member" id="sheetwrite-error-envelope-code" data-pagefind-weight="1" open>
<summary><code>code</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly code: SheetwriteErrorCode;" data-pagefind-ignore>Copy</button>

```ts generated
readonly code: SheetwriteErrorCode;
```

</details>

<details class="api-member" id="sheetwrite-error-envelope-operation" data-pagefind-weight="1" open>
<summary><code>operation</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly operation: SheetwriteErrorOperation;" data-pagefind-ignore>Copy</button>

```ts generated
readonly operation: SheetwriteErrorOperation;
```

</details>

<details class="api-member" id="sheetwrite-error-envelope-context" data-pagefind-weight="1" open>
<summary><code>context</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly context?: SheetwriteErrorContext;" data-pagefind-ignore>Copy</button>

```ts generated
readonly context?: SheetwriteErrorContext;
```

</details>

<details class="api-member" id="sheetwrite-error-envelope-retryable" data-pagefind-weight="1" open>
<summary><code>retryable</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly retryable?: boolean;" data-pagefind-ignore>Copy</button>

```ts generated
readonly retryable?: boolean;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface SheetwriteErrorEnvelope {&#10;  readonly name: string;&#10;  readonly message: string;&#10;  readonly code: SheetwriteErrorCode;&#10;  readonly operation: SheetwriteErrorOperation;&#10;  readonly context?: SheetwriteErrorContext;&#10;  readonly retryable?: boolean;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
export interface SheetwriteErrorEnvelope {
  readonly name: string;
  readonly message: string;
  readonly code: SheetwriteErrorCode;
  readonly operation: SheetwriteErrorOperation;
  readonly context?: SheetwriteErrorContext;
  readonly retryable?: boolean;
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

<p class="api-consumers-label">Public exports naming <code>SheetwriteErrorEnvelope</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/is-sheetwrite-error/"><code>isSheetwriteError</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/sheetwrite-error/"><code>SheetwriteError</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-adapter/is-sheetwrite-error/"><code>isSheetwriteError</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-adapter/sheetwrite-error/"><code>SheetwriteError</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
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
