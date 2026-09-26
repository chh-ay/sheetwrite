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
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/vue/src/index.ts#L159"><code>packages/vue/src/index.ts#L159</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

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
