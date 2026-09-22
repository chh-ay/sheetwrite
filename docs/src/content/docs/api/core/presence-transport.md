---
title: "PresenceTransport | @sheetwrite/core"
description: "Host transport contract for ephemeral presence messages."
---
<!-- api-export:@sheetwrite/core|.|PresenceTransport -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Host transport contract for ephemeral presence messages.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/collaboration.ts#L23</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>2</span>

<div class="api-member-list">

<details class="api-member" id="presence-transport-publish" data-pagefind-weight="1" open>
<summary><code>publish</code></summary>

<button class="api-copy" type="button" data-copy-code="publish(message: PresenceMessage, signal?: AbortSignal): void | Promise&lt;void&gt;;" data-pagefind-ignore>Copy</button>

```ts generated
publish(message: PresenceMessage, signal?: AbortSignal): void | Promise<void>;
```

</details>

<details class="api-member" id="presence-transport-subscribe" data-pagefind-weight="1">
<summary><code>subscribe</code></summary>

<button class="api-copy" type="button" data-copy-code="subscribe( listener: (message: PresenceMessage) =&gt; void, signal?: AbortSignal, ): undefined | (() =&gt; void);" data-pagefind-ignore>Copy</button>

```ts generated
subscribe( listener: (message: PresenceMessage) => void, signal?: AbortSignal, ): undefined | (() => void);
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface PresenceTransport {&#10;  publish(&#10;    message: PresenceMessage,&#10;    signal?: AbortSignal,&#10;  ): void | Promise&lt;void&gt;;&#10;  subscribe(&#10;    listener: (message: PresenceMessage) =&gt; void,&#10;    signal?: AbortSignal,&#10;  ): undefined | (() =&gt; void);&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
export interface PresenceTransport {
  publish(
    message: PresenceMessage,
    signal?: AbortSignal,
  ): void | Promise<void>;
  subscribe(
    listener: (message: PresenceMessage) => void,
    signal?: AbortSignal,
  ): undefined | (() => void);
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

<p class="api-consumers-label">Public exports naming <code>PresenceTransport</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/presence-coordinator/"><code>PresenceCoordinator</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
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
