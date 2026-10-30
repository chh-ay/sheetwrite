---
title: "registerXlsxBackends | @sheetwrite/xlsx/register"
description: "registerXlsxBackends function in @sheetwrite/xlsx/register: Register all concrete XLSX backends with the backend-neutral core contracts."
---
<!-- api-export:@sheetwrite/xlsx|./register|registerXlsxBackends -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/xlsx-register/">@sheetwrite/xlsx/register</a><span class="api-status" data-kind="function">function</span></div>

Register all concrete XLSX backends with the backend-neutral core contracts.

## Examples

```ts compile
import { registerXlsxBackends } from "@sheetwrite/xlsx";
import { fromXlsxWorkbook } from "@sheetwrite/core";

registerXlsxBackends();
async function open(file: File) {
  return fromXlsxWorkbook(await file.arrayBuffer());
}
```

## See also

- [/docs/import-export/xlsx-export/](/docs/import-export/xlsx-export/)

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/xlsx/src/registration.ts#L26"><code>packages/xlsx/src/registration.ts#L26</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
function registerXlsxBackends(): void
```

</div>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/xlsx</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>registerXlsxBackends</code></p>

<ul class="api-consumer-list">
<li>None.</li>
</ul>
</div>
