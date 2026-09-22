---
title: "PresenceCoordinator | @sheetwrite/core"
description: "Ephemeral presence lifecycle; it never calls a document mutation API."
---
<!-- api-export:@sheetwrite/core|.|PresenceCoordinator -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="class">class</span></div>

Ephemeral presence lifecycle; it never calls a document mutation API.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/collaboration.ts#L78</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>6</span>

<div class="api-member-list">

<details class="api-member" id="presence-coordinator-constructor" data-pagefind-weight="1" open>
<summary><code>constructor</code></summary>

<button class="api-copy" type="button" data-copy-code="constructor(grid: Grid, transport: PresenceTransport, options: PresenceCoordinatorOptions);" data-pagefind-ignore>Copy</button>

```ts generated
constructor(grid: Grid, transport: PresenceTransport, options: PresenceCoordinatorOptions);
```

</details>

<details class="api-member" id="presence-coordinator-destroy" data-pagefind-weight="1" open>
<summary><code>destroy</code></summary>

<button class="api-copy" type="button" data-copy-code="destroy: () =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
destroy: () => void;
```

</details>

<details class="api-member" id="presence-coordinator-on" data-pagefind-weight="1" open>
<summary><code>on</code></summary>

<button class="api-copy" type="button" data-copy-code="on: (listener: PresenceListener) =&gt; () =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
on: (listener: PresenceListener) => () => void;
```

</details>

<details class="api-member" id="presence-coordinator-prune-stale" data-pagefind-weight="1" open>
<summary><code>pruneStale</code></summary>

<button class="api-copy" type="button" data-copy-code="pruneStale: () =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
pruneStale: () => void;
```

</details>

<details class="api-member" id="presence-coordinator-publish-now" data-pagefind-weight="1" open>
<summary><code>publishNow</code></summary>

<button class="api-copy" type="button" data-copy-code="publishNow: () =&gt; Promise&lt;void&gt;;" data-pagefind-ignore>Copy</button>

```ts generated
publishNow: () => Promise<void>;
```

</details>

<details class="api-member" id="presence-coordinator-remote-presence" data-pagefind-weight="1" open>
<summary><code>remotePresence</code></summary>

<button class="api-copy" type="button" data-copy-code="remotePresence: () =&gt; readonly PresenceMessage[]" data-pagefind-ignore>Copy</button>

```ts generated
remotePresence: () => readonly PresenceMessage[]
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="class PresenceCoordinator {&#10;  constructor(&#10;    grid: Grid,&#10;    transport: PresenceTransport,&#10;    options: PresenceCoordinatorOptions,&#10;  );&#10;  destroy: () =&gt; void;&#10;  on: (listener: PresenceListener) =&gt; () =&gt; void;&#10;  pruneStale: () =&gt; void;&#10;  publishNow: () =&gt; Promise&lt;void&gt;;&#10;  remotePresence: () =&gt; readonly PresenceMessage[];&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
class PresenceCoordinator {
  constructor(
    grid: Grid,
    transport: PresenceTransport,
    options: PresenceCoordinatorOptions,
  );
  destroy: () => void;
  on: (listener: PresenceListener) => () => void;
  pruneStale: () => void;
  publishNow: () => Promise<void>;
  remotePresence: () => readonly PresenceMessage[];
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

<p class="api-consumers-label">Public exports naming <code>PresenceCoordinator</code></p>

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
