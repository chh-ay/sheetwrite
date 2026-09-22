---
title: "PresenceCoordinatorOptions | @sheetwrite/core"
description: "Identity, privacy, and timing options for presence coordination."
---
<!-- api-export:@sheetwrite/core|.|PresenceCoordinatorOptions -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Identity, privacy, and timing options for presence coordination.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/collaboration.ts#L40</code></dd></div>
</dl>

<nav class="api-member-index" aria-label="Member index" data-pagefind-ignore>
<a href="#presence-coordinator-options-actor"><code>actor</code></a>
<a href="#presence-coordinator-options-privacy"><code>privacy</code></a>
<a href="#presence-coordinator-options-heartbeat-ms"><code>heartbeatMs</code></a>
<a href="#presence-coordinator-options-timeout-ms"><code>timeoutMs</code></a>
<a href="#presence-coordinator-options-max-actors"><code>maxActors</code></a>
<a href="#presence-coordinator-options-max-ranges-per-actor"><code>maxRangesPerActor</code></a>
<a href="#presence-coordinator-options-now"><code>now</code></a>
</nav>

## Members <span class="api-count" data-pagefind-ignore>7</span>

<div class="api-member-list">

<details class="api-member" id="presence-coordinator-options-actor" data-pagefind-weight="1" open>
<summary><code>actor</code></summary>

<button class="api-copy" type="button" data-copy-code="actor: PresenceActor;" data-pagefind-ignore>Copy</button>

```ts generated
actor: PresenceActor;
```

</details>

<details class="api-member" id="presence-coordinator-options-privacy" data-pagefind-weight="1" open>
<summary><code>privacy</code></summary>

<button class="api-copy" type="button" data-copy-code="privacy?: PresencePrivacyOptions;" data-pagefind-ignore>Copy</button>

```ts generated
privacy?: PresencePrivacyOptions;
```

</details>

<details class="api-member" id="presence-coordinator-options-heartbeat-ms" data-pagefind-weight="1" open>
<summary><code>heartbeatMs</code> <span class="api-member-summary">Publish/prune interval in milliseconds; defaults to 15,000.</span></summary>

<button class="api-copy" type="button" data-copy-code="heartbeatMs?: number;" data-pagefind-ignore>Copy</button>

```ts generated
heartbeatMs?: number;
```

<p class="api-member-doc">Publish/prune interval in milliseconds; defaults to 15,000. Use 0 to disable the timer.</p>
</details>

<details class="api-member" id="presence-coordinator-options-timeout-ms" data-pagefind-weight="1" open>
<summary><code>timeoutMs</code> <span class="api-member-summary">Idle receipt time before a remote actor expires; defaults to 45,000 milliseconds.</span></summary>

<button class="api-copy" type="button" data-copy-code="timeoutMs?: number;" data-pagefind-ignore>Copy</button>

```ts generated
timeoutMs?: number;
```

</details>

<details class="api-member" id="presence-coordinator-options-max-actors" data-pagefind-weight="1" open>
<summary><code>maxActors</code> <span class="api-member-summary">Remote actors retained at once; defaults to 32 and is clamped to at least 1.</span></summary>

<button class="api-copy" type="button" data-copy-code="maxActors?: number;" data-pagefind-ignore>Copy</button>

```ts generated
maxActors?: number;
```

</details>

<details class="api-member" id="presence-coordinator-options-max-ranges-per-actor" data-pagefind-weight="1" open>
<summary><code>maxRangesPerActor</code> <span class="api-member-summary">Selection ranges sent or accepted per actor; defaults to 8 and is clamped to at least 1.</span></summary>

<button class="api-copy" type="button" data-copy-code="maxRangesPerActor?: number;" data-pagefind-ignore>Copy</button>

```ts generated
maxRangesPerActor?: number;
```

</details>

<details class="api-member" id="presence-coordinator-options-now" data-pagefind-weight="1" open>
<summary><code>now</code></summary>

<button class="api-copy" type="button" data-copy-code="now?: () =&gt; number;" data-pagefind-ignore>Copy</button>

```ts generated
now?: () => number;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface PresenceCoordinatorOptions {&#10;  actor: PresenceActor;&#10;  privacy?: PresencePrivacyOptions;&#10;  heartbeatMs?: number;&#10;  timeoutMs?: number;&#10;  maxActors?: number;&#10;  maxRangesPerActor?: number;&#10;  now?: () =&gt; number;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
export interface PresenceCoordinatorOptions {
  actor: PresenceActor;
  privacy?: PresencePrivacyOptions;
  heartbeatMs?: number;
  timeoutMs?: number;
  maxActors?: number;
  maxRangesPerActor?: number;
  now?: () => number;
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

<p class="api-consumers-label">Public exports naming <code>PresenceCoordinatorOptions</code></p>

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
