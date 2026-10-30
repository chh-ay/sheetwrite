---
title: "Financial functions"
description: "Every financial formula function, its engine build, and its signature, semantic, dialect, and implementation profiles."
---

This page lists the 23 functions of the financial family. Taxonomy/source: [Financial functions](https://support.microsoft.com/en-us/office/excel-functions-by-category-5f91f4e9-7b42-46d2-9bd1-63f26a86c0eb). The [formula function contract](/docs/reference/formula-functions/) has every family, the engine builds, and the evaluation limits.

## Functions

<FormulaReference>

<section class="sw-formula-family">

<table class="sw-formula-table"><thead><tr><th>Function (aliases)</th><th>Engine</th><th>Contract</th></tr></thead><tbody>
<tr data-formula-name="PV" data-engine="default"><td><code>PV</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-pv-fv-pmt">Signature: <code>pv-fv-pmt</code></a><br /><a href="#semantics-financial">Semantics: <code>financial</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="FV" data-engine="default"><td><code>FV</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-pv-fv-pmt">Signature: <code>pv-fv-pmt</code></a><br /><a href="#semantics-financial">Semantics: <code>financial</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="PMT" data-engine="default"><td><code>PMT</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-pv-fv-pmt">Signature: <code>pv-fv-pmt</code></a><br /><a href="#semantics-financial">Semantics: <code>financial</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="NPV" data-engine="default"><td><code>NPV</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-npv">Signature: <code>npv</code></a><br /><a href="#semantics-financial">Semantics: <code>financial</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="IRR" data-engine="default"><td><code>IRR</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-irr">Signature: <code>irr</code></a><br /><a href="#semantics-financial-iterative">Semantics: <code>financial-iterative</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="RATE" data-engine="default"><td><code>RATE</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-rate">Signature: <code>rate</code></a><br /><a href="#semantics-financial-iterative">Semantics: <code>financial-iterative</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="IPMT" data-engine="default"><td><code>IPMT</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-period-payment">Signature: <code>period-payment</code></a><br /><a href="#semantics-financial">Semantics: <code>financial</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="PPMT" data-engine="default"><td><code>PPMT</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-period-payment">Signature: <code>period-payment</code></a><br /><a href="#semantics-financial">Semantics: <code>financial</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="CUMIPMT" data-engine="full"><td><code>CUMIPMT</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-cumulative-payment">Signature: <code>cumulative-payment</code></a><br /><a href="#semantics-financial">Semantics: <code>financial</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-analysis-finance">Implementation: <code>analysis-finance</code></a></details></td></tr>
<tr data-formula-name="CUMPRINC" data-engine="full"><td><code>CUMPRINC</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-cumulative-payment">Signature: <code>cumulative-payment</code></a><br /><a href="#semantics-financial">Semantics: <code>financial</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-analysis-finance">Implementation: <code>analysis-finance</code></a></details></td></tr>
<tr data-formula-name="DB" data-engine="full"><td><code>DB</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-db">Signature: <code>db</code></a><br /><a href="#semantics-financial">Semantics: <code>financial</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-analysis-finance">Implementation: <code>analysis-finance</code></a></details></td></tr>
<tr data-formula-name="DDB" data-engine="full"><td><code>DDB</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-ddb">Signature: <code>ddb</code></a><br /><a href="#semantics-financial">Semantics: <code>financial</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-analysis-finance">Implementation: <code>analysis-finance</code></a></details></td></tr>
<tr data-formula-name="EFFECT" data-engine="full"><td><code>EFFECT</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-binary-number">Signature: <code>binary-number</code></a><br /><a href="#semantics-financial">Semantics: <code>financial</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-analysis-finance">Implementation: <code>analysis-finance</code></a></details></td></tr>
<tr data-formula-name="FVSCHEDULE" data-engine="full"><td><code>FVSCHEDULE</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-fvschedule">Signature: <code>fvschedule</code></a><br /><a href="#semantics-financial">Semantics: <code>financial</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-analysis-finance">Implementation: <code>analysis-finance</code></a></details></td></tr>
<tr data-formula-name="MIRR" data-engine="full"><td><code>MIRR</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-mirr">Signature: <code>mirr</code></a><br /><a href="#semantics-financial">Semantics: <code>financial</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-analysis-finance">Implementation: <code>analysis-finance</code></a></details></td></tr>
<tr data-formula-name="NOMINAL" data-engine="full"><td><code>NOMINAL</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-binary-number">Signature: <code>binary-number</code></a><br /><a href="#semantics-financial">Semantics: <code>financial</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-analysis-finance">Implementation: <code>analysis-finance</code></a></details></td></tr>
<tr data-formula-name="NPER" data-engine="full"><td><code>NPER</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-nper">Signature: <code>nper</code></a><br /><a href="#semantics-financial">Semantics: <code>financial</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-analysis-finance">Implementation: <code>analysis-finance</code></a></details></td></tr>
<tr data-formula-name="PDURATION" data-engine="full"><td><code>PDURATION</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-pduration">Signature: <code>pduration</code></a><br /><a href="#semantics-financial">Semantics: <code>financial</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-analysis-finance">Implementation: <code>analysis-finance</code></a></details></td></tr>
<tr data-formula-name="RRI" data-engine="full"><td><code>RRI</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-rri">Signature: <code>rri</code></a><br /><a href="#semantics-financial">Semantics: <code>financial</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-analysis-finance">Implementation: <code>analysis-finance</code></a></details></td></tr>
<tr data-formula-name="SLN" data-engine="full"><td><code>SLN</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-sln">Signature: <code>sln</code></a><br /><a href="#semantics-financial">Semantics: <code>financial</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-analysis-finance">Implementation: <code>analysis-finance</code></a></details></td></tr>
<tr data-formula-name="SYD" data-engine="full"><td><code>SYD</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-syd">Signature: <code>syd</code></a><br /><a href="#semantics-financial">Semantics: <code>financial</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-analysis-finance">Implementation: <code>analysis-finance</code></a></details></td></tr>
<tr data-formula-name="XIRR" data-engine="full"><td><code>XIRR</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-xirr">Signature: <code>xirr</code></a><br /><a href="#semantics-financial-iterative">Semantics: <code>financial-iterative</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-analysis-finance">Implementation: <code>analysis-finance</code></a></details></td></tr>
<tr data-formula-name="XNPV" data-engine="full"><td><code>XNPV</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-xnpv">Signature: <code>xnpv</code></a><br /><a href="#semantics-financial">Semantics: <code>financial</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-analysis-finance">Implementation: <code>analysis-finance</code></a></details></td></tr>
</tbody></table>

</section>

</FormulaReference>

## Signature profiles

Argument order, required/default state, accepted shapes, repetition, and return shape come directly from the inventory.

<details id="signature-pv-fv-pmt"><summary>Signature: pv-fv-pmt</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `rate` | yes | none | `scalar`, `reference` | `once` |
| `nper` | yes | none | `scalar`, `reference` | `once` |
| `paymentOrPresentValue` | yes | none | `scalar`, `reference` | `once` |
| `futureValue` | no | 0 | `scalar`, `reference` | `once` |
| `type` | no | 0 | `scalar`, `reference` | `once` |

</details>

<details id="signature-npv"><summary>Signature: npv</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `rate` | yes | none | `scalar`, `reference` | `once` |
| `value` | yes | none | `scalar`, `range`, `array`, `reference` | `one-or-more` |

</details>

<details id="signature-irr"><summary>Signature: irr</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `values` | yes | none | `range`, `array`, `reference` | `once` |
| `guess` | no | 0.1 | `scalar`, `reference` | `once` |

</details>

<details id="signature-rate"><summary>Signature: rate</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `nper` | yes | none | `scalar`, `reference` | `once` |
| `payment` | yes | none | `scalar`, `reference` | `once` |
| `presentValue` | yes | none | `scalar`, `reference` | `once` |
| `futureValue` | no | 0 | `scalar`, `reference` | `once` |
| `type` | no | 0 | `scalar`, `reference` | `once` |
| `guess` | no | 0.1 | `scalar`, `reference` | `once` |

</details>

<details id="signature-period-payment"><summary>Signature: period-payment</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `rate` | yes | none | `scalar`, `reference` | `once` |
| `period` | yes | none | `scalar`, `reference` | `once` |
| `nper` | yes | none | `scalar`, `reference` | `once` |
| `presentValue` | yes | none | `scalar`, `reference` | `once` |
| `futureValue` | no | 0 | `scalar`, `reference` | `once` |
| `type` | no | 0 | `scalar`, `reference` | `once` |

</details>

<details id="signature-cumulative-payment"><summary>Signature: cumulative-payment</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `rate` | yes | none | `scalar`, `reference` | `once` |
| `nper` | yes | none | `scalar`, `reference` | `once` |
| `presentValue` | yes | none | `scalar`, `reference` | `once` |
| `startPeriod` | yes | none | `scalar`, `reference` | `once` |
| `endPeriod` | yes | none | `scalar`, `reference` | `once` |
| `type` | yes | none | `scalar`, `reference` | `once` |

</details>

<details id="signature-db"><summary>Signature: db</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `cost` | yes | none | `scalar`, `reference` | `once` |
| `salvage` | yes | none | `scalar`, `reference` | `once` |
| `life` | yes | none | `scalar`, `reference` | `once` |
| `period` | yes | none | `scalar`, `reference` | `once` |
| `month` | no | 12 | `scalar`, `reference` | `once` |

</details>

<details id="signature-ddb"><summary>Signature: ddb</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `cost` | yes | none | `scalar`, `reference` | `once` |
| `salvage` | yes | none | `scalar`, `reference` | `once` |
| `life` | yes | none | `scalar`, `reference` | `once` |
| `period` | yes | none | `scalar`, `reference` | `once` |
| `factor` | no | 2 | `scalar`, `reference` | `once` |

</details>

<details id="signature-binary-number"><summary>Signature: binary-number</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `number1` | yes | none | `scalar`, `reference` | `once` |
| `number2` | yes | none | `scalar`, `reference` | `once` |

</details>

<details id="signature-fvschedule"><summary>Signature: fvschedule</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `principal` | yes | none | `scalar`, `reference` | `once` |
| `schedule` | yes | none | `scalar`, `range`, `array`, `reference` | `once` |

</details>

<details id="signature-mirr"><summary>Signature: mirr</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `values` | yes | none | `scalar`, `range`, `array`, `reference` | `once` |
| `financeRate` | yes | none | `scalar`, `reference` | `once` |
| `reinvestRate` | yes | none | `scalar`, `reference` | `once` |

</details>

<details id="signature-nper"><summary>Signature: nper</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `rate` | yes | none | `scalar`, `reference` | `once` |
| `payment` | yes | none | `scalar`, `reference` | `once` |
| `presentValue` | yes | none | `scalar`, `reference` | `once` |
| `futureValue` | no | 0 | `scalar`, `reference` | `once` |
| `type` | no | 0 | `scalar`, `reference` | `once` |

</details>

<details id="signature-pduration"><summary>Signature: pduration</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `rate` | yes | none | `scalar`, `reference` | `once` |
| `presentValue` | yes | none | `scalar`, `reference` | `once` |
| `futureValue` | yes | none | `scalar`, `reference` | `once` |

</details>

<details id="signature-rri"><summary>Signature: rri</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `nper` | yes | none | `scalar`, `reference` | `once` |
| `presentValue` | yes | none | `scalar`, `reference` | `once` |
| `futureValue` | yes | none | `scalar`, `reference` | `once` |

</details>

<details id="signature-sln"><summary>Signature: sln</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `cost` | yes | none | `scalar`, `reference` | `once` |
| `salvage` | yes | none | `scalar`, `reference` | `once` |
| `life` | yes | none | `scalar`, `reference` | `once` |

</details>

<details id="signature-syd"><summary>Signature: syd</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `cost` | yes | none | `scalar`, `reference` | `once` |
| `salvage` | yes | none | `scalar`, `reference` | `once` |
| `life` | yes | none | `scalar`, `reference` | `once` |
| `period` | yes | none | `scalar`, `reference` | `once` |

</details>

<details id="signature-xirr"><summary>Signature: xirr</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `values` | yes | none | `scalar`, `range`, `array`, `reference` | `once` |
| `dates` | yes | none | `scalar`, `range`, `array`, `reference` | `once` |
| `guess` | no | 0.1 | `scalar`, `reference` | `once` |

</details>

<details id="signature-xnpv"><summary>Signature: xnpv</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `rate` | yes | none | `scalar`, `reference` | `once` |
| `values` | yes | none | `scalar`, `range`, `array`, `reference` | `once` |
| `dates` | yes | none | `scalar`, `range`, `array`, `reference` | `once` |

</details>

## Semantic profiles

These values are normative for the listed Sheetwrite subset. `function-defined` and `contextual` are explicit limitations: consult the formula guides' function-specific sections rather than assuming another spreadsheet's edge behavior.

<details id="semantics-financial"><summary>Semantics: financial</summary>

| Dimension | Contract |
| --- | --- |
| shape | scalar: accepted<br />range: contextual<br />array: contextual<br />broadcast: function-defined<br />result: scalar |
| coercion | blank: zero<br />text: number-if-parseable<br />boolean: number<br />error: propagate |
| text | case: not-applicable<br />wildcard: not-applicable |
| environment | locale: invariant<br />dateSystem: not-applicable |
| numeric | tolerance: binary64<br />domain: bounded<br />iteration: kind: none<br />maximum: none |
| calculation | dependencies: tracked<br />lazy: eager<br />spill: scalar<br />fill: relative-reference-rewrite<br />copy: relative-reference-rewrite<br />structuralRewrite: ast-reference-rewrite |
| persistence | snapshot: formula-source<br />history: formula-source<br />collaboration: formula-source<br />xlsxSource: rewrite-on-structural-edit |

</details>

<details id="semantics-financial-iterative"><summary>Semantics: financial-iterative</summary>

| Dimension | Contract |
| --- | --- |
| shape | scalar: accepted<br />range: accepted<br />array: accepted<br />broadcast: none<br />result: scalar |
| coercion | blank: zero<br />text: number-if-parseable<br />boolean: number<br />error: propagate |
| text | case: not-applicable<br />wildcard: not-applicable |
| environment | locale: invariant<br />dateSystem: not-applicable |
| numeric | tolerance: binary64<br />domain: bounded<br />iteration: kind: bounded<br />maximum: 100 |
| calculation | dependencies: tracked<br />lazy: eager<br />spill: scalar<br />fill: relative-reference-rewrite<br />copy: relative-reference-rewrite<br />structuralRewrite: ast-reference-rewrite |
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

## Implementation profiles

<details id="implementation-implemented-assisted"><summary>Implementation: implemented-assisted</summary>

| Layer | Status and source/evidence |
| --- | --- |
| Parser | implemented<br />[`packages/wasm/src/calc.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/calc.rs) |
| Evaluator | implemented<br />[`packages/wasm/src/eval/mod.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/eval/mod.rs)<br />[`packages/wasm/src/eval/functions.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/eval/functions.rs) |
| Formula assist | implemented<br />[`packages/core/src/formula-assist.ts`](https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/formula-assist.ts) |
| Evidence | source-linked<br />[`packages/wasm/src/tests.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/tests.rs)<br />[`packages/core/test/formula-assist.test.ts`](https://github.com/chh-ay/sheetwrite/blob/main/packages/core/test/formula-assist.test.ts) |

</details>

<details id="implementation-analysis-finance"><summary>Implementation: analysis-finance</summary>

| Layer | Status and source/evidence |
| --- | --- |
| Parser | implemented<br />[`packages/wasm/src/calc.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/calc.rs) |
| Evaluator | implemented<br />[`packages/wasm/src/eval/analysis/finance.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/eval/analysis/finance.rs) |
| Formula assist | implemented<br />[`packages/core/src/formula-assist.ts`](https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/formula-assist.ts) |
| Evidence | source-linked<br />[`scripts/formula-contract.test.ts`](https://github.com/chh-ay/sheetwrite/blob/main/scripts/formula-contract.test.ts) |

</details>
