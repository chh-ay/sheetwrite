---
title: "Engineering functions"
description: "Every engineering formula function, its engine build, and its signature, semantic, dialect, and implementation profiles."
---

This page lists the 4 functions of the engineering family. Taxonomy/source: [Engineering functions](https://support.microsoft.com/en-us/office/excel-functions-by-category-5f91f4e9-7b42-46d2-9bd1-63f26a86c0eb). The [formula function contract](/docs/reference/formula-functions/) has every family, the engine builds, and the evaluation limits.

## Functions

<FormulaReference>

<section class="sw-formula-family">

<table class="sw-formula-table"><thead><tr><th>Function (aliases)</th><th>Engine</th><th>Contract</th></tr></thead><tbody>
<tr data-formula-name="BESSELI" data-engine="full"><td><code>BESSELI</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-bessel">Signature: <code>bessel</code></a><br /><a href="#semantics-analysis-engineering">Semantics: <code>analysis-engineering</code></a><br /><a href="#dialect-analysis-engineering">Dialect: <code>analysis-engineering</code></a><br /><a href="#implementation-analysis-engineering">Implementation: <code>analysis-engineering</code></a></details></td></tr>
<tr data-formula-name="BESSELJ" data-engine="full"><td><code>BESSELJ</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-bessel">Signature: <code>bessel</code></a><br /><a href="#semantics-analysis-engineering">Semantics: <code>analysis-engineering</code></a><br /><a href="#dialect-analysis-engineering">Dialect: <code>analysis-engineering</code></a><br /><a href="#implementation-analysis-engineering">Implementation: <code>analysis-engineering</code></a></details></td></tr>
<tr data-formula-name="BESSELK" data-engine="full"><td><code>BESSELK</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-bessel">Signature: <code>bessel</code></a><br /><a href="#semantics-analysis-engineering">Semantics: <code>analysis-engineering</code></a><br /><a href="#dialect-analysis-engineering">Dialect: <code>analysis-engineering</code></a><br /><a href="#implementation-analysis-engineering">Implementation: <code>analysis-engineering</code></a></details></td></tr>
<tr data-formula-name="BESSELY" data-engine="full"><td><code>BESSELY</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-bessel">Signature: <code>bessel</code></a><br /><a href="#semantics-analysis-engineering">Semantics: <code>analysis-engineering</code></a><br /><a href="#dialect-analysis-engineering">Dialect: <code>analysis-engineering</code></a><br /><a href="#implementation-analysis-engineering">Implementation: <code>analysis-engineering</code></a></details></td></tr>
</tbody></table>

</section>

</FormulaReference>

## Signature profiles

Argument order, required/default state, accepted shapes, repetition, and return shape come directly from the inventory.

<details id="signature-bessel"><summary>Signature: bessel</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `x` | yes | none | `scalar`, `reference` | `once` |
| `n` | yes | none | `scalar`, `reference` | `once` |

</details>

## Semantic profiles

These values are normative for the listed Sheetwrite subset. `function-defined` and `contextual` are explicit limitations: consult the formula guides' function-specific sections rather than assuming another spreadsheet's edge behavior.

<details id="semantics-analysis-engineering"><summary>Semantics: analysis-engineering</summary>

| Dimension | Contract |
| --- | --- |
| shape | scalar: accepted<br />range: contextual<br />array: contextual<br />broadcast: none<br />result: scalar |
| coercion | blank: function-defined<br />text: function-defined<br />boolean: function-defined<br />error: propagate |
| text | case: not-applicable<br />wildcard: not-applicable |
| environment | locale: invariant<br />dateSystem: not-applicable |
| numeric | tolerance: binary64<br />domain: bounded<br />iteration: kind: none<br />maximum: none |
| calculation | dependencies: tracked<br />lazy: eager<br />spill: scalar<br />fill: relative-reference-rewrite<br />copy: relative-reference-rewrite<br />structuralRewrite: ast-reference-rewrite |
| persistence | snapshot: formula-source<br />history: formula-source<br />collaboration: formula-source<br />xlsxSource: rewrite-on-structural-edit |

</details>

## Dialect profiles

<details id="dialect-analysis-engineering"><summary>Dialect: analysis-engineering</summary>

| Dialect | Status |
| --- | --- |
| Microsoft Excel | documented |
| Google Sheets | unverified |
| OpenFormula | unverified |

Limitations: Available only in the optional @sheetwrite/formulas analysis build; default @sheetwrite/wasm returns #NAME?. BESSELI, BESSELJ, BESSELK and BESSELY use the rational and polynomial approximations that give Excel's published results. They are accurate to about 1E-8.

</details>

## Implementation profiles

<details id="implementation-analysis-engineering"><summary>Implementation: analysis-engineering</summary>

| Layer | Status and source/evidence |
| --- | --- |
| Parser | implemented<br />[`packages/wasm/src/calc.rs`](https://github.com/chh-ay/sheetwrite/blob/develop/packages/wasm/src/calc.rs) |
| Evaluator | implemented<br />[`packages/wasm/src/eval/analysis/bessel.rs`](https://github.com/chh-ay/sheetwrite/blob/develop/packages/wasm/src/eval/analysis/bessel.rs) |
| Formula assist | implemented<br />[`packages/core/src/formula-assist.ts`](https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/formula-assist.ts) |
| Evidence | source-linked<br />[`scripts/formula-contract.test.ts`](https://github.com/chh-ay/sheetwrite/blob/develop/scripts/formula-contract.test.ts) |

</details>
