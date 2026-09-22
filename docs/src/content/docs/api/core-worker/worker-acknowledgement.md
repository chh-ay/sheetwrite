---
title: "WorkerAcknowledgement | @sheetwrite/core/worker"
description: "Lifecycle and frame acknowledgements posted back to the sender."
---
<!-- api-export:@sheetwrite/core|./worker|WorkerAcknowledgement -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-worker/">@sheetwrite/core/worker</a><span class="api-status" data-kind="type">type</span></div>

Lifecycle and frame acknowledgements posted back to the sender.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core/worker</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/worker.ts#L249</code></dd></div>
</dl>

## Variants <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-variant-list" data-pagefind-ignore>
<div class="api-variant">

<button class="api-copy" type="button" data-copy-code="{ type: &quot;ready&quot; }" data-pagefind-ignore>Copy</button>

```ts generated
{ type: "ready" }
```

</div>
<div class="api-variant">

<button class="api-copy" type="button" data-copy-code="{ type: &quot;fatal&quot;; reason: string }" data-pagefind-ignore>Copy</button>

```ts generated
{ type: "fatal"; reason: string }
```

</div>
<div class="api-variant">

<button class="api-copy" type="button" data-copy-code="{ type: &quot;painted&quot; }" data-pagefind-ignore>Copy</button>

```ts generated
{ type: "painted" }
```

</div>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export type WorkerAcknowledgement =&#10;  | {&#10;      type: &quot;ready&quot;;&#10;    }&#10;  | {&#10;      type: &quot;fatal&quot;;&#10;      reason: string;&#10;    }&#10;  | {&#10;      type: &quot;painted&quot;;&#10;    };" data-pagefind-ignore>Copy</button>

```ts generated
export type WorkerAcknowledgement =
  | {
      type: "ready";
    }
  | {
      type: "fatal";
      reason: string;
    }
  | {
      type: "painted";
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

<p class="api-consumers-label">Public exports naming <code>WorkerAcknowledgement</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core-worker/create-worker-message-handler/"><code>createWorkerMessageHandler</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
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
