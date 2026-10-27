---
title: "Date and time functions"
description: "Every date and time formula function, its engine build, and its signature, semantic, dialect, and implementation profiles."
---

This page lists the 25 functions of the date and time family. Taxonomy/source: [Date and time functions](https://support.microsoft.com/en-us/office/excel-functions-by-category-5f91f4e9-7b42-46d2-9bd1-63f26a86c0eb). The [formula function contract](/docs/reference/formula-functions/) has every family, the engine builds, and the evaluation limits.

## Functions

<FormulaReference>

<section class="sw-formula-family">

<table class="sw-formula-table"><thead><tr><th>Function (aliases)</th><th>Engine</th><th>Contract</th></tr></thead><tbody>
<tr data-formula-name="DATE" data-engine="default"><td><code>DATE</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>incumbent</summary><a href="#signature-date-three">Signature: <code>date-three</code></a><br /><a href="#semantics-date-time">Semantics: <code>date-time</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="DATEVALUE" data-engine="default"><td><code>DATEVALUE</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>incumbent</summary><a href="#signature-unary-value">Signature: <code>unary-value</code></a><br /><a href="#semantics-date-time">Semantics: <code>date-time</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="DAY" data-engine="default"><td><code>DAY</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>incumbent</summary><a href="#signature-unary-number">Signature: <code>unary-number</code></a><br /><a href="#semantics-date-time">Semantics: <code>date-time</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="MONTH" data-engine="default"><td><code>MONTH</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>incumbent</summary><a href="#signature-unary-number">Signature: <code>unary-number</code></a><br /><a href="#semantics-date-time">Semantics: <code>date-time</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="YEAR" data-engine="default"><td><code>YEAR</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>incumbent</summary><a href="#signature-unary-number">Signature: <code>unary-number</code></a><br /><a href="#semantics-date-time">Semantics: <code>date-time</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="TODAY" data-engine="default"><td><code>TODAY</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>incumbent</summary><a href="#signature-zero">Signature: <code>zero</code></a><br /><a href="#semantics-volatile-date">Semantics: <code>volatile-date</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="NOW" data-engine="default"><td><code>NOW</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>incumbent</summary><a href="#signature-zero">Signature: <code>zero</code></a><br /><a href="#semantics-volatile-date">Semantics: <code>volatile-date</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="TIME" data-engine="default"><td><code>TIME</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-date-three">Signature: <code>date-three</code></a><br /><a href="#semantics-date-time">Semantics: <code>date-time</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="TIMEVALUE" data-engine="default"><td><code>TIMEVALUE</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-unary-value">Signature: <code>unary-value</code></a><br /><a href="#semantics-date-time">Semantics: <code>date-time</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="HOUR" data-engine="default"><td><code>HOUR</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-unary-value">Signature: <code>unary-value</code></a><br /><a href="#semantics-date-time">Semantics: <code>date-time</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="MINUTE" data-engine="default"><td><code>MINUTE</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-unary-value">Signature: <code>unary-value</code></a><br /><a href="#semantics-date-time">Semantics: <code>date-time</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="SECOND" data-engine="default"><td><code>SECOND</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-unary-value">Signature: <code>unary-value</code></a><br /><a href="#semantics-date-time">Semantics: <code>date-time</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="DAYS" data-engine="default"><td><code>DAYS</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-date-pair">Signature: <code>date-pair</code></a><br /><a href="#semantics-date-time">Semantics: <code>date-time</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="EDATE" data-engine="default"><td><code>EDATE</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-date-offset">Signature: <code>date-offset</code></a><br /><a href="#semantics-date-time">Semantics: <code>date-time</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="EOMONTH" data-engine="default"><td><code>EOMONTH</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-date-offset">Signature: <code>date-offset</code></a><br /><a href="#semantics-date-time">Semantics: <code>date-time</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="WEEKDAY" data-engine="default"><td><code>WEEKDAY</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-weekday-weeknum">Signature: <code>weekday-weeknum</code></a><br /><a href="#semantics-date-time">Semantics: <code>date-time</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="WEEKNUM" data-engine="default"><td><code>WEEKNUM</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-weekday-weeknum">Signature: <code>weekday-weeknum</code></a><br /><a href="#semantics-date-time">Semantics: <code>date-time</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="WORKDAY" data-engine="default"><td><code>WORKDAY</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-workday">Signature: <code>workday</code></a><br /><a href="#semantics-date-time">Semantics: <code>date-time</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="NETWORKDAYS" data-engine="default"><td><code>NETWORKDAYS</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-networkdays">Signature: <code>networkdays</code></a><br /><a href="#semantics-date-time">Semantics: <code>date-time</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="YEARFRAC" data-engine="default"><td><code>YEARFRAC</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-yearfrac-days360">Signature: <code>yearfrac-days360</code></a><br /><a href="#semantics-date-time">Semantics: <code>date-time</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="DAYS360" data-engine="default"><td><code>DAYS360</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-yearfrac-days360">Signature: <code>yearfrac-days360</code></a><br /><a href="#semantics-date-time">Semantics: <code>date-time</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="DATEDIF" data-engine="full"><td><code>DATEDIF</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-datedif">Signature: <code>datedif</code></a><br /><a href="#semantics-date-time">Semantics: <code>date-time</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-analysis-dates">Implementation: <code>analysis-dates</code></a></details></td></tr>
<tr data-formula-name="ISOWEEKNUM" data-engine="full"><td><code>ISOWEEKNUM</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-unary-number">Signature: <code>unary-number</code></a><br /><a href="#semantics-date-time">Semantics: <code>date-time</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-analysis-dates">Implementation: <code>analysis-dates</code></a></details></td></tr>
<tr data-formula-name="NETWORKDAYS.INTL" data-engine="full"><td><code>NETWORKDAYS.INTL</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-calendar-intl">Signature: <code>calendar-intl</code></a><br /><a href="#semantics-date-time">Semantics: <code>date-time</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-analysis-dates">Implementation: <code>analysis-dates</code></a></details></td></tr>
<tr data-formula-name="WORKDAY.INTL" data-engine="full"><td><code>WORKDAY.INTL</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-calendar-intl">Signature: <code>calendar-intl</code></a><br /><a href="#semantics-date-time">Semantics: <code>date-time</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-analysis-dates">Implementation: <code>analysis-dates</code></a></details></td></tr>
</tbody></table>

</section>

</FormulaReference>

## Signature profiles

Argument order, required/default state, accepted shapes, repetition, and return shape come directly from the inventory.

<details id="signature-date-three"><summary>Signature: date-three</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `part1` | yes | none | `scalar`, `reference` | `once` |
| `part2` | yes | none | `scalar`, `reference` | `once` |
| `part3` | yes | none | `scalar`, `reference` | `once` |

</details>

<details id="signature-unary-value"><summary>Signature: unary-value</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `value` | yes | none | `scalar`, `range`, `array`, `reference` | `once` |

</details>

<details id="signature-unary-number"><summary>Signature: unary-number</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `number` | yes | none | `scalar`, `reference` | `once` |

</details>

<details id="signature-zero"><summary>Signature: zero</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| _none_ | — | — | — | — |

</details>

<details id="signature-date-pair"><summary>Signature: date-pair</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `endDate` | yes | none | `scalar`, `reference` | `once` |
| `startDate` | yes | none | `scalar`, `reference` | `once` |

</details>

<details id="signature-date-offset"><summary>Signature: date-offset</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `startDate` | yes | none | `scalar`, `reference` | `once` |
| `offset` | yes | none | `scalar`, `reference` | `once` |

</details>

<details id="signature-weekday-weeknum"><summary>Signature: weekday-weeknum</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `serialNumber` | yes | none | `scalar`, `reference` | `once` |
| `returnType` | no | 1 | `scalar`, `reference` | `once` |

</details>

<details id="signature-workday"><summary>Signature: workday</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `startDate` | yes | none | `scalar`, `reference` | `once` |
| `days` | yes | none | `scalar`, `reference` | `once` |
| `holidays` | no | none | `range`, `array`, `reference` | `once` |

</details>

<details id="signature-networkdays"><summary>Signature: networkdays</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `startDate` | yes | none | `scalar`, `reference` | `once` |
| `endDate` | yes | none | `scalar`, `reference` | `once` |
| `holidays` | no | none | `range`, `array`, `reference` | `once` |

</details>

<details id="signature-yearfrac-days360"><summary>Signature: yearfrac-days360</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `startDate` | yes | none | `scalar`, `reference` | `once` |
| `endDate` | yes | none | `scalar`, `reference` | `once` |
| `basisOrMethod` | no | 0 | `scalar`, `reference` | `once` |

</details>

<details id="signature-datedif"><summary>Signature: datedif</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `startDate` | yes | none | `scalar`, `reference` | `once` |
| `endDate` | yes | none | `scalar`, `reference` | `once` |
| `unit` | yes | none | `scalar`, `reference` | `once` |

</details>

<details id="signature-calendar-intl"><summary>Signature: calendar-intl</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `startDate` | yes | none | `scalar`, `reference` | `once` |
| `endDateOrDays` | yes | none | `scalar`, `reference` | `once` |
| `weekend` | no | 1 | `scalar`, `reference` | `once` |
| `holidays` | no | none | `scalar`, `range`, `array`, `reference` | `once` |

</details>

## Semantic profiles

These values are normative for the listed Sheetwrite subset. `function-defined` and `contextual` are explicit limitations: consult the formula guides' function-specific sections rather than assuming another spreadsheet's edge behavior.

<details id="semantics-date-time"><summary>Semantics: date-time</summary>

| Dimension | Contract |
| --- | --- |
| shape | scalar: accepted<br />range: contextual<br />array: contextual<br />broadcast: function-defined<br />result: scalar |
| coercion | blank: zero<br />text: number-if-parseable<br />boolean: number<br />error: propagate |
| text | case: insensitive<br />wildcard: literal |
| environment | locale: invariant<br />dateSystem: excel-1900 |
| numeric | tolerance: binary64<br />domain: bounded<br />iteration: kind: none<br />maximum: none |
| calculation | dependencies: tracked<br />lazy: eager<br />spill: scalar<br />fill: relative-reference-rewrite<br />copy: relative-reference-rewrite<br />structuralRewrite: ast-reference-rewrite |
| persistence | snapshot: formula-source<br />history: formula-source<br />collaboration: formula-source<br />xlsxSource: rewrite-on-structural-edit |

</details>

<details id="semantics-volatile-date"><summary>Semantics: volatile-date</summary>

| Dimension | Contract |
| --- | --- |
| shape | scalar: accepted<br />range: rejected<br />array: rejected<br />broadcast: none<br />result: scalar |
| coercion | blank: preserved<br />text: preserved<br />boolean: preserved<br />error: propagate |
| text | case: not-applicable<br />wildcard: not-applicable |
| environment | locale: not-applicable<br />dateSystem: host-clock |
| numeric | tolerance: binary64<br />domain: bounded<br />iteration: kind: none<br />maximum: none |
| calculation | dependencies: none<br />lazy: not-applicable<br />spill: scalar<br />fill: source-preserved<br />copy: source-preserved<br />structuralRewrite: source-preserved |
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

<details id="implementation-analysis-dates"><summary>Implementation: analysis-dates</summary>

| Layer | Status and source/evidence |
| --- | --- |
| Parser | implemented<br />[`packages/wasm/src/calc.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/calc.rs) |
| Evaluator | implemented<br />[`packages/wasm/src/eval/analysis/dates.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/eval/analysis/dates.rs) |
| Formula assist | implemented<br />[`packages/core/src/formula-assist.ts`](https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/formula-assist.ts) |
| Evidence | source-linked<br />[`scripts/formula-contract.test.ts`](https://github.com/chh-ay/sheetwrite/blob/main/scripts/formula-contract.test.ts) |

</details>
