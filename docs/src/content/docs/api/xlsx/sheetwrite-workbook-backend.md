---
title: "sheetwriteWorkbookBackend | @sheetwrite/xlsx"
description: "Deterministic optional OOXML workbook backend implemented by Sheetwrite."
---
<!-- api-export:@sheetwrite/xlsx|.|sheetwriteWorkbookBackend -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/xlsx/">@sheetwrite/xlsx</a><span class="api-status" data-kind="variable">variable</span></div>

Deterministic optional OOXML workbook backend implemented by Sheetwrite.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/xlsx</code></dd></div>
<div><dt>Source</dt><dd><code>packages/xlsx/src/workbook.ts#L7</code></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

<button class="api-copy" type="button" data-copy-code="const sheetwriteWorkbookBackend: XlsxWorkbookBackend" data-pagefind-ignore>Copy</button>

```ts generated
const sheetwriteWorkbookBackend: XlsxWorkbookBackend
```

</div>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/xlsx</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>sheetwriteWorkbookBackend</code></p>

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
