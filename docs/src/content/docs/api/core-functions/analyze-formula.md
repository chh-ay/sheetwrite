---
title: "analyzeFormula | @sheetwrite/core/functions"
description: "analyzeFormula function in @sheetwrite/core/functions: Reads a formula as formula help needs it: its tokens, the references to colour, the function call and…"
---
<!-- api-export:@sheetwrite/core|./functions|analyzeFormula -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-functions/">@sheetwrite/core/functions</a><span class="api-status" data-kind="function">function</span></div>

Reads a formula as formula help needs it: its tokens, the references to
colour, the function call and argument at `cursor`, the functions that
complete the name at `cursor`, and syntax and call errors.

`text` is the whole editor text, starting with `=`; any other text is not a
formula and gives an empty result. `cursor` and every `from` and `to` are
UTF-16 offsets into `text`. `functions` is the list from `listFunctions`,
which holds the active engine's built-in functions and the store's host
functions. With an empty list, completion is empty and no name is reported
as unknown.

The tokens and the syntax error come from the engine's own lexer and
parser, so call it after `initSheetwrite`. The analysis never calculates:
it reads text and metadata only.

## Examples

```ts compile
import type { Store } from "@sheetwrite/core";
import { analyzeFormula, listFunctions } from "@sheetwrite/core/functions";

async function currentArgument(store: Store, text: string, cursor: number) {
  const analysis = analyzeFormula(text, cursor, await listFunctions(store));
  return analysis.call?.argument?.name ?? null;
}
```

## See also

- [/docs/features/formulas/formula-help/](/docs/features/formulas/formula-help/)

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/formula-analysis.ts#L362"><code>packages/core/src/formula-analysis.ts#L362</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
function analyzeFormula(
  text: string,
  cursor: number,
  functions: readonly FormulaFunctionMetadata[],
): FormulaAnalysis
```

</div>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/core</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/bench</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/charts</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/react</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/svelte</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/vue</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/xlsx</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>analyzeFormula</code></p>

<ul class="api-consumer-list">
<li>None.</li>
</ul>
</div>
