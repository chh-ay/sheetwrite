---
title: "SheetwriteComponentConstructor | @sheetwrite/vue"
description: "Vue constructor type for Sheetwrite components: Sheetwrite-owned props, emitted events exposed as on listener props, and the exposed instance surface reachable through a template ref."
---
<!-- api-export:@sheetwrite/vue|.|SheetwriteComponentConstructor -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/vue/">@sheetwrite/vue</a><span class="api-status" data-kind="type">type</span></div>

Vue constructor type for Sheetwrite components: Sheetwrite-owned props,
emitted events exposed as `on*` listener props, and the exposed instance
surface reachable through a template ref.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/vue</code></dd></div>
<div><dt>Source</dt><dd><code>packages/vue/src/index.ts#L159</code></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

<button class="api-copy" type="button" data-copy-code="export type SheetwriteComponentConstructor&lt;&#10;  Props,&#10;  Emits,&#10;  Expose = object,&#10;&gt; = new () =&gt; Expose &amp;&#10;  ComponentPublicInstance &amp; {&#10;    $props: AllowedComponentProps &amp;&#10;      Props &amp;&#10;      VNodeProps &amp; {&#10;        [&#10;          EventName in keyof Emits &amp; string as `on${Capitalize&lt;EventName&gt;}`&#10;        ]?: (payload: Emits[EventName]) =&gt; void;&#10;      };&#10;  };" data-pagefind-ignore>Copy</button>

```ts generated
export type SheetwriteComponentConstructor<
  Props,
  Emits,
  Expose = object,
> = new () => Expose &
  ComponentPublicInstance & {
    $props: AllowedComponentProps &
      Props &
      VNodeProps & {
        [
          EventName in keyof Emits & string as `on${Capitalize<EventName>}`
        ]?: (payload: Emits[EventName]) => void;
      };
  };
```

</div>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/vue</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>SheetwriteComponentConstructor</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/vue/sheetwrite/"><code>Sheetwrite</code></a><span class="api-consumer-kind">@sheetwrite/vue</span></li>
<li><a href="/docs/api/vue/sheetwrite-grid/"><code>SheetwriteGrid</code></a><span class="api-consumer-kind">@sheetwrite/vue</span></li>
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
