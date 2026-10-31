---
title: "formulaTokens | @sheetwrite/wasm"
description: "formulaTokens function in @sheetwrite/wasm: The tokens of formula text: four u32 per token, kind, from and to (UTF-16 offsets into src) and space (1 when…"
---
<!-- api-export:@sheetwrite/wasm|.|formulaTokens -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/wasm/">@sheetwrite/wasm</a><span class="api-status" data-kind="function">function</span></div>

The tokens of formula text: four `u32` per token, `kind`, `from` and `to`
(UTF-16 offsets into `src`) and `space` (1 when whitespace comes before the
token). A leading `=` is not a token. The lexer never stops at an error:
text it cannot read is a bad token, and an open quote or bracket runs to
the end of the text.

`kind` is 0 number, 1 text, 2 `TRUE` or `FALSE` as a value, 3 error
constant, 4 name (a function, reference, defined name, table or sheet),
5 quoted sheet name, 6 table reference in brackets, 7 operator, 8 `:`,
9 `!`, 10 `#`, 11 `,`, 12 `;`, 13 `(`, 14 `)`, 15 `{`, 16 `}`, 17 bad text.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/wasm/pkg/sheetwrite_wasm.d.ts#L558"><code>packages/wasm/pkg/sheetwrite_wasm.d.ts#L558</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
function formulaTokens(src: string): Uint32Array
```

</div>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/wasm</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/bench</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/core</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>formulaTokens</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/formulas/init-output/"><code>InitOutput</code></a><span class="api-consumer-kind">@sheetwrite/formulas</span></li>
<li><a href="/docs/api/wasm/init-output/"><code>InitOutput</code></a><span class="api-consumer-kind">@sheetwrite/wasm</span></li>
</ul>
</div>
