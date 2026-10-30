---
title: "Dynamic array functions"
description: "Every dynamic array formula function, its engine build, and its signature, semantic, dialect, and implementation profiles."
---

This page lists the 20 functions of the dynamic array family. Taxonomy/source: [Lookup and reference functions](https://support.microsoft.com/en-us/office/excel-functions-by-category-5f91f4e9-7b42-46d2-9bd1-63f26a86c0eb). The [formula function contract](/docs/reference/formula-functions/) has every family, the engine builds, and the evaluation limits.

## Functions

<FormulaReference>

<section class="sw-formula-family">

<table class="sw-formula-table"><thead><tr><th>Function (aliases)</th><th>Engine</th><th>Contract</th></tr></thead><tbody>
<tr data-formula-name="FILTER" data-engine="default"><td><code>FILTER</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>incumbent</summary><a href="#signature-filter">Signature: <code>filter</code></a><br /><a href="#semantics-array">Semantics: <code>array</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="SORT" data-engine="default"><td><code>SORT</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>incumbent</summary><a href="#signature-sort">Signature: <code>sort</code></a><br /><a href="#semantics-array">Semantics: <code>array</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="UNIQUE" data-engine="default"><td><code>UNIQUE</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>incumbent</summary><a href="#signature-unique">Signature: <code>unique</code></a><br /><a href="#semantics-array">Semantics: <code>array</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="TRANSPOSE" data-engine="default"><td><code>TRANSPOSE</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-array-unary">Signature: <code>array-unary</code></a><br /><a href="#semantics-array">Semantics: <code>array</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="SEQUENCE" data-engine="default"><td><code>SEQUENCE</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-sequence">Signature: <code>sequence</code></a><br /><a href="#semantics-array">Semantics: <code>array</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="TAKE" data-engine="default"><td><code>TAKE</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-take-drop">Signature: <code>take-drop</code></a><br /><a href="#semantics-array">Semantics: <code>array</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="DROP" data-engine="default"><td><code>DROP</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-take-drop">Signature: <code>take-drop</code></a><br /><a href="#semantics-array">Semantics: <code>array</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="CHOOSECOLS" data-engine="default"><td><code>CHOOSECOLS</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-choose-axis">Signature: <code>choose-axis</code></a><br /><a href="#semantics-array">Semantics: <code>array</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="CHOOSEROWS" data-engine="default"><td><code>CHOOSEROWS</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-choose-axis">Signature: <code>choose-axis</code></a><br /><a href="#semantics-array">Semantics: <code>array</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="EXPAND" data-engine="full"><td><code>EXPAND</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-reshape-expand">Signature: <code>reshape-expand</code></a><br /><a href="#semantics-array">Semantics: <code>array</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-analysis-reshape">Implementation: <code>analysis-reshape</code></a></details></td></tr>
<tr data-formula-name="HSTACK" data-engine="full"><td><code>HSTACK</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-reshape-stack">Signature: <code>reshape-stack</code></a><br /><a href="#semantics-array">Semantics: <code>array</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-analysis-reshape">Implementation: <code>analysis-reshape</code></a></details></td></tr>
<tr data-formula-name="SORTBY" data-engine="full"><td><code>SORTBY</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-sort-by">Signature: <code>sort-by</code></a><br /><a href="#semantics-array">Semantics: <code>array</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-analysis-reshape">Implementation: <code>analysis-reshape</code></a></details></td></tr>
<tr data-formula-name="TOCOL" data-engine="full"><td><code>TOCOL</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-reshape-flatten">Signature: <code>reshape-flatten</code></a><br /><a href="#semantics-array">Semantics: <code>array</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-analysis-reshape">Implementation: <code>analysis-reshape</code></a></details></td></tr>
<tr data-formula-name="TOROW" data-engine="full"><td><code>TOROW</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-reshape-flatten">Signature: <code>reshape-flatten</code></a><br /><a href="#semantics-array">Semantics: <code>array</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-analysis-reshape">Implementation: <code>analysis-reshape</code></a></details></td></tr>
<tr data-formula-name="VSTACK" data-engine="full"><td><code>VSTACK</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-reshape-stack">Signature: <code>reshape-stack</code></a><br /><a href="#semantics-array">Semantics: <code>array</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-analysis-reshape">Implementation: <code>analysis-reshape</code></a></details></td></tr>
<tr data-formula-name="WRAPCOLS" data-engine="full"><td><code>WRAPCOLS</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-reshape-wrap">Signature: <code>reshape-wrap</code></a><br /><a href="#semantics-array">Semantics: <code>array</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-analysis-reshape">Implementation: <code>analysis-reshape</code></a></details></td></tr>
<tr data-formula-name="WRAPROWS" data-engine="full"><td><code>WRAPROWS</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-reshape-wrap">Signature: <code>reshape-wrap</code></a><br /><a href="#semantics-array">Semantics: <code>array</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-analysis-reshape">Implementation: <code>analysis-reshape</code></a></details></td></tr>
<tr data-formula-name="GROUPBY" data-engine="full"><td><code>GROUPBY</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-groupby-groupby">Signature: <code>groupby-groupby</code></a><br /><a href="#semantics-analysis-groupby">Semantics: <code>analysis-groupby</code></a><br /><a href="#dialect-analysis-groupby">Dialect: <code>analysis-groupby</code></a><br /><a href="#implementation-analysis-groupby">Implementation: <code>analysis-groupby</code></a></details></td></tr>
<tr data-formula-name="PIVOTBY" data-engine="full"><td><code>PIVOTBY</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-groupby-pivotby">Signature: <code>groupby-pivotby</code></a><br /><a href="#semantics-analysis-groupby">Semantics: <code>analysis-groupby</code></a><br /><a href="#dialect-analysis-groupby">Dialect: <code>analysis-groupby</code></a><br /><a href="#implementation-analysis-groupby">Implementation: <code>analysis-groupby</code></a></details></td></tr>
<tr data-formula-name="PERCENTOF" data-engine="full"><td><code>PERCENTOF</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-groupby-percentof">Signature: <code>groupby-percentof</code></a><br /><a href="#semantics-analysis-groupby">Semantics: <code>analysis-groupby</code></a><br /><a href="#dialect-analysis-groupby">Dialect: <code>analysis-groupby</code></a><br /><a href="#implementation-analysis-groupby">Implementation: <code>analysis-groupby</code></a></details></td></tr>
</tbody></table>

</section>

</FormulaReference>

## Signature profiles

Argument order, required/default state, accepted shapes, repetition, and return shape come directly from the inventory.

<details id="signature-filter"><summary>Signature: filter</summary>

Return shape: `array`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `array` | yes | none | `range`, `array`, `reference` | `once` |
| `include` | yes | none | `range`, `array`, `reference` | `once` |
| `ifEmpty` | no | #CALC! | `scalar`, `reference` | `once` |

</details>

<details id="signature-sort"><summary>Signature: sort</summary>

Return shape: `array`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `array` | yes | none | `range`, `array`, `reference` | `once` |
| `sortIndex` | no | 1 | `scalar`, `reference` | `once` |
| `sortOrder` | no | 1 | `scalar`, `reference` | `once` |
| `byColumn` | no | false | `scalar`, `reference` | `once` |

</details>

<details id="signature-unique"><summary>Signature: unique</summary>

Return shape: `array`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `array` | yes | none | `range`, `array`, `reference` | `once` |
| `byColumn` | no | false | `scalar`, `reference` | `once` |
| `exactlyOnce` | no | false | `scalar`, `reference` | `once` |

</details>

<details id="signature-array-unary"><summary>Signature: array-unary</summary>

Return shape: `array`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `array` | yes | none | `range`, `array`, `reference` | `once` |

</details>

<details id="signature-sequence"><summary>Signature: sequence</summary>

Return shape: `array`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `rows` | yes | none | `scalar`, `reference` | `once` |
| `columns` | no | 1 | `scalar`, `reference` | `once` |
| `start` | no | 1 | `scalar`, `reference` | `once` |
| `step` | no | 1 | `scalar`, `reference` | `once` |

</details>

<details id="signature-take-drop"><summary>Signature: take-drop</summary>

Return shape: `array`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `array` | yes | none | `range`, `array`, `reference` | `once` |
| `rows` | yes | none | `scalar`, `reference` | `once` |
| `columns` | no | all | `scalar`, `reference` | `once` |

</details>

<details id="signature-choose-axis"><summary>Signature: choose-axis</summary>

Return shape: `array`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `array` | yes | none | `range`, `array`, `reference` | `once` |
| `index` | yes | none | `scalar`, `array`, `reference` | `one-or-more` |

</details>

<details id="signature-reshape-expand"><summary>Signature: reshape-expand</summary>

Return shape: `array`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `array` | yes | none | `scalar`, `range`, `array`, `reference` | `once` |
| `rows` | yes | none | `scalar`, `reference` | `once` |
| `columns` | no | source columns | `scalar`, `reference` | `once` |
| `padWith` | no | #N/A | `scalar`, `reference` | `once` |

</details>

<details id="signature-reshape-stack"><summary>Signature: reshape-stack</summary>

Return shape: `array`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `array` | yes | none | `scalar`, `range`, `array`, `reference` | `one-or-more` |

</details>

<details id="signature-sort-by"><summary>Signature: sort-by</summary>

Return shape: `array`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `array` | yes | none | `range`, `array`, `reference` | `once` |
| `byArrayAndOrder` | yes | none | `scalar`, `range`, `array`, `reference` | `paired` |

</details>

<details id="signature-reshape-flatten"><summary>Signature: reshape-flatten</summary>

Return shape: `array`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `array` | yes | none | `scalar`, `range`, `array`, `reference` | `once` |
| `ignore` | no | 0 | `scalar`, `reference` | `once` |
| `scanByColumn` | no | FALSE | `scalar`, `reference` | `once` |

</details>

<details id="signature-reshape-wrap"><summary>Signature: reshape-wrap</summary>

Return shape: `array`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `vector` | yes | none | `scalar`, `range`, `array`, `reference` | `once` |
| `wrapCount` | yes | none | `scalar`, `reference` | `once` |
| `padWith` | no | #N/A | `scalar`, `reference` | `once` |

</details>

<details id="signature-groupby-groupby"><summary>Signature: groupby-groupby</summary>

Return shape: `array`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `rowFields` | yes | none | `scalar`, `range`, `array`, `reference` | `once` |
| `values` | yes | none | `scalar`, `range`, `array`, `reference` | `once` |
| `function` | yes | none | `scalar`, `range`, `array`, `reference` | `once` |
| `fieldHeaders` | no | none | `scalar`, `range`, `array`, `reference` | `once` |
| `totalDepth` | no | none | `scalar`, `range`, `array`, `reference` | `once` |
| `sortOrder` | no | none | `scalar`, `range`, `array`, `reference` | `once` |
| `filterArray` | no | none | `scalar`, `range`, `array`, `reference` | `once` |
| `fieldRelationship` | no | none | `scalar`, `range`, `array`, `reference` | `once` |

</details>

<details id="signature-groupby-pivotby"><summary>Signature: groupby-pivotby</summary>

Return shape: `array`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `rowFields` | yes | none | `scalar`, `range`, `array`, `reference` | `once` |
| `colFields` | yes | none | `scalar`, `range`, `array`, `reference` | `once` |
| `values` | yes | none | `scalar`, `range`, `array`, `reference` | `once` |
| `function` | yes | none | `scalar`, `range`, `array`, `reference` | `once` |
| `fieldHeaders` | no | none | `scalar`, `range`, `array`, `reference` | `once` |
| `rowTotalDepth` | no | none | `scalar`, `range`, `array`, `reference` | `once` |
| `rowSortOrder` | no | none | `scalar`, `range`, `array`, `reference` | `once` |
| `colTotalDepth` | no | none | `scalar`, `range`, `array`, `reference` | `once` |
| `colSortOrder` | no | none | `scalar`, `range`, `array`, `reference` | `once` |
| `filterArray` | no | none | `scalar`, `range`, `array`, `reference` | `once` |
| `relativeTo` | no | none | `scalar`, `range`, `array`, `reference` | `once` |

</details>

<details id="signature-groupby-percentof"><summary>Signature: groupby-percentof</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `dataSubset` | yes | none | `scalar`, `range`, `array`, `reference` | `once` |
| `dataAll` | yes | none | `scalar`, `range`, `array`, `reference` | `once` |

</details>

## Semantic profiles

These values are normative for the listed Sheetwrite subset. `function-defined` and `contextual` are explicit limitations: consult the formula guides' function-specific sections rather than assuming another spreadsheet's edge behavior.

<details id="semantics-array"><summary>Semantics: array</summary>

| Dimension | Contract |
| --- | --- |
| shape | scalar: contextual<br />range: accepted<br />array: accepted<br />broadcast: function-defined<br />result: array |
| coercion | blank: preserved<br />text: preserved<br />boolean: preserved<br />error: propagate |
| text | case: function-defined<br />wildcard: function-defined |
| environment | locale: invariant<br />dateSystem: function-defined |
| numeric | tolerance: function-defined<br />domain: bounded<br />iteration: kind: none<br />maximum: none |
| calculation | dependencies: tracked<br />lazy: eager<br />spill: array<br />fill: relative-reference-rewrite<br />copy: relative-reference-rewrite<br />structuralRewrite: ast-reference-rewrite |
| persistence | snapshot: formula-source<br />history: formula-source<br />collaboration: formula-source<br />xlsxSource: rewrite-on-structural-edit |

</details>

<details id="semantics-analysis-groupby"><summary>Semantics: analysis-groupby</summary>

| Dimension | Contract |
| --- | --- |
| shape | scalar: accepted<br />range: accepted<br />array: accepted<br />broadcast: none<br />result: contextual |
| coercion | blank: function-defined<br />text: function-defined<br />boolean: function-defined<br />error: propagate |
| text | case: insensitive<br />wildcard: not-applicable |
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

<details id="dialect-analysis-groupby"><summary>Dialect: analysis-groupby</summary>

| Dialect | Status |
| --- | --- |
| Microsoft Excel | divergent |
| Google Sheets | unverified |
| OpenFormula | unverified |

Limitations: Available only in @sheetwrite/formulas. Aggregators must be a single eta-reduced built-in or a LAMBDA with one or two parameters. Vectors of functions are not supported. Grouping and output use the engine spill and work limits.

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

<details id="implementation-analysis-reshape"><summary>Implementation: analysis-reshape</summary>

| Layer | Status and source/evidence |
| --- | --- |
| Parser | implemented<br />[`packages/wasm/src/calc.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/calc.rs) |
| Evaluator | implemented<br />[`packages/wasm/src/eval/analysis/reshape.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/eval/analysis/reshape.rs) |
| Formula assist | implemented<br />[`packages/core/src/formula-assist.ts`](https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/formula-assist.ts) |
| Evidence | source-linked<br />[`packages/wasm/src/eval/analysis/reshape.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/eval/analysis/reshape.rs) |

</details>

<details id="implementation-analysis-groupby"><summary>Implementation: analysis-groupby</summary>

| Layer | Status and source/evidence |
| --- | --- |
| Parser | implemented<br />[`packages/wasm/src/calc.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/calc.rs) |
| Evaluator | implemented<br />[`packages/wasm/src/eval/analysis/groupby.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/eval/analysis/groupby.rs) |
| Formula assist | implemented<br />[`packages/core/src/formula-assist.ts`](https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/formula-assist.ts) |
| Evidence | source-linked<br />[`packages/wasm/src/eval/analysis/groupby.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/eval/analysis/groupby.rs) |

</details>
