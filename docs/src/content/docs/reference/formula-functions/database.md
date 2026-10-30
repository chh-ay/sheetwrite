---
title: "Database functions"
description: "Every database formula function, its engine build, and its signature, semantic, dialect, and implementation profiles."
---

This page lists the 12 functions of the database family. Taxonomy/source: [Database functions](https://support.microsoft.com/en-us/office/excel-functions-by-category-5f91f4e9-7b42-46d2-9bd1-63f26a86c0eb). The [formula function contract](/docs/reference/formula-functions/) has every family, the engine builds, and the evaluation limits.

## Functions

<FormulaReference>

<section class="sw-formula-family">

<table class="sw-formula-table"><thead><tr><th>Function (aliases)</th><th>Engine</th><th>Contract</th></tr></thead><tbody>
<tr data-formula-name="DAVERAGE" data-engine="full"><td><code>DAVERAGE</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-database">Signature: <code>database</code></a><br /><a href="#semantics-analysis-database">Semantics: <code>analysis-database</code></a><br /><a href="#dialect-analysis-database">Dialect: <code>analysis-database</code></a><br /><a href="#implementation-analysis-database">Implementation: <code>analysis-database</code></a></details></td></tr>
<tr data-formula-name="DCOUNT" data-engine="full"><td><code>DCOUNT</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-database">Signature: <code>database</code></a><br /><a href="#semantics-analysis-database">Semantics: <code>analysis-database</code></a><br /><a href="#dialect-analysis-database">Dialect: <code>analysis-database</code></a><br /><a href="#implementation-analysis-database">Implementation: <code>analysis-database</code></a></details></td></tr>
<tr data-formula-name="DCOUNTA" data-engine="full"><td><code>DCOUNTA</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-database">Signature: <code>database</code></a><br /><a href="#semantics-analysis-database">Semantics: <code>analysis-database</code></a><br /><a href="#dialect-analysis-database">Dialect: <code>analysis-database</code></a><br /><a href="#implementation-analysis-database">Implementation: <code>analysis-database</code></a></details></td></tr>
<tr data-formula-name="DGET" data-engine="full"><td><code>DGET</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-database">Signature: <code>database</code></a><br /><a href="#semantics-analysis-database">Semantics: <code>analysis-database</code></a><br /><a href="#dialect-analysis-database">Dialect: <code>analysis-database</code></a><br /><a href="#implementation-analysis-database">Implementation: <code>analysis-database</code></a></details></td></tr>
<tr data-formula-name="DMAX" data-engine="full"><td><code>DMAX</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-database">Signature: <code>database</code></a><br /><a href="#semantics-analysis-database">Semantics: <code>analysis-database</code></a><br /><a href="#dialect-analysis-database">Dialect: <code>analysis-database</code></a><br /><a href="#implementation-analysis-database">Implementation: <code>analysis-database</code></a></details></td></tr>
<tr data-formula-name="DMIN" data-engine="full"><td><code>DMIN</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-database">Signature: <code>database</code></a><br /><a href="#semantics-analysis-database">Semantics: <code>analysis-database</code></a><br /><a href="#dialect-analysis-database">Dialect: <code>analysis-database</code></a><br /><a href="#implementation-analysis-database">Implementation: <code>analysis-database</code></a></details></td></tr>
<tr data-formula-name="DPRODUCT" data-engine="full"><td><code>DPRODUCT</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-database">Signature: <code>database</code></a><br /><a href="#semantics-analysis-database">Semantics: <code>analysis-database</code></a><br /><a href="#dialect-analysis-database">Dialect: <code>analysis-database</code></a><br /><a href="#implementation-analysis-database">Implementation: <code>analysis-database</code></a></details></td></tr>
<tr data-formula-name="DSTDEV" data-engine="full"><td><code>DSTDEV</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-database">Signature: <code>database</code></a><br /><a href="#semantics-analysis-database">Semantics: <code>analysis-database</code></a><br /><a href="#dialect-analysis-database">Dialect: <code>analysis-database</code></a><br /><a href="#implementation-analysis-database">Implementation: <code>analysis-database</code></a></details></td></tr>
<tr data-formula-name="DSTDEVP" data-engine="full"><td><code>DSTDEVP</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-database">Signature: <code>database</code></a><br /><a href="#semantics-analysis-database">Semantics: <code>analysis-database</code></a><br /><a href="#dialect-analysis-database">Dialect: <code>analysis-database</code></a><br /><a href="#implementation-analysis-database">Implementation: <code>analysis-database</code></a></details></td></tr>
<tr data-formula-name="DSUM" data-engine="full"><td><code>DSUM</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-database">Signature: <code>database</code></a><br /><a href="#semantics-analysis-database">Semantics: <code>analysis-database</code></a><br /><a href="#dialect-analysis-database">Dialect: <code>analysis-database</code></a><br /><a href="#implementation-analysis-database">Implementation: <code>analysis-database</code></a></details></td></tr>
<tr data-formula-name="DVAR" data-engine="full"><td><code>DVAR</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-database">Signature: <code>database</code></a><br /><a href="#semantics-analysis-database">Semantics: <code>analysis-database</code></a><br /><a href="#dialect-analysis-database">Dialect: <code>analysis-database</code></a><br /><a href="#implementation-analysis-database">Implementation: <code>analysis-database</code></a></details></td></tr>
<tr data-formula-name="DVARP" data-engine="full"><td><code>DVARP</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-database">Signature: <code>database</code></a><br /><a href="#semantics-analysis-database">Semantics: <code>analysis-database</code></a><br /><a href="#dialect-analysis-database">Dialect: <code>analysis-database</code></a><br /><a href="#implementation-analysis-database">Implementation: <code>analysis-database</code></a></details></td></tr>
</tbody></table>

</section>

</FormulaReference>

## Signature profiles

Argument order, required/default state, accepted shapes, repetition, and return shape come directly from the inventory.

<details id="signature-database"><summary>Signature: database</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `database` | yes | none | `range`, `reference` | `once` |
| `field` | yes | none | `scalar`, `reference` | `once` |
| `criteria` | yes | none | `range`, `reference` | `once` |

</details>

## Semantic profiles

These values are normative for the listed Sheetwrite subset. `function-defined` and `contextual` are explicit limitations: consult the formula guides' function-specific sections rather than assuming another spreadsheet's edge behavior.

<details id="semantics-analysis-database"><summary>Semantics: analysis-database</summary>

| Dimension | Contract |
| --- | --- |
| shape | scalar: accepted<br />range: accepted<br />array: accepted<br />broadcast: none<br />result: scalar |
| coercion | blank: function-defined<br />text: function-defined<br />boolean: function-defined<br />error: function-defined |
| text | case: insensitive<br />wildcard: supported |
| environment | locale: invariant<br />dateSystem: not-applicable |
| numeric | tolerance: binary64<br />domain: function-defined<br />iteration: kind: none<br />maximum: none |
| calculation | dependencies: tracked<br />lazy: eager<br />spill: scalar<br />fill: relative-reference-rewrite<br />copy: relative-reference-rewrite<br />structuralRewrite: ast-reference-rewrite |
| persistence | snapshot: formula-source<br />history: formula-source<br />collaboration: formula-source<br />xlsxSource: rewrite-on-structural-edit |

</details>

## Dialect profiles

<details id="dialect-analysis-database"><summary>Dialect: analysis-database</summary>

| Dialect | Status |
| --- | --- |
| Microsoft Excel | documented |
| Google Sheets | unverified |
| OpenFormula | unverified |

Limitations: Available only in the optional @sheetwrite/formulas analysis build; default @sheetwrite/wasm returns #NAME?. Database criteria use header names, AND across columns, and OR across rows. Custom formula predicates under headers that are not database fields are not supported.

</details>

## Implementation profiles

<details id="implementation-analysis-database"><summary>Implementation: analysis-database</summary>

| Layer | Status and source/evidence |
| --- | --- |
| Parser | implemented<br />[`packages/wasm/src/calc.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/calc.rs) |
| Evaluator | implemented<br />[`packages/wasm/src/eval/analysis/database.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/eval/analysis/database.rs) |
| Formula assist | implemented<br />[`packages/core/src/formula-assist.ts`](https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/formula-assist.ts) |
| Evidence | source-linked<br />[`scripts/formula-contract.test.ts`](https://github.com/chh-ay/sheetwrite/blob/main/scripts/formula-contract.test.ts) |

</details>
