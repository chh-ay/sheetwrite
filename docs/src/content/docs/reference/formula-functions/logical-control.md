---
title: "Logical and control flow functions"
description: "Every logical and control flow formula function, its engine build, and its signature, semantic, dialect, and implementation profiles."
---

This page lists the 17 functions of the logical and control flow family. Taxonomy/source: [Logical functions](https://support.microsoft.com/en-us/office/excel-functions-by-category-5f91f4e9-7b42-46d2-9bd1-63f26a86c0eb). The [formula function contract](/docs/reference/formula-functions/) has every family, the engine builds, and the evaluation limits.

## Functions

<FormulaReference>

<section class="sw-formula-family">

<table class="sw-formula-table"><thead><tr><th>Function (aliases)</th><th>Engine</th><th>Contract</th></tr></thead><tbody>
<tr data-formula-name="IF" data-engine="default"><td><code>IF</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>incumbent</summary><a href="#signature-if">Signature: <code>if</code></a><br /><a href="#semantics-lazy-control">Semantics: <code>lazy-control</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="AND" data-engine="default"><td><code>AND</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>incumbent</summary><a href="#signature-logical-variadic">Signature: <code>logical-variadic</code></a><br /><a href="#semantics-logical">Semantics: <code>logical</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="OR" data-engine="default"><td><code>OR</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>incumbent</summary><a href="#signature-logical-variadic">Signature: <code>logical-variadic</code></a><br /><a href="#semantics-logical">Semantics: <code>logical</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="NOT" data-engine="default"><td><code>NOT</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>incumbent</summary><a href="#signature-unary-value">Signature: <code>unary-value</code></a><br /><a href="#semantics-logical">Semantics: <code>logical</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="IFS" data-engine="default"><td><code>IFS</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-ifs">Signature: <code>ifs</code></a><br /><a href="#semantics-lazy-control">Semantics: <code>lazy-control</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="SWITCH" data-engine="default"><td><code>SWITCH</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-switch">Signature: <code>switch</code></a><br /><a href="#semantics-lazy-control">Semantics: <code>lazy-control</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="XOR" data-engine="default"><td><code>XOR</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-logical-variadic">Signature: <code>logical-variadic</code></a><br /><a href="#semantics-logical">Semantics: <code>logical</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="TRUE" data-engine="default"><td><code>TRUE</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-zero">Signature: <code>zero</code></a><br /><a href="#semantics-logical">Semantics: <code>logical</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="FALSE" data-engine="default"><td><code>FALSE</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-zero">Signature: <code>zero</code></a><br /><a href="#semantics-logical">Semantics: <code>logical</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="LET" data-engine="default"><td><code>LET</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-let">Signature: <code>let</code></a><br /><a href="#semantics-let-binding">Semantics: <code>let-binding</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="LAMBDA" data-engine="full"><td><code>LAMBDA</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-lambda-lambda">Signature: <code>lambda-lambda</code></a><br /><a href="#semantics-analysis-lambda">Semantics: <code>analysis-lambda</code></a><br /><a href="#dialect-analysis-lambda-call">Dialect: <code>analysis-lambda-call</code></a><br /><a href="#implementation-analysis-lambda">Implementation: <code>analysis-lambda</code></a></details></td></tr>
<tr data-formula-name="MAP" data-engine="full"><td><code>MAP</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-lambda-map">Signature: <code>lambda-map</code></a><br /><a href="#semantics-analysis-lambda">Semantics: <code>analysis-lambda</code></a><br /><a href="#dialect-analysis-lambda">Dialect: <code>analysis-lambda</code></a><br /><a href="#implementation-analysis-lambda">Implementation: <code>analysis-lambda</code></a></details></td></tr>
<tr data-formula-name="REDUCE" data-engine="full"><td><code>REDUCE</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-lambda-reduce">Signature: <code>lambda-reduce</code></a><br /><a href="#semantics-analysis-lambda">Semantics: <code>analysis-lambda</code></a><br /><a href="#dialect-analysis-lambda">Dialect: <code>analysis-lambda</code></a><br /><a href="#implementation-analysis-lambda">Implementation: <code>analysis-lambda</code></a></details></td></tr>
<tr data-formula-name="SCAN" data-engine="full"><td><code>SCAN</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-lambda-scan">Signature: <code>lambda-scan</code></a><br /><a href="#semantics-analysis-lambda">Semantics: <code>analysis-lambda</code></a><br /><a href="#dialect-analysis-lambda">Dialect: <code>analysis-lambda</code></a><br /><a href="#implementation-analysis-lambda">Implementation: <code>analysis-lambda</code></a></details></td></tr>
<tr data-formula-name="BYROW" data-engine="full"><td><code>BYROW</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-lambda-byrow">Signature: <code>lambda-byrow</code></a><br /><a href="#semantics-analysis-lambda">Semantics: <code>analysis-lambda</code></a><br /><a href="#dialect-analysis-lambda">Dialect: <code>analysis-lambda</code></a><br /><a href="#implementation-analysis-lambda">Implementation: <code>analysis-lambda</code></a></details></td></tr>
<tr data-formula-name="BYCOL" data-engine="full"><td><code>BYCOL</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-lambda-bycol">Signature: <code>lambda-bycol</code></a><br /><a href="#semantics-analysis-lambda">Semantics: <code>analysis-lambda</code></a><br /><a href="#dialect-analysis-lambda">Dialect: <code>analysis-lambda</code></a><br /><a href="#implementation-analysis-lambda">Implementation: <code>analysis-lambda</code></a></details></td></tr>
<tr data-formula-name="MAKEARRAY" data-engine="full"><td><code>MAKEARRAY</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-lambda-makearray">Signature: <code>lambda-makearray</code></a><br /><a href="#semantics-analysis-lambda">Semantics: <code>analysis-lambda</code></a><br /><a href="#dialect-analysis-lambda">Dialect: <code>analysis-lambda</code></a><br /><a href="#implementation-analysis-lambda">Implementation: <code>analysis-lambda</code></a></details></td></tr>
</tbody></table>

</section>

</FormulaReference>

## Signature profiles

Argument order, required/default state, accepted shapes, repetition, and return shape come directly from the inventory.

<details id="signature-if"><summary>Signature: if</summary>

Return shape: `contextual`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `logicalTest` | yes | none | `scalar`, `reference` | `once` |
| `valueIfTrue` | no | true | `scalar`, `range`, `array`, `reference` | `once` |
| `valueIfFalse` | no | false | `scalar`, `range`, `array`, `reference` | `once` |

</details>

<details id="signature-logical-variadic"><summary>Signature: logical-variadic</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `logical` | yes | none | `scalar`, `range`, `array`, `reference` | `one-or-more` |

</details>

<details id="signature-unary-value"><summary>Signature: unary-value</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `value` | yes | none | `scalar`, `range`, `array`, `reference` | `once` |

</details>

<details id="signature-ifs"><summary>Signature: ifs</summary>

Return shape: `contextual`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `testAndValue` | yes | none | `scalar`, `range`, `array`, `reference` | `paired` |

</details>

<details id="signature-switch"><summary>Signature: switch</summary>

Return shape: `contextual`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `expression` | yes | none | `scalar`, `reference` | `once` |
| `valueAndResult` | yes | none | `scalar`, `range`, `array`, `reference` | `paired` |
| `defaultValue` | no | #N/A | `scalar`, `range`, `array`, `reference` | `once` |

</details>

<details id="signature-zero"><summary>Signature: zero</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| _none_ | — | — | — | — |

</details>

<details id="signature-let"><summary>Signature: let</summary>

Return shape: `contextual`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `nameAndValue` | yes | none | `scalar`, `range`, `array`, `name`, `reference` | `paired` |
| `calculation` | yes | none | `scalar`, `range`, `array`, `name`, `reference` | `once` |

</details>

<details id="signature-lambda-lambda"><summary>Signature: lambda-lambda</summary>

Return shape: `contextual`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `parameter` | no | none | `scalar`, `range`, `array`, `reference` | `zero-or-more` |
| `calculation` | yes | none | `scalar`, `range`, `array`, `reference` | `once` |

</details>

<details id="signature-lambda-map"><summary>Signature: lambda-map</summary>

Return shape: `array`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `array` | yes | none | `scalar`, `range`, `array`, `reference` | `one-or-more` |
| `lambda` | yes | none | `scalar`, `range`, `array`, `reference` | `once` |

</details>

<details id="signature-lambda-reduce"><summary>Signature: lambda-reduce</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `initialValue` | no | none | `scalar`, `range`, `array`, `reference` | `once` |
| `array` | yes | none | `scalar`, `range`, `array`, `reference` | `once` |
| `lambda` | yes | none | `scalar`, `range`, `array`, `reference` | `once` |

</details>

<details id="signature-lambda-scan"><summary>Signature: lambda-scan</summary>

Return shape: `array`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `initialValue` | no | none | `scalar`, `range`, `array`, `reference` | `once` |
| `array` | yes | none | `scalar`, `range`, `array`, `reference` | `once` |
| `lambda` | yes | none | `scalar`, `range`, `array`, `reference` | `once` |

</details>

<details id="signature-lambda-byrow"><summary>Signature: lambda-byrow</summary>

Return shape: `array`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `array` | yes | none | `scalar`, `range`, `array`, `reference` | `once` |
| `lambda` | yes | none | `scalar`, `range`, `array`, `reference` | `once` |

</details>

<details id="signature-lambda-bycol"><summary>Signature: lambda-bycol</summary>

Return shape: `array`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `array` | yes | none | `scalar`, `range`, `array`, `reference` | `once` |
| `lambda` | yes | none | `scalar`, `range`, `array`, `reference` | `once` |

</details>

<details id="signature-lambda-makearray"><summary>Signature: lambda-makearray</summary>

Return shape: `array`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `rows` | yes | none | `scalar`, `range`, `array`, `reference` | `once` |
| `columns` | yes | none | `scalar`, `range`, `array`, `reference` | `once` |
| `lambda` | yes | none | `scalar`, `range`, `array`, `reference` | `once` |

</details>

## Semantic profiles

These values are normative for the listed Sheetwrite subset. `function-defined` and `contextual` are explicit limitations: consult the formula guides' function-specific sections rather than assuming another spreadsheet's edge behavior.

<details id="semantics-lazy-control"><summary>Semantics: lazy-control</summary>

| Dimension | Contract |
| --- | --- |
| shape | scalar: accepted<br />range: contextual<br />array: contextual<br />broadcast: function-defined<br />result: contextual |
| coercion | blank: function-defined<br />text: function-defined<br />boolean: function-defined<br />error: trap-selected |
| text | case: insensitive<br />wildcard: literal |
| environment | locale: invariant<br />dateSystem: function-defined |
| numeric | tolerance: function-defined<br />domain: function-defined<br />iteration: kind: none<br />maximum: none |
| calculation | dependencies: contextual<br />lazy: lazy-branches<br />spill: contextual<br />fill: relative-reference-rewrite<br />copy: relative-reference-rewrite<br />structuralRewrite: ast-reference-rewrite |
| persistence | snapshot: formula-source<br />history: formula-source<br />collaboration: formula-source<br />xlsxSource: rewrite-on-structural-edit |

</details>

<details id="semantics-logical"><summary>Semantics: logical</summary>

| Dimension | Contract |
| --- | --- |
| shape | scalar: accepted<br />range: accepted<br />array: contextual<br />broadcast: function-defined<br />result: scalar |
| coercion | blank: false<br />text: function-defined<br />boolean: preserved<br />error: propagate |
| text | case: insensitive<br />wildcard: literal |
| environment | locale: invariant<br />dateSystem: not-applicable |
| numeric | tolerance: exact<br />domain: all-inputs<br />iteration: kind: none<br />maximum: none |
| calculation | dependencies: tracked<br />lazy: eager<br />spill: scalar<br />fill: relative-reference-rewrite<br />copy: relative-reference-rewrite<br />structuralRewrite: ast-reference-rewrite |
| persistence | snapshot: formula-source<br />history: formula-source<br />collaboration: formula-source<br />xlsxSource: rewrite-on-structural-edit |

</details>

<details id="semantics-let-binding"><summary>Semantics: let-binding</summary>

| Dimension | Contract |
| --- | --- |
| shape | scalar: accepted<br />range: accepted<br />array: accepted<br />broadcast: function-defined<br />result: contextual |
| coercion | blank: preserved<br />text: preserved<br />boolean: preserved<br />error: propagate |
| text | case: insensitive<br />wildcard: literal |
| environment | locale: invariant<br />dateSystem: function-defined |
| numeric | tolerance: function-defined<br />domain: function-defined<br />iteration: kind: none<br />maximum: none |
| calculation | dependencies: contextual<br />lazy: lazy-bindings<br />spill: contextual<br />fill: relative-reference-rewrite<br />copy: relative-reference-rewrite<br />structuralRewrite: ast-reference-rewrite |
| persistence | snapshot: formula-source<br />history: formula-source<br />collaboration: formula-source<br />xlsxSource: rewrite-on-structural-edit |

</details>

<details id="semantics-analysis-lambda"><summary>Semantics: analysis-lambda</summary>

| Dimension | Contract |
| --- | --- |
| shape | scalar: accepted<br />range: accepted<br />array: accepted<br />broadcast: none<br />result: contextual |
| coercion | blank: function-defined<br />text: function-defined<br />boolean: function-defined<br />error: propagate |
| text | case: not-applicable<br />wildcard: not-applicable |
| environment | locale: invariant<br />dateSystem: not-applicable |
| numeric | tolerance: binary64<br />domain: function-defined<br />iteration: kind: bounded<br />maximum: 2000000 |
| calculation | dependencies: tracked<br />lazy: function-defined<br />spill: contextual<br />fill: relative-reference-rewrite<br />copy: relative-reference-rewrite<br />structuralRewrite: ast-reference-rewrite |
| persistence | snapshot: formula-source<br />history: formula-source<br />collaboration: formula-source<br />xlsxSource: rewrite-on-structural-edit |

</details>

## Dialect profiles

<details id="dialect-excel-documented"><summary>Dialect: excel-documented</summary>

| Dialect | Status |
| --- | --- |
| Microsoft Excel | documented |
| Google Sheets | unverified |
| OpenFormula | unverified |

Limitations: Google Sheets and OpenFormula results require producer evidence before compatibility is claimed.

</details>

<details id="dialect-analysis-lambda-call"><summary>Dialect: analysis-lambda-call</summary>

| Dialect | Status |
| --- | --- |
| Microsoft Excel | divergent |
| Google Sheets | unverified |
| OpenFormula | unverified |

Limitations: Available only in @sheetwrite/formulas. Named ranges are supported, but workbook-defined named formulas are not available. LAMBDA uses lexical parameters and LET bindings. Calls are limited to depth 64 and 2000000 work units. Helpers reject nested arrays.

</details>

<details id="dialect-analysis-lambda"><summary>Dialect: analysis-lambda</summary>

| Dialect | Status |
| --- | --- |
| Microsoft Excel | divergent |
| Google Sheets | unverified |
| OpenFormula | unverified |

Limitations: Available only in @sheetwrite/formulas. Named ranges are supported, but workbook-defined named formulas are not available. LAMBDA uses lexical parameters and LET bindings. Calls are limited to depth 64 and 2000000 work units. Helpers reject nested arrays.

</details>

## Implementation profiles

<details id="implementation-implemented-assisted"><summary>Implementation: implemented-assisted</summary>

| Layer | Status and source/evidence |
| --- | --- |
| Parser | implemented<br />[`packages/wasm/src/calc.rs`](https://github.com/chh-ay/sheetwrite/blob/develop/packages/wasm/src/calc.rs) |
| Evaluator | implemented<br />[`packages/wasm/src/eval/mod.rs`](https://github.com/chh-ay/sheetwrite/blob/develop/packages/wasm/src/eval/mod.rs)<br />[`packages/wasm/src/eval/functions.rs`](https://github.com/chh-ay/sheetwrite/blob/develop/packages/wasm/src/eval/functions.rs) |
| Formula assist | implemented<br />[`packages/core/src/formula-assist.ts`](https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/formula-assist.ts) |
| Evidence | source-linked<br />[`packages/wasm/src/tests.rs`](https://github.com/chh-ay/sheetwrite/blob/develop/packages/wasm/src/tests.rs)<br />[`packages/core/test/formula-assist.test.ts`](https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/test/formula-assist.test.ts) |

</details>

<details id="implementation-analysis-lambda"><summary>Implementation: analysis-lambda</summary>

| Layer | Status and source/evidence |
| --- | --- |
| Parser | implemented<br />[`packages/wasm/src/calc.rs`](https://github.com/chh-ay/sheetwrite/blob/develop/packages/wasm/src/calc.rs) |
| Evaluator | implemented<br />[`packages/wasm/src/eval/analysis/lambda.rs`](https://github.com/chh-ay/sheetwrite/blob/develop/packages/wasm/src/eval/analysis/lambda.rs) |
| Formula assist | implemented<br />[`packages/core/src/formula-assist.ts`](https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/formula-assist.ts) |
| Evidence | source-linked<br />[`packages/wasm/src/eval/analysis/lambda.rs`](https://github.com/chh-ay/sheetwrite/blob/develop/packages/wasm/src/eval/analysis/lambda.rs) |

</details>
