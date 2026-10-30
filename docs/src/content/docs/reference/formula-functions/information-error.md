---
title: "Information and error functions"
description: "Every information and error formula function, its engine build, and its signature, semantic, dialect, and implementation profiles."
---

This page lists the 16 functions of the information and error family. Taxonomy/source: [Information functions](https://support.microsoft.com/en-us/office/excel-functions-by-category-5f91f4e9-7b42-46d2-9bd1-63f26a86c0eb). The [formula function contract](/docs/reference/formula-functions/) has every family, the engine builds, and the evaluation limits.

## Functions

<FormulaReference>

<section class="sw-formula-family">

<table class="sw-formula-table"><thead><tr><th>Function (aliases)</th><th>Engine</th><th>Contract</th></tr></thead><tbody>
<tr data-formula-name="IFERROR" data-engine="default"><td><code>IFERROR</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>incumbent</summary><a href="#signature-if-error">Signature: <code>if-error</code></a><br /><a href="#semantics-lazy-control">Semantics: <code>lazy-control</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="IFNA" data-engine="default"><td><code>IFNA</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-if-error">Signature: <code>if-error</code></a><br /><a href="#semantics-lazy-control">Semantics: <code>lazy-control</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="ISBLANK" data-engine="default"><td><code>ISBLANK</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-unary-value">Signature: <code>unary-value</code></a><br /><a href="#semantics-information">Semantics: <code>information</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="ISNUMBER" data-engine="default"><td><code>ISNUMBER</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-unary-value">Signature: <code>unary-value</code></a><br /><a href="#semantics-information">Semantics: <code>information</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="ISTEXT" data-engine="default"><td><code>ISTEXT</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-unary-value">Signature: <code>unary-value</code></a><br /><a href="#semantics-information">Semantics: <code>information</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="ISLOGICAL" data-engine="default"><td><code>ISLOGICAL</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-unary-value">Signature: <code>unary-value</code></a><br /><a href="#semantics-information">Semantics: <code>information</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="ISERROR" data-engine="default"><td><code>ISERROR</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-unary-value">Signature: <code>unary-value</code></a><br /><a href="#semantics-information">Semantics: <code>information</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="ISERR" data-engine="default"><td><code>ISERR</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-unary-value">Signature: <code>unary-value</code></a><br /><a href="#semantics-information">Semantics: <code>information</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="ISNA" data-engine="default"><td><code>ISNA</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-unary-value">Signature: <code>unary-value</code></a><br /><a href="#semantics-information">Semantics: <code>information</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="TYPE" data-engine="default"><td><code>TYPE</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-unary-value">Signature: <code>unary-value</code></a><br /><a href="#semantics-information">Semantics: <code>information</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="ISFORMULA" data-engine="default"><td><code>ISFORMULA</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>incumbent</summary><a href="#signature-required-reference">Signature: <code>required-reference</code></a><br /><a href="#semantics-information">Semantics: <code>information</code></a><br /><a href="#dialect-excel-reference-information">Dialect: <code>excel-reference-information</code></a><br /><a href="#implementation-implemented-reference-information">Implementation: <code>implemented-reference-information</code></a></details></td></tr>
<tr data-formula-name="N" data-engine="default"><td><code>N</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-unary-value">Signature: <code>unary-value</code></a><br /><a href="#semantics-information">Semantics: <code>information</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="T" data-engine="default"><td><code>T</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-unary-value">Signature: <code>unary-value</code></a><br /><a href="#semantics-information">Semantics: <code>information</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="NA" data-engine="default"><td><code>NA</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>incumbent</summary><a href="#signature-zero">Signature: <code>zero</code></a><br /><a href="#semantics-information">Semantics: <code>information</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="CELL" data-engine="default"><td><code>CELL</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>incumbent</summary><a href="#signature-cell-info">Signature: <code>cell-info</code></a><br /><a href="#semantics-information">Semantics: <code>information</code></a><br /><a href="#dialect-excel-reference-information">Dialect: <code>excel-reference-information</code></a><br /><a href="#implementation-implemented-reference-information">Implementation: <code>implemented-reference-information</code></a></details></td></tr>
<tr data-formula-name="ISOMITTED" data-engine="full"><td><code>ISOMITTED</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-lambda-isomitted">Signature: <code>lambda-isomitted</code></a><br /><a href="#semantics-analysis-lambda">Semantics: <code>analysis-lambda</code></a><br /><a href="#dialect-analysis-lambda">Dialect: <code>analysis-lambda</code></a><br /><a href="#implementation-analysis-lambda">Implementation: <code>analysis-lambda</code></a></details></td></tr>
</tbody></table>

</section>

</FormulaReference>

## Signature profiles

Argument order, required/default state, accepted shapes, repetition, and return shape come directly from the inventory.

<details id="signature-if-error"><summary>Signature: if-error</summary>

Return shape: `contextual`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `value` | yes | none | `scalar`, `range`, `array`, `reference` | `once` |
| `valueIfError` | yes | none | `scalar`, `range`, `array`, `reference` | `once` |

</details>

<details id="signature-unary-value"><summary>Signature: unary-value</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `value` | yes | none | `scalar`, `range`, `array`, `reference` | `once` |

</details>

<details id="signature-required-reference"><summary>Signature: required-reference</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `reference` | yes | none | `range`, `reference` | `once` |

</details>

<details id="signature-zero"><summary>Signature: zero</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| _none_ | — | — | — | — |

</details>

<details id="signature-cell-info"><summary>Signature: cell-info</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `infoType` | yes | none | `scalar`, `reference` | `once` |
| `reference` | no | formula-cell | `range`, `reference` | `once` |

</details>

<details id="signature-lambda-isomitted"><summary>Signature: lambda-isomitted</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `value` | yes | none | `scalar`, `range`, `array`, `reference` | `once` |

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

<details id="semantics-information"><summary>Semantics: information</summary>

| Dimension | Contract |
| --- | --- |
| shape | scalar: accepted<br />range: contextual<br />array: contextual<br />broadcast: function-defined<br />result: scalar |
| coercion | blank: preserved<br />text: preserved<br />boolean: preserved<br />error: function-defined |
| text | case: not-applicable<br />wildcard: not-applicable |
| environment | locale: invariant<br />dateSystem: not-applicable |
| numeric | tolerance: exact<br />domain: all-inputs<br />iteration: kind: none<br />maximum: none |
| calculation | dependencies: tracked<br />lazy: eager<br />spill: scalar<br />fill: relative-reference-rewrite<br />copy: relative-reference-rewrite<br />structuralRewrite: ast-reference-rewrite |
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

<details id="dialect-excel-reference-information"><summary>Dialect: excel-reference-information</summary>

| Dialect | Status |
| --- | --- |
| Microsoft Excel | divergent |
| Google Sheets | unverified |
| OpenFormula | unverified |

Limitations: CELL supports the info types address, col, contents, row and type. Other info types return #VALUE!. CELL without a reference describes the cell of the formula, as in LibreOffice. Excel uses the last changed cell. A formula that reads its own cell with FORMULATEXT, ISFORMULA or CELL is a #CYCLE! error. Cells inside a spilled range and host-linked reference cells hold no formula. For them, FORMULATEXT returns #N/A and ISFORMULA returns FALSE. Google Sheets and OpenFormula results require producer evidence before compatibility is claimed.

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
| Parser | implemented<br />[`packages/wasm/src/calc.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/calc.rs) |
| Evaluator | implemented<br />[`packages/wasm/src/eval/mod.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/eval/mod.rs)<br />[`packages/wasm/src/eval/functions.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/eval/functions.rs) |
| Formula assist | implemented<br />[`packages/core/src/formula-assist.ts`](https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/formula-assist.ts) |
| Evidence | source-linked<br />[`packages/wasm/src/tests.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/tests.rs)<br />[`packages/core/test/formula-assist.test.ts`](https://github.com/chh-ay/sheetwrite/blob/main/packages/core/test/formula-assist.test.ts) |

</details>

<details id="implementation-implemented-reference-information"><summary>Implementation: implemented-reference-information</summary>

| Layer | Status and source/evidence |
| --- | --- |
| Parser | implemented<br />[`packages/wasm/src/calc.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/calc.rs) |
| Evaluator | implemented<br />[`packages/wasm/src/eval/info.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/eval/info.rs) |
| Formula assist | implemented<br />[`packages/core/src/formula-assist.ts`](https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/formula-assist.ts) |
| Evidence | source-linked<br />[`packages/wasm/src/tests.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/tests.rs)<br />[`packages/core/test/formula-assist.test.ts`](https://github.com/chh-ay/sheetwrite/blob/main/packages/core/test/formula-assist.test.ts) |

</details>

<details id="implementation-analysis-lambda"><summary>Implementation: analysis-lambda</summary>

| Layer | Status and source/evidence |
| --- | --- |
| Parser | implemented<br />[`packages/wasm/src/calc.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/calc.rs) |
| Evaluator | implemented<br />[`packages/wasm/src/eval/analysis/lambda.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/eval/analysis/lambda.rs) |
| Formula assist | implemented<br />[`packages/core/src/formula-assist.ts`](https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/formula-assist.ts) |
| Evidence | source-linked<br />[`packages/wasm/src/eval/analysis/lambda.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/eval/analysis/lambda.rs) |

</details>
