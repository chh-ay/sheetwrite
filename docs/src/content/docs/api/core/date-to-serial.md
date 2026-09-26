---
title: "dateToSerial | @sheetwrite/core"
description: "Convert a real UTC Date to the Excel 1900-system serial."
---
<!-- api-export:@sheetwrite/core|.|dateToSerial -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="function">function</span></div>

Convert a real UTC `Date` to the Excel 1900-system serial. It is the inverse
of [`serialToDate`](/docs/api/core/serial-to-date/) except for synthetic serial 60, which JavaScript
cannot represent as a Date. Construct calendar dates with `Date.UTC(...)`
(or via [`parseDateInput`](/docs/api/core/parse-date-input/)) to avoid host-timezone shifts.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/date-serial.ts#L29"><code>packages/core/src/date-serial.ts#L29</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
function dateToSerial(date: Date): number
```

</div>

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

<p class="api-consumers-label">Public exports naming <code>dateToSerial</code></p>

<ul class="api-consumer-list">
<li>None.</li>
</ul>
</div>
