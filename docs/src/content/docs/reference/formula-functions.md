---
title: "Formula function contract"
description: "Generated, source-linked formula names, signatures, semantics, dialect status, and unsupported boundaries."
---

# Formula function contract

This page is generated from the checked version 1 `sheetwrite.formula-capabilities` inventory. It publishes **100 required-supported target functions**, **54 incumbent functions**, and **145 optional analysis functions** (299 canonical functions total) without maintaining a second name list. Aliases share their canonical function's build availability.

A function's presence means only the signature and semantic profiles linked in its row. Microsoft Excel documentation supplies the naming/family taxonomy; it is not a blanket Excel claim. Google Sheets and OpenFormula behavior is unverified unless a dialect profile says otherwise.

## Engine builds

<details>
<summary>Choose and initialize an engine</summary>

- `@sheetwrite/wasm` is the default engine. The Engine column shows `Default + full` for a function in both engines and `Full only` for a function in `@sheetwrite/formulas` only.
- `@sheetwrite/formulas` is the full engine. It adds the analysis families marked below: distributions and statistics, regression, finance, dates, text and regex, database, math and matrices, reshaping, LAMBDA helpers, and grouping. Select it before creating any stores: `import * as formulas from "@sheetwrite/formulas"; await initSheetwrite(undefined, formulas);`.
- The active engine's registered names drive formula assist. Optional names are not suggested by the default engine and evaluate to `#NAME?` there; merely importing the optional package does not enable them.
- Numeric functions use binary64 arithmetic with function-specific domains and bounded numerical algorithms. The inventory does not claim unlimited tail accuracy or complete Excel/Google Sheets/OpenFormula parity.

</details>

## Bounded evaluation contract

<details>
<summary>Evaluation limits and numerical behavior</summary>

- Parsing and dependency evaluation are each capped at 256 recursive levels. Range and matrix work is capped at 1,000,000 cells, 1,048,576 rows, 16,384 columns, and 64 MiB of value/intermediate storage; excess work returns an explicit formula error rather than truncating.
- One dynamic-array recompute pass is capped at 2,000,000 cell operations. Spill installation is atomic and collision-checked; see the [formula guide](/docs/guides/formulas/#dynamic-arrays-and-spills) for admission rules.
- `LET` permits at most 126 bindings and 16,384 expanded AST nodes. Bindings are lexical, shadow outer bindings, and are expanded lazily, so unused reads, errors, and volatility do not become dependencies.
- Generated text is capped at 16 MiB and bounded searches at 4,000,000 steps. Text case conversion and parsing are Unicode-aware and host-locale independent; `NUMBERVALUE` defaults to `.` decimal and `,` grouping separators unless supplied explicitly.
- `IRR` and `RATE` use deterministic root solving: 14 bracket steps, at most 100 solve steps, fixed `1e-12` convergence tolerances, and a finite search domain. Non-convergence or an invalid domain returns `#NUM!`.

No formula throughput or latency number is published here because this contract has no checked final formula-performance artifact. Use the [performance evidence protocol](/docs/guides/performance-resources/) to capture and validate measurements; limits above are implementation ceilings, not benchmark results.

</details>

## Functions by family

<FormulaReference>

<section class="sw-formula-family">

### Dynamic array

Taxonomy/source: [Lookup and reference functions](https://support.microsoft.com/en-us/office/excel-functions-by-category-5f91f4e9-7b42-46d2-9bd1-63f26a86c0eb).

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

<section class="sw-formula-family">

### Date and time

Taxonomy/source: [Date and time functions](https://support.microsoft.com/en-us/office/excel-functions-by-category-5f91f4e9-7b42-46d2-9bd1-63f26a86c0eb).

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

<section class="sw-formula-family">

### Financial

Taxonomy/source: [Financial functions](https://support.microsoft.com/en-us/office/excel-functions-by-category-5f91f4e9-7b42-46d2-9bd1-63f26a86c0eb).

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

<section class="sw-formula-family">

### Information and error

Taxonomy/source: [Information functions](https://support.microsoft.com/en-us/office/excel-functions-by-category-5f91f4e9-7b42-46d2-9bd1-63f26a86c0eb).

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
<tr data-formula-name="N" data-engine="default"><td><code>N</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-unary-value">Signature: <code>unary-value</code></a><br /><a href="#semantics-information">Semantics: <code>information</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="T" data-engine="default"><td><code>T</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-unary-value">Signature: <code>unary-value</code></a><br /><a href="#semantics-information">Semantics: <code>information</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="NA" data-engine="default"><td><code>NA</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>incumbent</summary><a href="#signature-zero">Signature: <code>zero</code></a><br /><a href="#semantics-information">Semantics: <code>information</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="ISOMITTED" data-engine="full"><td><code>ISOMITTED</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-lambda-isomitted">Signature: <code>lambda-isomitted</code></a><br /><a href="#semantics-analysis-lambda">Semantics: <code>analysis-lambda</code></a><br /><a href="#dialect-analysis-lambda">Dialect: <code>analysis-lambda</code></a><br /><a href="#implementation-analysis-lambda">Implementation: <code>analysis-lambda</code></a></details></td></tr>
</tbody></table>

</section>

<section class="sw-formula-family">

### Logical and control flow

Taxonomy/source: [Logical functions](https://support.microsoft.com/en-us/office/excel-functions-by-category-5f91f4e9-7b42-46d2-9bd1-63f26a86c0eb).

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
<tr data-formula-name="LAMBDA" data-engine="full"><td><code>LAMBDA</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-lambda-lambda">Signature: <code>lambda-lambda</code></a><br /><a href="#semantics-analysis-lambda">Semantics: <code>analysis-lambda</code></a><br /><a href="#dialect-analysis-lambda">Dialect: <code>analysis-lambda</code></a><br /><a href="#implementation-analysis-lambda">Implementation: <code>analysis-lambda</code></a></details></td></tr>
<tr data-formula-name="MAP" data-engine="full"><td><code>MAP</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-lambda-map">Signature: <code>lambda-map</code></a><br /><a href="#semantics-analysis-lambda">Semantics: <code>analysis-lambda</code></a><br /><a href="#dialect-analysis-lambda">Dialect: <code>analysis-lambda</code></a><br /><a href="#implementation-analysis-lambda">Implementation: <code>analysis-lambda</code></a></details></td></tr>
<tr data-formula-name="REDUCE" data-engine="full"><td><code>REDUCE</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-lambda-reduce">Signature: <code>lambda-reduce</code></a><br /><a href="#semantics-analysis-lambda">Semantics: <code>analysis-lambda</code></a><br /><a href="#dialect-analysis-lambda">Dialect: <code>analysis-lambda</code></a><br /><a href="#implementation-analysis-lambda">Implementation: <code>analysis-lambda</code></a></details></td></tr>
<tr data-formula-name="SCAN" data-engine="full"><td><code>SCAN</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-lambda-scan">Signature: <code>lambda-scan</code></a><br /><a href="#semantics-analysis-lambda">Semantics: <code>analysis-lambda</code></a><br /><a href="#dialect-analysis-lambda">Dialect: <code>analysis-lambda</code></a><br /><a href="#implementation-analysis-lambda">Implementation: <code>analysis-lambda</code></a></details></td></tr>
<tr data-formula-name="BYROW" data-engine="full"><td><code>BYROW</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-lambda-byrow">Signature: <code>lambda-byrow</code></a><br /><a href="#semantics-analysis-lambda">Semantics: <code>analysis-lambda</code></a><br /><a href="#dialect-analysis-lambda">Dialect: <code>analysis-lambda</code></a><br /><a href="#implementation-analysis-lambda">Implementation: <code>analysis-lambda</code></a></details></td></tr>
<tr data-formula-name="BYCOL" data-engine="full"><td><code>BYCOL</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-lambda-bycol">Signature: <code>lambda-bycol</code></a><br /><a href="#semantics-analysis-lambda">Semantics: <code>analysis-lambda</code></a><br /><a href="#dialect-analysis-lambda">Dialect: <code>analysis-lambda</code></a><br /><a href="#implementation-analysis-lambda">Implementation: <code>analysis-lambda</code></a></details></td></tr>
<tr data-formula-name="MAKEARRAY" data-engine="full"><td><code>MAKEARRAY</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-lambda-makearray">Signature: <code>lambda-makearray</code></a><br /><a href="#semantics-analysis-lambda">Semantics: <code>analysis-lambda</code></a><br /><a href="#dialect-analysis-lambda">Dialect: <code>analysis-lambda</code></a><br /><a href="#implementation-analysis-lambda">Implementation: <code>analysis-lambda</code></a></details></td></tr>
</tbody></table>

</section>

<section class="sw-formula-family">

### Lookup and reference

Taxonomy/source: [Lookup and reference functions](https://support.microsoft.com/en-us/office/excel-functions-by-category-5f91f4e9-7b42-46d2-9bd1-63f26a86c0eb).

<table class="sw-formula-table"><thead><tr><th>Function (aliases)</th><th>Engine</th><th>Contract</th></tr></thead><tbody>
<tr data-formula-name="INDEX" data-engine="default"><td><code>INDEX</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>incumbent</summary><a href="#signature-index">Signature: <code>index</code></a><br /><a href="#semantics-lookup">Semantics: <code>lookup</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="MATCH" data-engine="default"><td><code>MATCH</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>incumbent</summary><a href="#signature-match">Signature: <code>match</code></a><br /><a href="#semantics-lookup">Semantics: <code>lookup</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="VLOOKUP" data-engine="default"><td><code>VLOOKUP</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>incumbent</summary><a href="#signature-table-lookup">Signature: <code>table-lookup</code></a><br /><a href="#semantics-lookup">Semantics: <code>lookup</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="HLOOKUP" data-engine="default"><td><code>HLOOKUP</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>incumbent</summary><a href="#signature-table-lookup">Signature: <code>table-lookup</code></a><br /><a href="#semantics-lookup">Semantics: <code>lookup</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="XLOOKUP" data-engine="default"><td><code>XLOOKUP</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>incumbent</summary><a href="#signature-xlookup">Signature: <code>xlookup</code></a><br /><a href="#semantics-lookup">Semantics: <code>lookup</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="XMATCH" data-engine="default"><td><code>XMATCH</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-xmatch">Signature: <code>xmatch</code></a><br /><a href="#semantics-lookup">Semantics: <code>lookup</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="CHOOSE" data-engine="default"><td><code>CHOOSE</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-choose">Signature: <code>choose</code></a><br /><a href="#semantics-lookup">Semantics: <code>lookup</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="ROW" data-engine="default"><td><code>ROW</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-optional-reference">Signature: <code>optional-reference</code></a><br /><a href="#semantics-lookup">Semantics: <code>lookup</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="ROWS" data-engine="default"><td><code>ROWS</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-unary-value">Signature: <code>unary-value</code></a><br /><a href="#semantics-lookup">Semantics: <code>lookup</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="COLUMN" data-engine="default"><td><code>COLUMN</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-optional-reference">Signature: <code>optional-reference</code></a><br /><a href="#semantics-lookup">Semantics: <code>lookup</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="COLUMNS" data-engine="default"><td><code>COLUMNS</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-unary-value">Signature: <code>unary-value</code></a><br /><a href="#semantics-lookup">Semantics: <code>lookup</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="ADDRESS" data-engine="default"><td><code>ADDRESS</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-address">Signature: <code>address</code></a><br /><a href="#semantics-lookup">Semantics: <code>lookup</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
</tbody></table>

</section>

<section class="sw-formula-family">

### Math and trigonometry

Taxonomy/source: [Math and trigonometry functions](https://support.microsoft.com/en-us/office/excel-functions-by-category-5f91f4e9-7b42-46d2-9bd1-63f26a86c0eb).

<table class="sw-formula-table"><thead><tr><th>Function (aliases)</th><th>Engine</th><th>Contract</th></tr></thead><tbody>
<tr data-formula-name="SUM" data-engine="default"><td><code>SUM</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>incumbent</summary><a href="#signature-optional-variadic-values">Signature: <code>optional-variadic-values</code></a><br /><a href="#semantics-aggregate">Semantics: <code>aggregate</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="ABS" data-engine="default"><td><code>ABS</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>incumbent</summary><a href="#signature-unary-number">Signature: <code>unary-number</code></a><br /><a href="#semantics-scalar">Semantics: <code>scalar</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="ROUND" data-engine="default"><td><code>ROUND</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>incumbent</summary><a href="#signature-round">Signature: <code>round</code></a><br /><a href="#semantics-scalar">Semantics: <code>scalar</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="SQRT" data-engine="default"><td><code>SQRT</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>incumbent</summary><a href="#signature-unary-number">Signature: <code>unary-number</code></a><br /><a href="#semantics-scalar">Semantics: <code>scalar</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="MOD" data-engine="default"><td><code>MOD</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>incumbent</summary><a href="#signature-binary-number">Signature: <code>binary-number</code></a><br /><a href="#semantics-scalar">Semantics: <code>scalar</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="POW" data-engine="default"><td><code>POW</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>incumbent</summary><a href="#signature-binary-number">Signature: <code>binary-number</code></a><br /><a href="#semantics-scalar">Semantics: <code>scalar</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-parser-assisted-evaluator-declared">Implementation: <code>parser-assisted-evaluator-declared</code></a></details></td></tr>
<tr data-formula-name="FLOOR" data-engine="default"><td><code>FLOOR</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>incumbent</summary><a href="#signature-binary-number">Signature: <code>binary-number</code></a><br /><a href="#semantics-scalar">Semantics: <code>scalar</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="CEILING" data-engine="default"><td><code>CEILING</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>incumbent</summary><a href="#signature-binary-number">Signature: <code>binary-number</code></a><br /><a href="#semantics-scalar">Semantics: <code>scalar</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="INT" data-engine="default"><td><code>INT</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>incumbent</summary><a href="#signature-unary-number">Signature: <code>unary-number</code></a><br /><a href="#semantics-scalar">Semantics: <code>scalar</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="TRUNC" data-engine="default"><td><code>TRUNC</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>incumbent</summary><a href="#signature-trunc">Signature: <code>trunc</code></a><br /><a href="#semantics-scalar">Semantics: <code>scalar</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="SIGN" data-engine="default"><td><code>SIGN</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>incumbent</summary><a href="#signature-unary-number">Signature: <code>unary-number</code></a><br /><a href="#semantics-scalar">Semantics: <code>scalar</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="PI" data-engine="default"><td><code>PI</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>incumbent</summary><a href="#signature-zero">Signature: <code>zero</code></a><br /><a href="#semantics-scalar">Semantics: <code>scalar</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="SUMIF" data-engine="default"><td><code>SUMIF</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>incumbent</summary><a href="#signature-sumif">Signature: <code>sumif</code></a><br /><a href="#semantics-criteria">Semantics: <code>criteria</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="SUMIFS" data-engine="default"><td><code>SUMIFS</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>incumbent</summary><a href="#signature-sumifs">Signature: <code>sumifs</code></a><br /><a href="#semantics-criteria">Semantics: <code>criteria</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="PRODUCT" data-engine="default"><td><code>PRODUCT</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-variadic-values">Signature: <code>variadic-values</code></a><br /><a href="#semantics-aggregate">Semantics: <code>aggregate</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="SUMPRODUCT" data-engine="default"><td><code>SUMPRODUCT</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-variadic-values">Signature: <code>variadic-values</code></a><br /><a href="#semantics-aggregate">Semantics: <code>aggregate</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="POWER" data-engine="default"><td><code>POWER</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-binary-number">Signature: <code>binary-number</code></a><br /><a href="#semantics-scalar">Semantics: <code>scalar</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="EXP" data-engine="default"><td><code>EXP</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-unary-number">Signature: <code>unary-number</code></a><br /><a href="#semantics-scalar">Semantics: <code>scalar</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="LN" data-engine="default"><td><code>LN</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-unary-number">Signature: <code>unary-number</code></a><br /><a href="#semantics-scalar">Semantics: <code>scalar</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="LOG" data-engine="default"><td><code>LOG</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-log">Signature: <code>log</code></a><br /><a href="#semantics-scalar">Semantics: <code>scalar</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="LOG10" data-engine="default"><td><code>LOG10</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-unary-number">Signature: <code>unary-number</code></a><br /><a href="#semantics-scalar">Semantics: <code>scalar</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="ROUNDUP" data-engine="default"><td><code>ROUNDUP</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-round">Signature: <code>round</code></a><br /><a href="#semantics-scalar">Semantics: <code>scalar</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="ROUNDDOWN" data-engine="default"><td><code>ROUNDDOWN</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-round">Signature: <code>round</code></a><br /><a href="#semantics-scalar">Semantics: <code>scalar</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="MROUND" data-engine="default"><td><code>MROUND</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-binary-number">Signature: <code>binary-number</code></a><br /><a href="#semantics-scalar">Semantics: <code>scalar</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="EVEN" data-engine="default"><td><code>EVEN</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-unary-number">Signature: <code>unary-number</code></a><br /><a href="#semantics-scalar">Semantics: <code>scalar</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="ODD" data-engine="default"><td><code>ODD</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-unary-number">Signature: <code>unary-number</code></a><br /><a href="#semantics-scalar">Semantics: <code>scalar</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="QUOTIENT" data-engine="default"><td><code>QUOTIENT</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-binary-number">Signature: <code>binary-number</code></a><br /><a href="#semantics-scalar">Semantics: <code>scalar</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="GCD" data-engine="default"><td><code>GCD</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-variadic-values">Signature: <code>variadic-values</code></a><br /><a href="#semantics-aggregate">Semantics: <code>aggregate</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="LCM" data-engine="default"><td><code>LCM</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-variadic-values">Signature: <code>variadic-values</code></a><br /><a href="#semantics-aggregate">Semantics: <code>aggregate</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="SUBTOTAL" data-engine="default"><td><code>SUBTOTAL</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-subtotal">Signature: <code>subtotal</code></a><br /><a href="#semantics-aggregate">Semantics: <code>aggregate</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="AGGREGATE" data-engine="full"><td><code>AGGREGATE</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-aggregate">Signature: <code>aggregate</code></a><br /><a href="#semantics-analysis-math">Semantics: <code>analysis-math</code></a><br /><a href="#dialect-analysis-math">Dialect: <code>analysis-math</code></a><br /><a href="#implementation-analysis-math">Implementation: <code>analysis-math</code></a></details></td></tr>
<tr data-formula-name="CEILING.MATH" data-engine="full"><td><code>CEILING.MATH</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-round-math">Signature: <code>round-math</code></a><br /><a href="#semantics-analysis-math">Semantics: <code>analysis-math</code></a><br /><a href="#dialect-analysis-math">Dialect: <code>analysis-math</code></a><br /><a href="#implementation-analysis-math">Implementation: <code>analysis-math</code></a></details></td></tr>
<tr data-formula-name="COMBIN" data-engine="full"><td><code>COMBIN</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-binary-number">Signature: <code>binary-number</code></a><br /><a href="#semantics-analysis-math">Semantics: <code>analysis-math</code></a><br /><a href="#dialect-analysis-math">Dialect: <code>analysis-math</code></a><br /><a href="#implementation-analysis-math">Implementation: <code>analysis-math</code></a></details></td></tr>
<tr data-formula-name="COMBINA" data-engine="full"><td><code>COMBINA</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-binary-number">Signature: <code>binary-number</code></a><br /><a href="#semantics-analysis-math">Semantics: <code>analysis-math</code></a><br /><a href="#dialect-analysis-math">Dialect: <code>analysis-math</code></a><br /><a href="#implementation-analysis-math">Implementation: <code>analysis-math</code></a></details></td></tr>
<tr data-formula-name="FACT" data-engine="full"><td><code>FACT</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-unary-number">Signature: <code>unary-number</code></a><br /><a href="#semantics-analysis-math">Semantics: <code>analysis-math</code></a><br /><a href="#dialect-analysis-math">Dialect: <code>analysis-math</code></a><br /><a href="#implementation-analysis-math">Implementation: <code>analysis-math</code></a></details></td></tr>
<tr data-formula-name="FACTDOUBLE" data-engine="full"><td><code>FACTDOUBLE</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-unary-number">Signature: <code>unary-number</code></a><br /><a href="#semantics-analysis-math">Semantics: <code>analysis-math</code></a><br /><a href="#dialect-analysis-math">Dialect: <code>analysis-math</code></a><br /><a href="#implementation-analysis-math">Implementation: <code>analysis-math</code></a></details></td></tr>
<tr data-formula-name="FLOOR.MATH" data-engine="full"><td><code>FLOOR.MATH</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-round-math">Signature: <code>round-math</code></a><br /><a href="#semantics-analysis-math">Semantics: <code>analysis-math</code></a><br /><a href="#dialect-analysis-math">Dialect: <code>analysis-math</code></a><br /><a href="#implementation-analysis-math">Implementation: <code>analysis-math</code></a></details></td></tr>
<tr data-formula-name="MDETERM" data-engine="full"><td><code>MDETERM</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-array-unary">Signature: <code>array-unary</code></a><br /><a href="#semantics-analysis-math">Semantics: <code>analysis-math</code></a><br /><a href="#dialect-analysis-math">Dialect: <code>analysis-math</code></a><br /><a href="#implementation-analysis-math">Implementation: <code>analysis-math</code></a></details></td></tr>
<tr data-formula-name="MINVERSE" data-engine="full"><td><code>MINVERSE</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-matrix-unary">Signature: <code>matrix-unary</code></a><br /><a href="#semantics-analysis-math">Semantics: <code>analysis-math</code></a><br /><a href="#dialect-analysis-math">Dialect: <code>analysis-math</code></a><br /><a href="#implementation-analysis-math">Implementation: <code>analysis-math</code></a></details></td></tr>
<tr data-formula-name="MMULT" data-engine="full"><td><code>MMULT</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-matrix-pair">Signature: <code>matrix-pair</code></a><br /><a href="#semantics-analysis-math">Semantics: <code>analysis-math</code></a><br /><a href="#dialect-analysis-math">Dialect: <code>analysis-math</code></a><br /><a href="#implementation-analysis-math">Implementation: <code>analysis-math</code></a></details></td></tr>
<tr data-formula-name="MULTINOMIAL" data-engine="full"><td><code>MULTINOMIAL</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-variadic-values">Signature: <code>variadic-values</code></a><br /><a href="#semantics-analysis-math">Semantics: <code>analysis-math</code></a><br /><a href="#dialect-analysis-math">Dialect: <code>analysis-math</code></a><br /><a href="#implementation-analysis-math">Implementation: <code>analysis-math</code></a></details></td></tr>
<tr data-formula-name="MUNIT" data-engine="full"><td><code>MUNIT</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-matrix-unit">Signature: <code>matrix-unit</code></a><br /><a href="#semantics-analysis-math">Semantics: <code>analysis-math</code></a><br /><a href="#dialect-analysis-math">Dialect: <code>analysis-math</code></a><br /><a href="#implementation-analysis-math">Implementation: <code>analysis-math</code></a></details></td></tr>
<tr data-formula-name="PERMUT" data-engine="full"><td><code>PERMUT</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-binary-number">Signature: <code>binary-number</code></a><br /><a href="#semantics-analysis-math">Semantics: <code>analysis-math</code></a><br /><a href="#dialect-analysis-math">Dialect: <code>analysis-math</code></a><br /><a href="#implementation-analysis-math">Implementation: <code>analysis-math</code></a></details></td></tr>
<tr data-formula-name="PERMUTATIONA" data-engine="full"><td><code>PERMUTATIONA</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-binary-number">Signature: <code>binary-number</code></a><br /><a href="#semantics-analysis-math">Semantics: <code>analysis-math</code></a><br /><a href="#dialect-analysis-math">Dialect: <code>analysis-math</code></a><br /><a href="#implementation-analysis-math">Implementation: <code>analysis-math</code></a></details></td></tr>
<tr data-formula-name="SERIESSUM" data-engine="full"><td><code>SERIESSUM</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-series-sum">Signature: <code>series-sum</code></a><br /><a href="#semantics-analysis-math">Semantics: <code>analysis-math</code></a><br /><a href="#dialect-analysis-math">Dialect: <code>analysis-math</code></a><br /><a href="#implementation-analysis-math">Implementation: <code>analysis-math</code></a></details></td></tr>
<tr data-formula-name="SQRTPI" data-engine="full"><td><code>SQRTPI</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-unary-number">Signature: <code>unary-number</code></a><br /><a href="#semantics-analysis-math">Semantics: <code>analysis-math</code></a><br /><a href="#dialect-analysis-math">Dialect: <code>analysis-math</code></a><br /><a href="#implementation-analysis-math">Implementation: <code>analysis-math</code></a></details></td></tr>
<tr data-formula-name="SUMSQ" data-engine="full"><td><code>SUMSQ</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-variadic-values">Signature: <code>variadic-values</code></a><br /><a href="#semantics-analysis-math">Semantics: <code>analysis-math</code></a><br /><a href="#dialect-analysis-math">Dialect: <code>analysis-math</code></a><br /><a href="#implementation-analysis-math">Implementation: <code>analysis-math</code></a></details></td></tr>
<tr data-formula-name="SUMX2MY2" data-engine="full"><td><code>SUMX2MY2</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-pair-arrays">Signature: <code>pair-arrays</code></a><br /><a href="#semantics-analysis-math">Semantics: <code>analysis-math</code></a><br /><a href="#dialect-analysis-math">Dialect: <code>analysis-math</code></a><br /><a href="#implementation-analysis-math">Implementation: <code>analysis-math</code></a></details></td></tr>
<tr data-formula-name="SUMX2PY2" data-engine="full"><td><code>SUMX2PY2</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-pair-arrays">Signature: <code>pair-arrays</code></a><br /><a href="#semantics-analysis-math">Semantics: <code>analysis-math</code></a><br /><a href="#dialect-analysis-math">Dialect: <code>analysis-math</code></a><br /><a href="#implementation-analysis-math">Implementation: <code>analysis-math</code></a></details></td></tr>
<tr data-formula-name="SUMXMY2" data-engine="full"><td><code>SUMXMY2</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-pair-arrays">Signature: <code>pair-arrays</code></a><br /><a href="#semantics-analysis-math">Semantics: <code>analysis-math</code></a><br /><a href="#dialect-analysis-math">Dialect: <code>analysis-math</code></a><br /><a href="#implementation-analysis-math">Implementation: <code>analysis-math</code></a></details></td></tr>
</tbody></table>

</section>

<section class="sw-formula-family">

### Statistical

Taxonomy/source: [Statistical functions](https://support.microsoft.com/en-us/office/excel-functions-by-category-5f91f4e9-7b42-46d2-9bd1-63f26a86c0eb).

<table class="sw-formula-table"><thead><tr><th>Function (aliases)</th><th>Engine</th><th>Contract</th></tr></thead><tbody>
<tr data-formula-name="AVERAGE AVG" data-engine="default"><td><code>AVERAGE</code><small><code>AVG</code></small></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>incumbent</summary><a href="#signature-optional-variadic-values">Signature: <code>optional-variadic-values</code></a><br /><a href="#semantics-aggregate">Semantics: <code>aggregate</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="MIN" data-engine="default"><td><code>MIN</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>incumbent</summary><a href="#signature-optional-variadic-values">Signature: <code>optional-variadic-values</code></a><br /><a href="#semantics-aggregate">Semantics: <code>aggregate</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="MAX" data-engine="default"><td><code>MAX</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>incumbent</summary><a href="#signature-optional-variadic-values">Signature: <code>optional-variadic-values</code></a><br /><a href="#semantics-aggregate">Semantics: <code>aggregate</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="COUNT" data-engine="default"><td><code>COUNT</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>incumbent</summary><a href="#signature-optional-variadic-values">Signature: <code>optional-variadic-values</code></a><br /><a href="#semantics-aggregate">Semantics: <code>aggregate</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="COUNTA" data-engine="default"><td><code>COUNTA</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>incumbent</summary><a href="#signature-optional-variadic-values">Signature: <code>optional-variadic-values</code></a><br /><a href="#semantics-aggregate">Semantics: <code>aggregate</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="COUNTIF" data-engine="default"><td><code>COUNTIF</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>incumbent</summary><a href="#signature-criteria-one">Signature: <code>criteria-one</code></a><br /><a href="#semantics-criteria">Semantics: <code>criteria</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="COUNTIFS" data-engine="default"><td><code>COUNTIFS</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>incumbent</summary><a href="#signature-criteria-many">Signature: <code>criteria-many</code></a><br /><a href="#semantics-criteria">Semantics: <code>criteria</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="AVERAGEIF" data-engine="default"><td><code>AVERAGEIF</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>incumbent</summary><a href="#signature-sumif">Signature: <code>sumif</code></a><br /><a href="#semantics-criteria">Semantics: <code>criteria</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="AVERAGEIFS" data-engine="default"><td><code>AVERAGEIFS</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>incumbent</summary><a href="#signature-sumifs">Signature: <code>sumifs</code></a><br /><a href="#semantics-criteria">Semantics: <code>criteria</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="MEDIAN" data-engine="default"><td><code>MEDIAN</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-variadic-values">Signature: <code>variadic-values</code></a><br /><a href="#semantics-aggregate">Semantics: <code>aggregate</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="MODE.SNGL" data-engine="default"><td><code>MODE.SNGL</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-variadic-values">Signature: <code>variadic-values</code></a><br /><a href="#semantics-aggregate">Semantics: <code>aggregate</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="LARGE" data-engine="default"><td><code>LARGE</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-value-k">Signature: <code>value-k</code></a><br /><a href="#semantics-aggregate">Semantics: <code>aggregate</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="SMALL" data-engine="default"><td><code>SMALL</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-value-k">Signature: <code>value-k</code></a><br /><a href="#semantics-aggregate">Semantics: <code>aggregate</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="RANK.EQ" data-engine="default"><td><code>RANK.EQ</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-rank">Signature: <code>rank</code></a><br /><a href="#semantics-aggregate">Semantics: <code>aggregate</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="PERCENTILE.INC" data-engine="default"><td><code>PERCENTILE.INC</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-percentile">Signature: <code>percentile</code></a><br /><a href="#semantics-aggregate">Semantics: <code>aggregate</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="QUARTILE.INC" data-engine="default"><td><code>QUARTILE.INC</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-percentile">Signature: <code>percentile</code></a><br /><a href="#semantics-aggregate">Semantics: <code>aggregate</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="STDEV.S" data-engine="default"><td><code>STDEV.S</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-variadic-values">Signature: <code>variadic-values</code></a><br /><a href="#semantics-aggregate">Semantics: <code>aggregate</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="STDEV.P" data-engine="default"><td><code>STDEV.P</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-variadic-values">Signature: <code>variadic-values</code></a><br /><a href="#semantics-aggregate">Semantics: <code>aggregate</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="VAR.S" data-engine="default"><td><code>VAR.S</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-variadic-values">Signature: <code>variadic-values</code></a><br /><a href="#semantics-aggregate">Semantics: <code>aggregate</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="VAR.P" data-engine="default"><td><code>VAR.P</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-variadic-values">Signature: <code>variadic-values</code></a><br /><a href="#semantics-aggregate">Semantics: <code>aggregate</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="GEOMEAN" data-engine="default"><td><code>GEOMEAN</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-variadic-values">Signature: <code>variadic-values</code></a><br /><a href="#semantics-aggregate">Semantics: <code>aggregate</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="CORREL" data-engine="default"><td><code>CORREL</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-pair-arrays">Signature: <code>pair-arrays</code></a><br /><a href="#semantics-aggregate">Semantics: <code>aggregate</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="COVARIANCE.S" data-engine="default"><td><code>COVARIANCE.S</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-pair-arrays">Signature: <code>pair-arrays</code></a><br /><a href="#semantics-aggregate">Semantics: <code>aggregate</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="COVARIANCE.P" data-engine="default"><td><code>COVARIANCE.P</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-pair-arrays">Signature: <code>pair-arrays</code></a><br /><a href="#semantics-aggregate">Semantics: <code>aggregate</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="COUNTBLANK" data-engine="default"><td><code>COUNTBLANK</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-unary-value">Signature: <code>unary-value</code></a><br /><a href="#semantics-aggregate">Semantics: <code>aggregate</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="MAXIFS" data-engine="default"><td><code>MAXIFS</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-sumifs">Signature: <code>sumifs</code></a><br /><a href="#semantics-criteria">Semantics: <code>criteria</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="MINIFS" data-engine="default"><td><code>MINIFS</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-sumifs">Signature: <code>sumifs</code></a><br /><a href="#semantics-criteria">Semantics: <code>criteria</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="NORM.DIST" data-engine="full"><td><code>NORM.DIST</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-norm-dist">Signature: <code>norm-dist</code></a><br /><a href="#semantics-analysis-distributions">Semantics: <code>analysis-distributions</code></a><br /><a href="#dialect-analysis-distributions">Dialect: <code>analysis-distributions</code></a><br /><a href="#implementation-analysis-distributions">Implementation: <code>analysis-distributions</code></a></details></td></tr>
<tr data-formula-name="NORM.INV" data-engine="full"><td><code>NORM.INV</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-norm-inv">Signature: <code>norm-inv</code></a><br /><a href="#semantics-analysis-distributions">Semantics: <code>analysis-distributions</code></a><br /><a href="#dialect-analysis-distributions">Dialect: <code>analysis-distributions</code></a><br /><a href="#implementation-analysis-distributions">Implementation: <code>analysis-distributions</code></a></details></td></tr>
<tr data-formula-name="NORM.S.DIST" data-engine="full"><td><code>NORM.S.DIST</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-norm-s-dist">Signature: <code>norm-s-dist</code></a><br /><a href="#semantics-analysis-distributions">Semantics: <code>analysis-distributions</code></a><br /><a href="#dialect-analysis-distributions">Dialect: <code>analysis-distributions</code></a><br /><a href="#implementation-analysis-distributions">Implementation: <code>analysis-distributions</code></a></details></td></tr>
<tr data-formula-name="NORM.S.INV" data-engine="full"><td><code>NORM.S.INV</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-unary-number">Signature: <code>unary-number</code></a><br /><a href="#semantics-analysis-distributions">Semantics: <code>analysis-distributions</code></a><br /><a href="#dialect-analysis-distributions">Dialect: <code>analysis-distributions</code></a><br /><a href="#implementation-analysis-distributions">Implementation: <code>analysis-distributions</code></a></details></td></tr>
<tr data-formula-name="T.DIST" data-engine="full"><td><code>T.DIST</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-t-dist">Signature: <code>t-dist</code></a><br /><a href="#semantics-analysis-distributions">Semantics: <code>analysis-distributions</code></a><br /><a href="#dialect-analysis-distributions">Dialect: <code>analysis-distributions</code></a><br /><a href="#implementation-analysis-distributions">Implementation: <code>analysis-distributions</code></a></details></td></tr>
<tr data-formula-name="T.DIST.2T" data-engine="full"><td><code>T.DIST.2T</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-distribution-tail">Signature: <code>distribution-tail</code></a><br /><a href="#semantics-analysis-distributions">Semantics: <code>analysis-distributions</code></a><br /><a href="#dialect-analysis-distributions">Dialect: <code>analysis-distributions</code></a><br /><a href="#implementation-analysis-distributions">Implementation: <code>analysis-distributions</code></a></details></td></tr>
<tr data-formula-name="T.DIST.RT" data-engine="full"><td><code>T.DIST.RT</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-distribution-tail">Signature: <code>distribution-tail</code></a><br /><a href="#semantics-analysis-distributions">Semantics: <code>analysis-distributions</code></a><br /><a href="#dialect-analysis-distributions">Dialect: <code>analysis-distributions</code></a><br /><a href="#implementation-analysis-distributions">Implementation: <code>analysis-distributions</code></a></details></td></tr>
<tr data-formula-name="T.INV" data-engine="full"><td><code>T.INV</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-distribution-inverse">Signature: <code>distribution-inverse</code></a><br /><a href="#semantics-analysis-distributions">Semantics: <code>analysis-distributions</code></a><br /><a href="#dialect-analysis-distributions">Dialect: <code>analysis-distributions</code></a><br /><a href="#implementation-analysis-distributions">Implementation: <code>analysis-distributions</code></a></details></td></tr>
<tr data-formula-name="T.INV.2T" data-engine="full"><td><code>T.INV.2T</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-distribution-inverse">Signature: <code>distribution-inverse</code></a><br /><a href="#semantics-analysis-distributions">Semantics: <code>analysis-distributions</code></a><br /><a href="#dialect-analysis-distributions">Dialect: <code>analysis-distributions</code></a><br /><a href="#implementation-analysis-distributions">Implementation: <code>analysis-distributions</code></a></details></td></tr>
<tr data-formula-name="CHISQ.DIST" data-engine="full"><td><code>CHISQ.DIST</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-t-dist">Signature: <code>t-dist</code></a><br /><a href="#semantics-analysis-distributions">Semantics: <code>analysis-distributions</code></a><br /><a href="#dialect-analysis-distributions">Dialect: <code>analysis-distributions</code></a><br /><a href="#implementation-analysis-distributions">Implementation: <code>analysis-distributions</code></a></details></td></tr>
<tr data-formula-name="CHISQ.DIST.RT" data-engine="full"><td><code>CHISQ.DIST.RT</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-distribution-tail">Signature: <code>distribution-tail</code></a><br /><a href="#semantics-analysis-distributions">Semantics: <code>analysis-distributions</code></a><br /><a href="#dialect-analysis-distributions">Dialect: <code>analysis-distributions</code></a><br /><a href="#implementation-analysis-distributions">Implementation: <code>analysis-distributions</code></a></details></td></tr>
<tr data-formula-name="CHISQ.INV" data-engine="full"><td><code>CHISQ.INV</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-distribution-inverse">Signature: <code>distribution-inverse</code></a><br /><a href="#semantics-analysis-distributions">Semantics: <code>analysis-distributions</code></a><br /><a href="#dialect-analysis-distributions">Dialect: <code>analysis-distributions</code></a><br /><a href="#implementation-analysis-distributions">Implementation: <code>analysis-distributions</code></a></details></td></tr>
<tr data-formula-name="CHISQ.INV.RT" data-engine="full"><td><code>CHISQ.INV.RT</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-distribution-inverse">Signature: <code>distribution-inverse</code></a><br /><a href="#semantics-analysis-distributions">Semantics: <code>analysis-distributions</code></a><br /><a href="#dialect-analysis-distributions">Dialect: <code>analysis-distributions</code></a><br /><a href="#implementation-analysis-distributions">Implementation: <code>analysis-distributions</code></a></details></td></tr>
<tr data-formula-name="F.DIST" data-engine="full"><td><code>F.DIST</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-f-dist">Signature: <code>f-dist</code></a><br /><a href="#semantics-analysis-distributions">Semantics: <code>analysis-distributions</code></a><br /><a href="#dialect-analysis-distributions">Dialect: <code>analysis-distributions</code></a><br /><a href="#implementation-analysis-distributions">Implementation: <code>analysis-distributions</code></a></details></td></tr>
<tr data-formula-name="F.DIST.RT" data-engine="full"><td><code>F.DIST.RT</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-f-tail">Signature: <code>f-tail</code></a><br /><a href="#semantics-analysis-distributions">Semantics: <code>analysis-distributions</code></a><br /><a href="#dialect-analysis-distributions">Dialect: <code>analysis-distributions</code></a><br /><a href="#implementation-analysis-distributions">Implementation: <code>analysis-distributions</code></a></details></td></tr>
<tr data-formula-name="F.INV" data-engine="full"><td><code>F.INV</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-f-inverse">Signature: <code>f-inverse</code></a><br /><a href="#semantics-analysis-distributions">Semantics: <code>analysis-distributions</code></a><br /><a href="#dialect-analysis-distributions">Dialect: <code>analysis-distributions</code></a><br /><a href="#implementation-analysis-distributions">Implementation: <code>analysis-distributions</code></a></details></td></tr>
<tr data-formula-name="F.INV.RT" data-engine="full"><td><code>F.INV.RT</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-f-inverse">Signature: <code>f-inverse</code></a><br /><a href="#semantics-analysis-distributions">Semantics: <code>analysis-distributions</code></a><br /><a href="#dialect-analysis-distributions">Dialect: <code>analysis-distributions</code></a><br /><a href="#implementation-analysis-distributions">Implementation: <code>analysis-distributions</code></a></details></td></tr>
<tr data-formula-name="BINOM.DIST" data-engine="full"><td><code>BINOM.DIST</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-binom-dist">Signature: <code>binom-dist</code></a><br /><a href="#semantics-analysis-distributions">Semantics: <code>analysis-distributions</code></a><br /><a href="#dialect-analysis-distributions">Dialect: <code>analysis-distributions</code></a><br /><a href="#implementation-analysis-distributions">Implementation: <code>analysis-distributions</code></a></details></td></tr>
<tr data-formula-name="POISSON.DIST" data-engine="full"><td><code>POISSON.DIST</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-poisson-dist">Signature: <code>poisson-dist</code></a><br /><a href="#semantics-analysis-distributions">Semantics: <code>analysis-distributions</code></a><br /><a href="#dialect-analysis-distributions">Dialect: <code>analysis-distributions</code></a><br /><a href="#implementation-analysis-distributions">Implementation: <code>analysis-distributions</code></a></details></td></tr>
<tr data-formula-name="EXPON.DIST" data-engine="full"><td><code>EXPON.DIST</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-expon-dist">Signature: <code>expon-dist</code></a><br /><a href="#semantics-analysis-distributions">Semantics: <code>analysis-distributions</code></a><br /><a href="#dialect-analysis-distributions">Dialect: <code>analysis-distributions</code></a><br /><a href="#implementation-analysis-distributions">Implementation: <code>analysis-distributions</code></a></details></td></tr>
<tr data-formula-name="GAMMA" data-engine="full"><td><code>GAMMA</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-unary-number">Signature: <code>unary-number</code></a><br /><a href="#semantics-analysis-distributions">Semantics: <code>analysis-distributions</code></a><br /><a href="#dialect-analysis-distributions">Dialect: <code>analysis-distributions</code></a><br /><a href="#implementation-analysis-distributions">Implementation: <code>analysis-distributions</code></a></details></td></tr>
<tr data-formula-name="GAMMALN" data-engine="full"><td><code>GAMMALN</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-unary-number">Signature: <code>unary-number</code></a><br /><a href="#semantics-analysis-distributions">Semantics: <code>analysis-distributions</code></a><br /><a href="#dialect-analysis-distributions">Dialect: <code>analysis-distributions</code></a><br /><a href="#implementation-analysis-distributions">Implementation: <code>analysis-distributions</code></a></details></td></tr>
<tr data-formula-name="GAMMA.DIST" data-engine="full"><td><code>GAMMA.DIST</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-gamma-dist">Signature: <code>gamma-dist</code></a><br /><a href="#semantics-analysis-distributions">Semantics: <code>analysis-distributions</code></a><br /><a href="#dialect-analysis-distributions">Dialect: <code>analysis-distributions</code></a><br /><a href="#implementation-analysis-distributions">Implementation: <code>analysis-distributions</code></a></details></td></tr>
<tr data-formula-name="GAMMA.INV" data-engine="full"><td><code>GAMMA.INV</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-gamma-inverse">Signature: <code>gamma-inverse</code></a><br /><a href="#semantics-analysis-distributions">Semantics: <code>analysis-distributions</code></a><br /><a href="#dialect-analysis-distributions">Dialect: <code>analysis-distributions</code></a><br /><a href="#implementation-analysis-distributions">Implementation: <code>analysis-distributions</code></a></details></td></tr>
<tr data-formula-name="BETA.DIST" data-engine="full"><td><code>BETA.DIST</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-beta-dist">Signature: <code>beta-dist</code></a><br /><a href="#semantics-analysis-distributions">Semantics: <code>analysis-distributions</code></a><br /><a href="#dialect-analysis-distributions">Dialect: <code>analysis-distributions</code></a><br /><a href="#implementation-analysis-distributions">Implementation: <code>analysis-distributions</code></a></details></td></tr>
<tr data-formula-name="BETA.INV" data-engine="full"><td><code>BETA.INV</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-beta-inverse">Signature: <code>beta-inverse</code></a><br /><a href="#semantics-analysis-distributions">Semantics: <code>analysis-distributions</code></a><br /><a href="#dialect-analysis-distributions">Dialect: <code>analysis-distributions</code></a><br /><a href="#implementation-analysis-distributions">Implementation: <code>analysis-distributions</code></a></details></td></tr>
<tr data-formula-name="LOGNORM.DIST" data-engine="full"><td><code>LOGNORM.DIST</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-lognorm-dist">Signature: <code>lognorm-dist</code></a><br /><a href="#semantics-analysis-distributions">Semantics: <code>analysis-distributions</code></a><br /><a href="#dialect-analysis-distributions">Dialect: <code>analysis-distributions</code></a><br /><a href="#implementation-analysis-distributions">Implementation: <code>analysis-distributions</code></a></details></td></tr>
<tr data-formula-name="LOGNORM.INV" data-engine="full"><td><code>LOGNORM.INV</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-lognorm-inverse">Signature: <code>lognorm-inverse</code></a><br /><a href="#semantics-analysis-distributions">Semantics: <code>analysis-distributions</code></a><br /><a href="#dialect-analysis-distributions">Dialect: <code>analysis-distributions</code></a><br /><a href="#implementation-analysis-distributions">Implementation: <code>analysis-distributions</code></a></details></td></tr>
<tr data-formula-name="WEIBULL.DIST" data-engine="full"><td><code>WEIBULL.DIST</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-weibull-dist">Signature: <code>weibull-dist</code></a><br /><a href="#semantics-analysis-distributions">Semantics: <code>analysis-distributions</code></a><br /><a href="#dialect-analysis-distributions">Dialect: <code>analysis-distributions</code></a><br /><a href="#implementation-analysis-distributions">Implementation: <code>analysis-distributions</code></a></details></td></tr>
<tr data-formula-name="CONFIDENCE.NORM" data-engine="full"><td><code>CONFIDENCE.NORM</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-confidence">Signature: <code>confidence</code></a><br /><a href="#semantics-analysis-distributions">Semantics: <code>analysis-distributions</code></a><br /><a href="#dialect-analysis-distributions">Dialect: <code>analysis-distributions</code></a><br /><a href="#implementation-analysis-distributions">Implementation: <code>analysis-distributions</code></a></details></td></tr>
<tr data-formula-name="CONFIDENCE.T" data-engine="full"><td><code>CONFIDENCE.T</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-confidence">Signature: <code>confidence</code></a><br /><a href="#semantics-analysis-distributions">Semantics: <code>analysis-distributions</code></a><br /><a href="#dialect-analysis-distributions">Dialect: <code>analysis-distributions</code></a><br /><a href="#implementation-analysis-distributions">Implementation: <code>analysis-distributions</code></a></details></td></tr>
<tr data-formula-name="STANDARDIZE" data-engine="full"><td><code>STANDARDIZE</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-standardize">Signature: <code>standardize</code></a><br /><a href="#semantics-analysis-distributions">Semantics: <code>analysis-distributions</code></a><br /><a href="#dialect-analysis-distributions">Dialect: <code>analysis-distributions</code></a><br /><a href="#implementation-analysis-distributions">Implementation: <code>analysis-distributions</code></a></details></td></tr>
<tr data-formula-name="FISHER" data-engine="full"><td><code>FISHER</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-unary-number">Signature: <code>unary-number</code></a><br /><a href="#semantics-analysis-distributions">Semantics: <code>analysis-distributions</code></a><br /><a href="#dialect-analysis-distributions">Dialect: <code>analysis-distributions</code></a><br /><a href="#implementation-analysis-distributions">Implementation: <code>analysis-distributions</code></a></details></td></tr>
<tr data-formula-name="FISHERINV" data-engine="full"><td><code>FISHERINV</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-unary-number">Signature: <code>unary-number</code></a><br /><a href="#semantics-analysis-distributions">Semantics: <code>analysis-distributions</code></a><br /><a href="#dialect-analysis-distributions">Dialect: <code>analysis-distributions</code></a><br /><a href="#implementation-analysis-distributions">Implementation: <code>analysis-distributions</code></a></details></td></tr>
<tr data-formula-name="PHI" data-engine="full"><td><code>PHI</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-unary-number">Signature: <code>unary-number</code></a><br /><a href="#semantics-analysis-distributions">Semantics: <code>analysis-distributions</code></a><br /><a href="#dialect-analysis-distributions">Dialect: <code>analysis-distributions</code></a><br /><a href="#implementation-analysis-distributions">Implementation: <code>analysis-distributions</code></a></details></td></tr>
<tr data-formula-name="GAUSS" data-engine="full"><td><code>GAUSS</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-unary-number">Signature: <code>unary-number</code></a><br /><a href="#semantics-analysis-distributions">Semantics: <code>analysis-distributions</code></a><br /><a href="#dialect-analysis-distributions">Dialect: <code>analysis-distributions</code></a><br /><a href="#implementation-analysis-distributions">Implementation: <code>analysis-distributions</code></a></details></td></tr>
<tr data-formula-name="AVEDEV" data-engine="full"><td><code>AVEDEV</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-variadic-values">Signature: <code>variadic-values</code></a><br /><a href="#semantics-analysis-descriptive">Semantics: <code>analysis-descriptive</code></a><br /><a href="#dialect-analysis-descriptive">Dialect: <code>analysis-descriptive</code></a><br /><a href="#implementation-analysis-descriptive">Implementation: <code>analysis-descriptive</code></a></details></td></tr>
<tr data-formula-name="DEVSQ" data-engine="full"><td><code>DEVSQ</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-variadic-values">Signature: <code>variadic-values</code></a><br /><a href="#semantics-analysis-descriptive">Semantics: <code>analysis-descriptive</code></a><br /><a href="#dialect-analysis-descriptive">Dialect: <code>analysis-descriptive</code></a><br /><a href="#implementation-analysis-descriptive">Implementation: <code>analysis-descriptive</code></a></details></td></tr>
<tr data-formula-name="HARMEAN" data-engine="full"><td><code>HARMEAN</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-variadic-values">Signature: <code>variadic-values</code></a><br /><a href="#semantics-analysis-descriptive">Semantics: <code>analysis-descriptive</code></a><br /><a href="#dialect-analysis-descriptive">Dialect: <code>analysis-descriptive</code></a><br /><a href="#implementation-analysis-descriptive">Implementation: <code>analysis-descriptive</code></a></details></td></tr>
<tr data-formula-name="KURT" data-engine="full"><td><code>KURT</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-variadic-values">Signature: <code>variadic-values</code></a><br /><a href="#semantics-analysis-descriptive">Semantics: <code>analysis-descriptive</code></a><br /><a href="#dialect-analysis-descriptive">Dialect: <code>analysis-descriptive</code></a><br /><a href="#implementation-analysis-descriptive">Implementation: <code>analysis-descriptive</code></a></details></td></tr>
<tr data-formula-name="SKEW" data-engine="full"><td><code>SKEW</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-variadic-values">Signature: <code>variadic-values</code></a><br /><a href="#semantics-analysis-descriptive">Semantics: <code>analysis-descriptive</code></a><br /><a href="#dialect-analysis-descriptive">Dialect: <code>analysis-descriptive</code></a><br /><a href="#implementation-analysis-descriptive">Implementation: <code>analysis-descriptive</code></a></details></td></tr>
<tr data-formula-name="SKEW.P" data-engine="full"><td><code>SKEW.P</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-variadic-values">Signature: <code>variadic-values</code></a><br /><a href="#semantics-analysis-descriptive">Semantics: <code>analysis-descriptive</code></a><br /><a href="#dialect-analysis-descriptive">Dialect: <code>analysis-descriptive</code></a><br /><a href="#implementation-analysis-descriptive">Implementation: <code>analysis-descriptive</code></a></details></td></tr>
<tr data-formula-name="TRIMMEAN" data-engine="full"><td><code>TRIMMEAN</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-trim-mean">Signature: <code>trim-mean</code></a><br /><a href="#semantics-analysis-descriptive">Semantics: <code>analysis-descriptive</code></a><br /><a href="#dialect-analysis-descriptive">Dialect: <code>analysis-descriptive</code></a><br /><a href="#implementation-analysis-descriptive">Implementation: <code>analysis-descriptive</code></a></details></td></tr>
<tr data-formula-name="PERCENTILE.EXC" data-engine="full"><td><code>PERCENTILE.EXC</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-percentile">Signature: <code>percentile</code></a><br /><a href="#semantics-analysis-descriptive">Semantics: <code>analysis-descriptive</code></a><br /><a href="#dialect-analysis-descriptive">Dialect: <code>analysis-descriptive</code></a><br /><a href="#implementation-analysis-descriptive">Implementation: <code>analysis-descriptive</code></a></details></td></tr>
<tr data-formula-name="QUARTILE.EXC" data-engine="full"><td><code>QUARTILE.EXC</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-percentile">Signature: <code>percentile</code></a><br /><a href="#semantics-analysis-descriptive">Semantics: <code>analysis-descriptive</code></a><br /><a href="#dialect-analysis-descriptive">Dialect: <code>analysis-descriptive</code></a><br /><a href="#implementation-analysis-descriptive">Implementation: <code>analysis-descriptive</code></a></details></td></tr>
<tr data-formula-name="PERCENTRANK.INC" data-engine="full"><td><code>PERCENTRANK.INC</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-percent-rank">Signature: <code>percent-rank</code></a><br /><a href="#semantics-analysis-descriptive">Semantics: <code>analysis-descriptive</code></a><br /><a href="#dialect-analysis-descriptive">Dialect: <code>analysis-descriptive</code></a><br /><a href="#implementation-analysis-descriptive">Implementation: <code>analysis-descriptive</code></a></details></td></tr>
<tr data-formula-name="PERCENTRANK.EXC" data-engine="full"><td><code>PERCENTRANK.EXC</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-percent-rank">Signature: <code>percent-rank</code></a><br /><a href="#semantics-analysis-descriptive">Semantics: <code>analysis-descriptive</code></a><br /><a href="#dialect-analysis-descriptive">Dialect: <code>analysis-descriptive</code></a><br /><a href="#implementation-analysis-descriptive">Implementation: <code>analysis-descriptive</code></a></details></td></tr>
<tr data-formula-name="RANK.AVG" data-engine="full"><td><code>RANK.AVG</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-rank">Signature: <code>rank</code></a><br /><a href="#semantics-analysis-descriptive">Semantics: <code>analysis-descriptive</code></a><br /><a href="#dialect-analysis-descriptive">Dialect: <code>analysis-descriptive</code></a><br /><a href="#implementation-analysis-descriptive">Implementation: <code>analysis-descriptive</code></a></details></td></tr>
<tr data-formula-name="PEARSON" data-engine="full"><td><code>PEARSON</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-pair-arrays">Signature: <code>pair-arrays</code></a><br /><a href="#semantics-analysis-descriptive">Semantics: <code>analysis-descriptive</code></a><br /><a href="#dialect-analysis-descriptive">Dialect: <code>analysis-descriptive</code></a><br /><a href="#implementation-analysis-descriptive">Implementation: <code>analysis-descriptive</code></a></details></td></tr>
<tr data-formula-name="RSQ" data-engine="full"><td><code>RSQ</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-known-y-x">Signature: <code>known-y-x</code></a><br /><a href="#semantics-analysis-descriptive">Semantics: <code>analysis-descriptive</code></a><br /><a href="#dialect-analysis-descriptive">Dialect: <code>analysis-descriptive</code></a><br /><a href="#implementation-analysis-descriptive">Implementation: <code>analysis-descriptive</code></a></details></td></tr>
<tr data-formula-name="SLOPE" data-engine="full"><td><code>SLOPE</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-known-y-x">Signature: <code>known-y-x</code></a><br /><a href="#semantics-analysis-descriptive">Semantics: <code>analysis-descriptive</code></a><br /><a href="#dialect-analysis-descriptive">Dialect: <code>analysis-descriptive</code></a><br /><a href="#implementation-analysis-descriptive">Implementation: <code>analysis-descriptive</code></a></details></td></tr>
<tr data-formula-name="INTERCEPT" data-engine="full"><td><code>INTERCEPT</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-known-y-x">Signature: <code>known-y-x</code></a><br /><a href="#semantics-analysis-descriptive">Semantics: <code>analysis-descriptive</code></a><br /><a href="#dialect-analysis-descriptive">Dialect: <code>analysis-descriptive</code></a><br /><a href="#implementation-analysis-descriptive">Implementation: <code>analysis-descriptive</code></a></details></td></tr>
<tr data-formula-name="STEYX" data-engine="full"><td><code>STEYX</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-known-y-x">Signature: <code>known-y-x</code></a><br /><a href="#semantics-analysis-descriptive">Semantics: <code>analysis-descriptive</code></a><br /><a href="#dialect-analysis-descriptive">Dialect: <code>analysis-descriptive</code></a><br /><a href="#implementation-analysis-descriptive">Implementation: <code>analysis-descriptive</code></a></details></td></tr>
<tr data-formula-name="FORECAST.LINEAR FORECAST" data-engine="full"><td><code>FORECAST.LINEAR</code><small><code>FORECAST</code></small></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-forecast">Signature: <code>forecast</code></a><br /><a href="#semantics-analysis-descriptive">Semantics: <code>analysis-descriptive</code></a><br /><a href="#dialect-analysis-descriptive">Dialect: <code>analysis-descriptive</code></a><br /><a href="#implementation-analysis-descriptive">Implementation: <code>analysis-descriptive</code></a></details></td></tr>
<tr data-formula-name="FREQUENCY" data-engine="full"><td><code>FREQUENCY</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-frequency">Signature: <code>frequency</code></a><br /><a href="#semantics-analysis-regression">Semantics: <code>analysis-regression</code></a><br /><a href="#dialect-analysis-regression">Dialect: <code>analysis-regression</code></a><br /><a href="#implementation-analysis-regression">Implementation: <code>analysis-regression</code></a></details></td></tr>
<tr data-formula-name="MODE.MULT" data-engine="full"><td><code>MODE.MULT</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-variadic-values-array">Signature: <code>variadic-values-array</code></a><br /><a href="#semantics-analysis-regression">Semantics: <code>analysis-regression</code></a><br /><a href="#dialect-analysis-regression">Dialect: <code>analysis-regression</code></a><br /><a href="#implementation-analysis-regression">Implementation: <code>analysis-regression</code></a></details></td></tr>
<tr data-formula-name="GROWTH" data-engine="full"><td><code>GROWTH</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-regression-predict">Signature: <code>regression-predict</code></a><br /><a href="#semantics-analysis-regression">Semantics: <code>analysis-regression</code></a><br /><a href="#dialect-analysis-regression">Dialect: <code>analysis-regression</code></a><br /><a href="#implementation-analysis-regression">Implementation: <code>analysis-regression</code></a></details></td></tr>
<tr data-formula-name="LINEST" data-engine="full"><td><code>LINEST</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-regression-fit">Signature: <code>regression-fit</code></a><br /><a href="#semantics-analysis-regression">Semantics: <code>analysis-regression</code></a><br /><a href="#dialect-analysis-regression">Dialect: <code>analysis-regression</code></a><br /><a href="#implementation-analysis-regression">Implementation: <code>analysis-regression</code></a></details></td></tr>
<tr data-formula-name="LOGEST" data-engine="full"><td><code>LOGEST</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-regression-fit">Signature: <code>regression-fit</code></a><br /><a href="#semantics-analysis-regression">Semantics: <code>analysis-regression</code></a><br /><a href="#dialect-analysis-regression">Dialect: <code>analysis-regression</code></a><br /><a href="#implementation-analysis-regression">Implementation: <code>analysis-regression</code></a></details></td></tr>
<tr data-formula-name="PERCENTILE" data-engine="full"><td><code>PERCENTILE</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-percentile">Signature: <code>percentile</code></a><br /><a href="#semantics-analysis-regression">Semantics: <code>analysis-regression</code></a><br /><a href="#dialect-analysis-regression">Dialect: <code>analysis-regression</code></a><br /><a href="#implementation-analysis-regression">Implementation: <code>analysis-regression</code></a></details></td></tr>
<tr data-formula-name="PERCENTRANK" data-engine="full"><td><code>PERCENTRANK</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-percent-rank">Signature: <code>percent-rank</code></a><br /><a href="#semantics-analysis-regression">Semantics: <code>analysis-regression</code></a><br /><a href="#dialect-analysis-regression">Dialect: <code>analysis-regression</code></a><br /><a href="#implementation-analysis-regression">Implementation: <code>analysis-regression</code></a></details></td></tr>
<tr data-formula-name="PROB" data-engine="full"><td><code>PROB</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-probability-range">Signature: <code>probability-range</code></a><br /><a href="#semantics-analysis-regression">Semantics: <code>analysis-regression</code></a><br /><a href="#dialect-analysis-regression">Dialect: <code>analysis-regression</code></a><br /><a href="#implementation-analysis-regression">Implementation: <code>analysis-regression</code></a></details></td></tr>
<tr data-formula-name="QUARTILE" data-engine="full"><td><code>QUARTILE</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-percentile">Signature: <code>percentile</code></a><br /><a href="#semantics-analysis-regression">Semantics: <code>analysis-regression</code></a><br /><a href="#dialect-analysis-regression">Dialect: <code>analysis-regression</code></a><br /><a href="#implementation-analysis-regression">Implementation: <code>analysis-regression</code></a></details></td></tr>
<tr data-formula-name="RANK" data-engine="full"><td><code>RANK</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-rank">Signature: <code>rank</code></a><br /><a href="#semantics-analysis-regression">Semantics: <code>analysis-regression</code></a><br /><a href="#dialect-analysis-regression">Dialect: <code>analysis-regression</code></a><br /><a href="#implementation-analysis-regression">Implementation: <code>analysis-regression</code></a></details></td></tr>
<tr data-formula-name="TREND" data-engine="full"><td><code>TREND</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-regression-predict">Signature: <code>regression-predict</code></a><br /><a href="#semantics-analysis-regression">Semantics: <code>analysis-regression</code></a><br /><a href="#dialect-analysis-regression">Dialect: <code>analysis-regression</code></a><br /><a href="#implementation-analysis-regression">Implementation: <code>analysis-regression</code></a></details></td></tr>
</tbody></table>

</section>

<section class="sw-formula-family">

### Text

Taxonomy/source: [Text functions](https://support.microsoft.com/en-us/office/excel-functions-by-category-5f91f4e9-7b42-46d2-9bd1-63f26a86c0eb).

<table class="sw-formula-table"><thead><tr><th>Function (aliases)</th><th>Engine</th><th>Contract</th></tr></thead><tbody>
<tr data-formula-name="ARRAYTOTEXT" data-engine="full"><td><code>ARRAYTOTEXT</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-array-to-text">Signature: <code>array-to-text</code></a><br /><a href="#semantics-text">Semantics: <code>text</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-text-analysis">Implementation: <code>text-analysis</code></a></details></td></tr>
<tr data-formula-name="DOLLAR" data-engine="full"><td><code>DOLLAR</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-text-dollar">Signature: <code>text-dollar</code></a><br /><a href="#semantics-text">Semantics: <code>text</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-text-analysis">Implementation: <code>text-analysis</code></a></details></td></tr>
<tr data-formula-name="FIXED" data-engine="full"><td><code>FIXED</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-text-fixed">Signature: <code>text-fixed</code></a><br /><a href="#semantics-text">Semantics: <code>text</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-text-analysis">Implementation: <code>text-analysis</code></a></details></td></tr>
<tr data-formula-name="REGEXEXTRACT" data-engine="full"><td><code>REGEXEXTRACT</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-regex-extract">Signature: <code>regex-extract</code></a><br /><a href="#semantics-text">Semantics: <code>text</code></a><br /><a href="#dialect-regex-lite-subset">Dialect: <code>regex-lite-subset</code></a><br /><a href="#implementation-text-analysis">Implementation: <code>text-analysis</code></a></details></td></tr>
<tr data-formula-name="REGEXREPLACE" data-engine="full"><td><code>REGEXREPLACE</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-regex-replace">Signature: <code>regex-replace</code></a><br /><a href="#semantics-text">Semantics: <code>text</code></a><br /><a href="#dialect-regex-lite-subset">Dialect: <code>regex-lite-subset</code></a><br /><a href="#implementation-text-analysis">Implementation: <code>text-analysis</code></a></details></td></tr>
<tr data-formula-name="REGEXTEST" data-engine="full"><td><code>REGEXTEST</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-regex-test">Signature: <code>regex-test</code></a><br /><a href="#semantics-text">Semantics: <code>text</code></a><br /><a href="#dialect-regex-lite-subset">Dialect: <code>regex-lite-subset</code></a><br /><a href="#implementation-text-analysis">Implementation: <code>text-analysis</code></a></details></td></tr>
<tr data-formula-name="TEXTAFTER" data-engine="full"><td><code>TEXTAFTER</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-text-delimiter">Signature: <code>text-delimiter</code></a><br /><a href="#semantics-text">Semantics: <code>text</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-text-analysis">Implementation: <code>text-analysis</code></a></details></td></tr>
<tr data-formula-name="TEXTBEFORE" data-engine="full"><td><code>TEXTBEFORE</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-text-delimiter">Signature: <code>text-delimiter</code></a><br /><a href="#semantics-text">Semantics: <code>text</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-text-analysis">Implementation: <code>text-analysis</code></a></details></td></tr>
<tr data-formula-name="TEXTSPLIT" data-engine="full"><td><code>TEXTSPLIT</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-text-split">Signature: <code>text-split</code></a><br /><a href="#semantics-text">Semantics: <code>text</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-text-analysis">Implementation: <code>text-analysis</code></a></details></td></tr>
<tr data-formula-name="VALUETOTEXT" data-engine="full"><td><code>VALUETOTEXT</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-value-to-text">Signature: <code>value-to-text</code></a><br /><a href="#semantics-text">Semantics: <code>text</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-text-analysis">Implementation: <code>text-analysis</code></a></details></td></tr>
<tr data-formula-name="LEN" data-engine="default"><td><code>LEN</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>incumbent</summary><a href="#signature-unary-value">Signature: <code>unary-value</code></a><br /><a href="#semantics-text">Semantics: <code>text</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="LEFT" data-engine="default"><td><code>LEFT</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>incumbent</summary><a href="#signature-left-right">Signature: <code>left-right</code></a><br /><a href="#semantics-text">Semantics: <code>text</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="RIGHT" data-engine="default"><td><code>RIGHT</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>incumbent</summary><a href="#signature-left-right">Signature: <code>left-right</code></a><br /><a href="#semantics-text">Semantics: <code>text</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="MID" data-engine="default"><td><code>MID</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>incumbent</summary><a href="#signature-mid">Signature: <code>mid</code></a><br /><a href="#semantics-text">Semantics: <code>text</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="CONCAT CONCATENATE" data-engine="default"><td><code>CONCAT</code><small><code>CONCATENATE</code></small></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>incumbent</summary><a href="#signature-variadic-values">Signature: <code>variadic-values</code></a><br /><a href="#semantics-text">Semantics: <code>text</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="UPPER" data-engine="default"><td><code>UPPER</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>incumbent</summary><a href="#signature-unary-value">Signature: <code>unary-value</code></a><br /><a href="#semantics-text">Semantics: <code>text</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="LOWER" data-engine="default"><td><code>LOWER</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>incumbent</summary><a href="#signature-unary-value">Signature: <code>unary-value</code></a><br /><a href="#semantics-text">Semantics: <code>text</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="TRIM" data-engine="default"><td><code>TRIM</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>incumbent</summary><a href="#signature-unary-value">Signature: <code>unary-value</code></a><br /><a href="#semantics-text">Semantics: <code>text</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="TEXT" data-engine="default"><td><code>TEXT</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>incumbent</summary><a href="#signature-text-format">Signature: <code>text-format</code></a><br /><a href="#semantics-text">Semantics: <code>text</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="EXACT" data-engine="default"><td><code>EXACT</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>incumbent</summary><a href="#signature-binary-number">Signature: <code>binary-number</code></a><br /><a href="#semantics-text-sensitive">Semantics: <code>text-sensitive</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="TEXTJOIN" data-engine="default"><td><code>TEXTJOIN</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-text-join">Signature: <code>text-join</code></a><br /><a href="#semantics-text">Semantics: <code>text</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="SUBSTITUTE" data-engine="default"><td><code>SUBSTITUTE</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-substitute">Signature: <code>substitute</code></a><br /><a href="#semantics-text-sensitive">Semantics: <code>text-sensitive</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="REPLACE" data-engine="default"><td><code>REPLACE</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-replace">Signature: <code>replace</code></a><br /><a href="#semantics-text-sensitive">Semantics: <code>text-sensitive</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="FIND" data-engine="default"><td><code>FIND</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-find-search">Signature: <code>find-search</code></a><br /><a href="#semantics-text-sensitive">Semantics: <code>text-sensitive</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="SEARCH" data-engine="default"><td><code>SEARCH</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-find-search">Signature: <code>find-search</code></a><br /><a href="#semantics-text-search">Semantics: <code>text-search</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="VALUE" data-engine="default"><td><code>VALUE</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-unary-value">Signature: <code>unary-value</code></a><br /><a href="#semantics-text">Semantics: <code>text</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="CLEAN" data-engine="default"><td><code>CLEAN</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-unary-value">Signature: <code>unary-value</code></a><br /><a href="#semantics-text">Semantics: <code>text</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="REPT" data-engine="default"><td><code>REPT</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-repeat-text">Signature: <code>repeat-text</code></a><br /><a href="#semantics-text">Semantics: <code>text</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="CHAR" data-engine="default"><td><code>CHAR</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-unary-number">Signature: <code>unary-number</code></a><br /><a href="#semantics-text">Semantics: <code>text</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="CODE" data-engine="default"><td><code>CODE</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-unary-value">Signature: <code>unary-value</code></a><br /><a href="#semantics-text">Semantics: <code>text</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="UNICHAR" data-engine="default"><td><code>UNICHAR</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-unary-number">Signature: <code>unary-number</code></a><br /><a href="#semantics-text">Semantics: <code>text</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="UNICODE" data-engine="default"><td><code>UNICODE</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-unary-value">Signature: <code>unary-value</code></a><br /><a href="#semantics-text">Semantics: <code>text</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="PROPER" data-engine="default"><td><code>PROPER</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-unary-value">Signature: <code>unary-value</code></a><br /><a href="#semantics-text">Semantics: <code>text</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="NUMBERVALUE" data-engine="default"><td><code>NUMBERVALUE</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-number-value">Signature: <code>number-value</code></a><br /><a href="#semantics-text">Semantics: <code>text</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
</tbody></table>

</section>

<section class="sw-formula-family">

### Formula operators

Taxonomy/source: [Types of operators](https://support.microsoft.com/en-us/office/calculation-operators-and-precedence-in-excel-48be406d-4975-4d31-b2b8-7af9e0e2878a).

<table class="sw-formula-table"><thead><tr><th>Function (aliases)</th><th>Engine</th><th>Contract</th></tr></thead><tbody>
</tbody></table>

</section>

<section class="sw-formula-family">

### Database

Taxonomy/source: [Database functions](https://support.microsoft.com/en-us/office/excel-functions-by-category-5f91f4e9-7b42-46d2-9bd1-63f26a86c0eb).

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

<details id="signature-text-delimiter"><summary>Signature: text-delimiter</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `text` | yes | none | `scalar`, `reference` | `once` |
| `delimiter` | yes | none | `scalar`, `reference` | `once` |
| `instanceNum` | no | 1 | `scalar`, `reference` | `once` |
| `matchMode` | no | 0 | `scalar`, `reference` | `once` |
| `matchEnd` | no | 0 | `scalar`, `reference` | `once` |
| `ifNotFound` | no | #N/A | `scalar`, `reference` | `once` |

</details>

<details id="signature-text-split"><summary>Signature: text-split</summary>

Return shape: `array`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `text` | yes | none | `scalar`, `reference` | `once` |
| `colDelimiter` | no | none | `scalar`, `range`, `array`, `reference` | `once` |
| `rowDelimiter` | no | none | `scalar`, `range`, `array`, `reference` | `once` |
| `ignoreEmpty` | no | false | `scalar`, `reference` | `once` |
| `matchMode` | no | 0 | `scalar`, `reference` | `once` |
| `padWith` | no | #N/A | `scalar`, `reference` | `once` |

</details>

<details id="signature-text-fixed"><summary>Signature: text-fixed</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `number` | yes | none | `scalar`, `reference` | `once` |
| `decimals` | no | 2 | `scalar`, `reference` | `once` |
| `noCommas` | no | false | `scalar`, `reference` | `once` |

</details>

<details id="signature-text-dollar"><summary>Signature: text-dollar</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `number` | yes | none | `scalar`, `reference` | `once` |
| `decimals` | no | 2 | `scalar`, `reference` | `once` |

</details>

<details id="signature-value-to-text"><summary>Signature: value-to-text</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `value` | yes | none | `scalar`, `reference` | `once` |
| `format` | no | 0 | `scalar`, `reference` | `once` |

</details>

<details id="signature-array-to-text"><summary>Signature: array-to-text</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `array` | yes | none | `scalar`, `range`, `array`, `reference` | `once` |
| `format` | no | 0 | `scalar`, `reference` | `once` |

</details>

<details id="signature-regex-test"><summary>Signature: regex-test</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `text` | yes | none | `scalar`, `reference` | `once` |
| `pattern` | yes | none | `scalar`, `reference` | `once` |
| `caseSensitivity` | no | 0 | `scalar`, `reference` | `once` |

</details>

<details id="signature-regex-extract"><summary>Signature: regex-extract</summary>

Return shape: `contextual`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `text` | yes | none | `scalar`, `reference` | `once` |
| `pattern` | yes | none | `scalar`, `reference` | `once` |
| `returnMode` | no | 0 | `scalar`, `reference` | `once` |
| `caseSensitivity` | no | 0 | `scalar`, `reference` | `once` |

</details>

<details id="signature-regex-replace"><summary>Signature: regex-replace</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `text` | yes | none | `scalar`, `reference` | `once` |
| `pattern` | yes | none | `scalar`, `reference` | `once` |
| `replacement` | yes | none | `scalar`, `reference` | `once` |
| `occurrence` | no | 0 | `scalar`, `reference` | `once` |
| `caseSensitivity` | no | 0 | `scalar`, `reference` | `once` |

</details>

<details id="signature-zero"><summary>Signature: zero</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| _none_ | — | — | — | — |

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

<details id="signature-binary-number"><summary>Signature: binary-number</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `number1` | yes | none | `scalar`, `reference` | `once` |
| `number2` | yes | none | `scalar`, `reference` | `once` |

</details>

<details id="signature-variadic-values"><summary>Signature: variadic-values</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `value` | yes | none | `scalar`, `range`, `array`, `reference` | `one-or-more` |

</details>

<details id="signature-variadic-values-array"><summary>Signature: variadic-values-array</summary>

Return shape: `array`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `value` | yes | none | `scalar`, `range`, `array`, `reference` | `one-or-more` |

</details>

<details id="signature-optional-variadic-values"><summary>Signature: optional-variadic-values</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `value` | no | none | `scalar`, `range`, `array`, `reference` | `zero-or-more` |

</details>

<details id="signature-logical-variadic"><summary>Signature: logical-variadic</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `logical` | yes | none | `scalar`, `range`, `array`, `reference` | `one-or-more` |

</details>

<details id="signature-if"><summary>Signature: if</summary>

Return shape: `contextual`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `logicalTest` | yes | none | `scalar`, `reference` | `once` |
| `valueIfTrue` | no | true | `scalar`, `range`, `array`, `reference` | `once` |
| `valueIfFalse` | no | false | `scalar`, `range`, `array`, `reference` | `once` |

</details>

<details id="signature-if-error"><summary>Signature: if-error</summary>

Return shape: `contextual`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `value` | yes | none | `scalar`, `range`, `array`, `reference` | `once` |
| `valueIfError` | yes | none | `scalar`, `range`, `array`, `reference` | `once` |

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

<details id="signature-let"><summary>Signature: let</summary>

Return shape: `contextual`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `nameAndValue` | yes | none | `scalar`, `range`, `array`, `name`, `reference` | `paired` |
| `calculation` | yes | none | `scalar`, `range`, `array`, `name`, `reference` | `once` |

</details>

<details id="signature-round"><summary>Signature: round</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `number` | yes | none | `scalar`, `reference` | `once` |
| `digits` | yes | none | `scalar`, `reference` | `once` |

</details>

<details id="signature-trunc"><summary>Signature: trunc</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `number` | yes | none | `scalar`, `reference` | `once` |
| `digits` | no | 0 | `scalar`, `reference` | `once` |

</details>

<details id="signature-log"><summary>Signature: log</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `number` | yes | none | `scalar`, `reference` | `once` |
| `base` | no | 10 | `scalar`, `reference` | `once` |

</details>

<details id="signature-subtotal"><summary>Signature: subtotal</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `functionNumber` | yes | none | `scalar`, `reference` | `once` |
| `reference` | yes | none | `range`, `array`, `reference` | `one-or-more` |

</details>

<details id="signature-left-right"><summary>Signature: left-right</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `text` | yes | none | `scalar`, `reference` | `once` |
| `count` | no | 1 | `scalar`, `reference` | `once` |

</details>

<details id="signature-mid"><summary>Signature: mid</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `text` | yes | none | `scalar`, `reference` | `once` |
| `start` | yes | none | `scalar`, `reference` | `once` |
| `count` | yes | none | `scalar`, `reference` | `once` |

</details>

<details id="signature-text-format"><summary>Signature: text-format</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `value` | yes | none | `scalar`, `reference` | `once` |
| `formatText` | yes | none | `scalar`, `reference` | `once` |

</details>

<details id="signature-text-join"><summary>Signature: text-join</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `delimiter` | yes | none | `scalar`, `reference` | `once` |
| `ignoreEmpty` | yes | none | `scalar`, `reference` | `once` |
| `text` | yes | none | `scalar`, `range`, `array`, `reference` | `one-or-more` |

</details>

<details id="signature-substitute"><summary>Signature: substitute</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `text` | yes | none | `scalar`, `reference` | `once` |
| `oldText` | yes | none | `scalar`, `reference` | `once` |
| `newText` | yes | none | `scalar`, `reference` | `once` |
| `instance` | no | all | `scalar`, `reference` | `once` |

</details>

<details id="signature-replace"><summary>Signature: replace</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `oldText` | yes | none | `scalar`, `reference` | `once` |
| `start` | yes | none | `scalar`, `reference` | `once` |
| `count` | yes | none | `scalar`, `reference` | `once` |
| `newText` | yes | none | `scalar`, `reference` | `once` |

</details>

<details id="signature-find-search"><summary>Signature: find-search</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `findText` | yes | none | `scalar`, `reference` | `once` |
| `withinText` | yes | none | `scalar`, `reference` | `once` |
| `start` | no | 1 | `scalar`, `reference` | `once` |

</details>

<details id="signature-repeat-text"><summary>Signature: repeat-text</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `text` | yes | none | `scalar`, `reference` | `once` |
| `count` | yes | none | `scalar`, `reference` | `once` |

</details>

<details id="signature-number-value"><summary>Signature: number-value</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `text` | yes | none | `scalar`, `reference` | `once` |
| `decimalSeparator` | no | . | `scalar`, `reference` | `once` |
| `groupSeparator` | no | , | `scalar`, `reference` | `once` |

</details>

<details id="signature-date-three"><summary>Signature: date-three</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `part1` | yes | none | `scalar`, `reference` | `once` |
| `part2` | yes | none | `scalar`, `reference` | `once` |
| `part3` | yes | none | `scalar`, `reference` | `once` |

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

<details id="signature-value-k"><summary>Signature: value-k</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `array` | yes | none | `range`, `array`, `reference` | `once` |
| `k` | yes | none | `scalar`, `reference` | `once` |

</details>

<details id="signature-rank"><summary>Signature: rank</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `number` | yes | none | `scalar`, `reference` | `once` |
| `reference` | yes | none | `range`, `array`, `reference` | `once` |
| `order` | no | 0 | `scalar`, `reference` | `once` |

</details>

<details id="signature-percentile"><summary>Signature: percentile</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `array` | yes | none | `range`, `array`, `reference` | `once` |
| `fraction` | yes | none | `scalar`, `reference` | `once` |

</details>

<details id="signature-pair-arrays"><summary>Signature: pair-arrays</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `array1` | yes | none | `range`, `array`, `reference` | `once` |
| `array2` | yes | none | `range`, `array`, `reference` | `once` |

</details>

<details id="signature-criteria-one"><summary>Signature: criteria-one</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `range` | yes | none | `range`, `array`, `reference` | `once` |
| `criteria` | yes | none | `scalar`, `reference` | `once` |

</details>

<details id="signature-criteria-many"><summary>Signature: criteria-many</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `rangeAndCriteria` | yes | none | `scalar`, `range`, `array`, `reference` | `paired` |

</details>

<details id="signature-sumif"><summary>Signature: sumif</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `range` | yes | none | `range`, `array`, `reference` | `once` |
| `criteria` | yes | none | `scalar`, `reference` | `once` |
| `sumRange` | no | range | `range`, `array`, `reference` | `once` |

</details>

<details id="signature-sumifs"><summary>Signature: sumifs</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `sumRange` | yes | none | `range`, `array`, `reference` | `once` |
| `rangeAndCriteria` | yes | none | `scalar`, `range`, `array`, `reference` | `paired` |

</details>

<details id="signature-match"><summary>Signature: match</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `lookupValue` | yes | none | `scalar`, `reference` | `once` |
| `lookupArray` | yes | none | `range`, `array`, `reference` | `once` |
| `matchMode` | no | 1 | `scalar`, `reference` | `once` |

</details>

<details id="signature-xmatch"><summary>Signature: xmatch</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `lookupValue` | yes | none | `scalar`, `reference` | `once` |
| `lookupArray` | yes | none | `range`, `array`, `reference` | `once` |
| `matchMode` | no | 0 | `scalar`, `reference` | `once` |
| `searchMode` | no | 1 | `scalar`, `reference` | `once` |

</details>

<details id="signature-index"><summary>Signature: index</summary>

Return shape: `contextual`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `array` | yes | none | `range`, `array`, `reference` | `once` |
| `row` | yes | none | `scalar`, `reference` | `once` |
| `column` | no | 1 | `scalar`, `reference` | `once` |

</details>

<details id="signature-xlookup"><summary>Signature: xlookup</summary>

Return shape: `contextual`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `lookupValue` | yes | none | `scalar`, `reference` | `once` |
| `lookupArray` | yes | none | `range`, `array`, `reference` | `once` |
| `returnArray` | yes | none | `range`, `array`, `reference` | `once` |
| `ifNotFound` | no | #N/A | `scalar`, `reference` | `once` |
| `matchMode` | no | 0 | `scalar`, `reference` | `once` |
| `searchMode` | no | 1 | `scalar`, `reference` | `once` |

</details>

<details id="signature-table-lookup"><summary>Signature: table-lookup</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `lookupValue` | yes | none | `scalar`, `reference` | `once` |
| `table` | yes | none | `range`, `array`, `reference` | `once` |
| `index` | yes | none | `scalar`, `reference` | `once` |
| `approximate` | no | true | `scalar`, `reference` | `once` |

</details>

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

<details id="signature-choose"><summary>Signature: choose</summary>

Return shape: `contextual`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `index` | yes | none | `scalar`, `reference` | `once` |
| `value` | yes | none | `scalar`, `range`, `array`, `reference` | `one-or-more` |

</details>

<details id="signature-optional-reference"><summary>Signature: optional-reference</summary>

Return shape: `contextual`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `reference` | no | formula-cell | `range`, `array`, `reference` | `once` |

</details>

<details id="signature-address"><summary>Signature: address</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `row` | yes | none | `scalar`, `reference` | `once` |
| `column` | yes | none | `scalar`, `reference` | `once` |
| `absNumber` | no | 1 | `scalar`, `reference` | `once` |
| `a1` | no | true | `scalar`, `reference` | `once` |
| `sheetText` | no | none | `scalar`, `reference` | `once` |

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

<details id="signature-sort-by"><summary>Signature: sort-by</summary>

Return shape: `array`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `array` | yes | none | `range`, `array`, `reference` | `once` |
| `byArrayAndOrder` | yes | none | `scalar`, `range`, `array`, `reference` | `paired` |

</details>

<details id="signature-choose-axis"><summary>Signature: choose-axis</summary>

Return shape: `array`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `array` | yes | none | `range`, `array`, `reference` | `once` |
| `index` | yes | none | `scalar`, `array`, `reference` | `one-or-more` |

</details>

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

<details id="signature-norm-dist"><summary>Signature: norm-dist</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `x` | yes | none | `scalar`, `reference` | `once` |
| `mean` | yes | none | `scalar`, `reference` | `once` |
| `standardDeviation` | yes | none | `scalar`, `reference` | `once` |
| `cumulative` | yes | none | `scalar`, `reference` | `once` |

</details>

<details id="signature-norm-inv"><summary>Signature: norm-inv</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `probability` | yes | none | `scalar`, `reference` | `once` |
| `mean` | yes | none | `scalar`, `reference` | `once` |
| `standardDeviation` | yes | none | `scalar`, `reference` | `once` |

</details>

<details id="signature-norm-s-dist"><summary>Signature: norm-s-dist</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `z` | yes | none | `scalar`, `reference` | `once` |
| `cumulative` | yes | none | `scalar`, `reference` | `once` |

</details>

<details id="signature-t-dist"><summary>Signature: t-dist</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `x` | yes | none | `scalar`, `reference` | `once` |
| `degreesFreedom` | yes | none | `scalar`, `reference` | `once` |
| `cumulative` | yes | none | `scalar`, `reference` | `once` |

</details>

<details id="signature-distribution-tail"><summary>Signature: distribution-tail</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `x` | yes | none | `scalar`, `reference` | `once` |
| `degreesFreedom` | yes | none | `scalar`, `reference` | `once` |

</details>

<details id="signature-distribution-inverse"><summary>Signature: distribution-inverse</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `probability` | yes | none | `scalar`, `reference` | `once` |
| `degreesFreedom` | yes | none | `scalar`, `reference` | `once` |

</details>

<details id="signature-f-dist"><summary>Signature: f-dist</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `x` | yes | none | `scalar`, `reference` | `once` |
| `degreesFreedom1` | yes | none | `scalar`, `reference` | `once` |
| `degreesFreedom2` | yes | none | `scalar`, `reference` | `once` |
| `cumulative` | yes | none | `scalar`, `reference` | `once` |

</details>

<details id="signature-f-tail"><summary>Signature: f-tail</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `x` | yes | none | `scalar`, `reference` | `once` |
| `degreesFreedom1` | yes | none | `scalar`, `reference` | `once` |
| `degreesFreedom2` | yes | none | `scalar`, `reference` | `once` |

</details>

<details id="signature-f-inverse"><summary>Signature: f-inverse</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `probability` | yes | none | `scalar`, `reference` | `once` |
| `degreesFreedom1` | yes | none | `scalar`, `reference` | `once` |
| `degreesFreedom2` | yes | none | `scalar`, `reference` | `once` |

</details>

<details id="signature-binom-dist"><summary>Signature: binom-dist</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `successes` | yes | none | `scalar`, `reference` | `once` |
| `trials` | yes | none | `scalar`, `reference` | `once` |
| `probability` | yes | none | `scalar`, `reference` | `once` |
| `cumulative` | yes | none | `scalar`, `reference` | `once` |

</details>

<details id="signature-poisson-dist"><summary>Signature: poisson-dist</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `x` | yes | none | `scalar`, `reference` | `once` |
| `mean` | yes | none | `scalar`, `reference` | `once` |
| `cumulative` | yes | none | `scalar`, `reference` | `once` |

</details>

<details id="signature-expon-dist"><summary>Signature: expon-dist</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `x` | yes | none | `scalar`, `reference` | `once` |
| `lambda` | yes | none | `scalar`, `reference` | `once` |
| `cumulative` | yes | none | `scalar`, `reference` | `once` |

</details>

<details id="signature-gamma-dist"><summary>Signature: gamma-dist</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `x` | yes | none | `scalar`, `reference` | `once` |
| `alpha` | yes | none | `scalar`, `reference` | `once` |
| `beta` | yes | none | `scalar`, `reference` | `once` |
| `cumulative` | yes | none | `scalar`, `reference` | `once` |

</details>

<details id="signature-gamma-inverse"><summary>Signature: gamma-inverse</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `probability` | yes | none | `scalar`, `reference` | `once` |
| `alpha` | yes | none | `scalar`, `reference` | `once` |
| `beta` | yes | none | `scalar`, `reference` | `once` |

</details>

<details id="signature-beta-dist"><summary>Signature: beta-dist</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `x` | yes | none | `scalar`, `reference` | `once` |
| `alpha` | yes | none | `scalar`, `reference` | `once` |
| `beta` | yes | none | `scalar`, `reference` | `once` |
| `cumulative` | yes | none | `scalar`, `reference` | `once` |
| `lower` | no | 0 | `scalar`, `reference` | `once` |
| `upper` | no | 1 | `scalar`, `reference` | `once` |

</details>

<details id="signature-beta-inverse"><summary>Signature: beta-inverse</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `probability` | yes | none | `scalar`, `reference` | `once` |
| `alpha` | yes | none | `scalar`, `reference` | `once` |
| `beta` | yes | none | `scalar`, `reference` | `once` |
| `lower` | no | 0 | `scalar`, `reference` | `once` |
| `upper` | no | 1 | `scalar`, `reference` | `once` |

</details>

<details id="signature-lognorm-dist"><summary>Signature: lognorm-dist</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `x` | yes | none | `scalar`, `reference` | `once` |
| `mean` | yes | none | `scalar`, `reference` | `once` |
| `standardDeviation` | yes | none | `scalar`, `reference` | `once` |
| `cumulative` | yes | none | `scalar`, `reference` | `once` |

</details>

<details id="signature-lognorm-inverse"><summary>Signature: lognorm-inverse</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `probability` | yes | none | `scalar`, `reference` | `once` |
| `mean` | yes | none | `scalar`, `reference` | `once` |
| `standardDeviation` | yes | none | `scalar`, `reference` | `once` |

</details>

<details id="signature-weibull-dist"><summary>Signature: weibull-dist</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `x` | yes | none | `scalar`, `reference` | `once` |
| `alpha` | yes | none | `scalar`, `reference` | `once` |
| `beta` | yes | none | `scalar`, `reference` | `once` |
| `cumulative` | yes | none | `scalar`, `reference` | `once` |

</details>

<details id="signature-confidence"><summary>Signature: confidence</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `alpha` | yes | none | `scalar`, `reference` | `once` |
| `standardDeviation` | yes | none | `scalar`, `reference` | `once` |
| `size` | yes | none | `scalar`, `reference` | `once` |

</details>

<details id="signature-standardize"><summary>Signature: standardize</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `x` | yes | none | `scalar`, `reference` | `once` |
| `mean` | yes | none | `scalar`, `reference` | `once` |
| `standardDeviation` | yes | none | `scalar`, `reference` | `once` |

</details>

<details id="signature-trim-mean"><summary>Signature: trim-mean</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `array` | yes | none | `range`, `array`, `reference` | `once` |
| `percent` | yes | none | `scalar`, `reference` | `once` |

</details>

<details id="signature-percent-rank"><summary>Signature: percent-rank</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `array` | yes | none | `range`, `array`, `reference` | `once` |
| `x` | yes | none | `scalar`, `reference` | `once` |
| `significance` | no | 3 | `scalar`, `reference` | `once` |

</details>

<details id="signature-known-y-x"><summary>Signature: known-y-x</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `knownYs` | yes | none | `range`, `array`, `reference` | `once` |
| `knownXs` | yes | none | `range`, `array`, `reference` | `once` |

</details>

<details id="signature-forecast"><summary>Signature: forecast</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `x` | yes | none | `scalar`, `reference` | `once` |
| `knownYs` | yes | none | `range`, `array`, `reference` | `once` |
| `knownXs` | yes | none | `range`, `array`, `reference` | `once` |

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

<details id="signature-xnpv"><summary>Signature: xnpv</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `rate` | yes | none | `scalar`, `reference` | `once` |
| `values` | yes | none | `scalar`, `range`, `array`, `reference` | `once` |
| `dates` | yes | none | `scalar`, `range`, `array`, `reference` | `once` |

</details>

<details id="signature-xirr"><summary>Signature: xirr</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `values` | yes | none | `scalar`, `range`, `array`, `reference` | `once` |
| `dates` | yes | none | `scalar`, `range`, `array`, `reference` | `once` |
| `guess` | no | 0.1 | `scalar`, `reference` | `once` |

</details>

<details id="signature-mirr"><summary>Signature: mirr</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `values` | yes | none | `scalar`, `range`, `array`, `reference` | `once` |
| `financeRate` | yes | none | `scalar`, `reference` | `once` |
| `reinvestRate` | yes | none | `scalar`, `reference` | `once` |

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

<details id="signature-rri"><summary>Signature: rri</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `nper` | yes | none | `scalar`, `reference` | `once` |
| `presentValue` | yes | none | `scalar`, `reference` | `once` |
| `futureValue` | yes | none | `scalar`, `reference` | `once` |

</details>

<details id="signature-pduration"><summary>Signature: pduration</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `rate` | yes | none | `scalar`, `reference` | `once` |
| `presentValue` | yes | none | `scalar`, `reference` | `once` |
| `futureValue` | yes | none | `scalar`, `reference` | `once` |

</details>

<details id="signature-fvschedule"><summary>Signature: fvschedule</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `principal` | yes | none | `scalar`, `reference` | `once` |
| `schedule` | yes | none | `scalar`, `range`, `array`, `reference` | `once` |

</details>

<details id="signature-regression-fit"><summary>Signature: regression-fit</summary>

Return shape: `array`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `knownY` | yes | none | `range`, `array`, `reference` | `once` |
| `knownX` | no | 1,2,3,... | `range`, `array`, `reference` | `once` |
| `const` | no | true | `scalar`, `reference` | `once` |
| `stats` | no | false | `scalar`, `reference` | `once` |

</details>

<details id="signature-regression-predict"><summary>Signature: regression-predict</summary>

Return shape: `array`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `knownY` | yes | none | `range`, `array`, `reference` | `once` |
| `knownX` | no | 1,2,3,... | `range`, `array`, `reference` | `once` |
| `newX` | no | knownX | `range`, `array`, `reference` | `once` |
| `const` | no | true | `scalar`, `reference` | `once` |

</details>

<details id="signature-frequency"><summary>Signature: frequency</summary>

Return shape: `array`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `data` | yes | none | `range`, `array`, `reference` | `once` |
| `bins` | yes | none | `range`, `array`, `reference` | `once` |

</details>

<details id="signature-probability-range"><summary>Signature: probability-range</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `xRange` | yes | none | `range`, `array`, `reference` | `once` |
| `probRange` | yes | none | `range`, `array`, `reference` | `once` |
| `lowerLimit` | no | 0 | `scalar`, `reference` | `once` |
| `upperLimit` | no | lowerLimit | `scalar`, `reference` | `once` |

</details>

<details id="signature-database"><summary>Signature: database</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `database` | yes | none | `range`, `reference` | `once` |
| `field` | yes | none | `scalar`, `reference` | `once` |
| `criteria` | yes | none | `range`, `reference` | `once` |

</details>

<details id="signature-round-math"><summary>Signature: round-math</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `number` | yes | none | `scalar`, `reference` | `once` |
| `significance` | no | 1 | `scalar`, `reference` | `once` |
| `mode` | no | 0 | `scalar`, `reference` | `once` |

</details>

<details id="signature-series-sum"><summary>Signature: series-sum</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `x` | yes | none | `scalar`, `reference` | `once` |
| `n` | yes | none | `scalar`, `reference` | `once` |
| `m` | yes | none | `scalar`, `reference` | `once` |
| `coefficients` | yes | none | `range`, `array`, `reference` | `once` |

</details>

<details id="signature-aggregate"><summary>Signature: aggregate</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `functionNumber` | yes | none | `scalar`, `reference` | `once` |
| `options` | yes | none | `scalar`, `reference` | `once` |
| `reference` | yes | none | `range`, `array`, `reference` | `one-or-more` |

</details>

<details id="signature-matrix-pair"><summary>Signature: matrix-pair</summary>

Return shape: `array`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `array1` | yes | none | `range`, `array`, `reference` | `once` |
| `array2` | yes | none | `range`, `array`, `reference` | `once` |

</details>

<details id="signature-matrix-unary"><summary>Signature: matrix-unary</summary>

Return shape: `array`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `array` | yes | none | `range`, `array`, `reference` | `once` |

</details>

<details id="signature-matrix-unit"><summary>Signature: matrix-unit</summary>

Return shape: `array`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `dimension` | yes | none | `scalar`, `reference` | `once` |

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

<details id="signature-lambda-isomitted"><summary>Signature: lambda-isomitted</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `value` | yes | none | `scalar`, `range`, `array`, `reference` | `once` |

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

These values are normative for the listed Sheetwrite subset. `function-defined` and `contextual` are explicit limitations: consult the formula guide's function-specific sections rather than assuming another spreadsheet's edge behavior.

<details id="semantics-scalar"><summary>Semantics: scalar</summary>

| Dimension | Contract |
| --- | --- |
| shape | scalar: accepted<br />range: contextual<br />array: contextual<br />broadcast: function-defined<br />result: scalar |
| coercion | blank: zero<br />text: number-if-parseable<br />boolean: number<br />error: propagate |
| text | case: not-applicable<br />wildcard: not-applicable |
| environment | locale: invariant<br />dateSystem: not-applicable |
| numeric | tolerance: binary64<br />domain: function-defined<br />iteration: kind: none<br />maximum: none |
| calculation | dependencies: tracked<br />lazy: eager<br />spill: scalar<br />fill: relative-reference-rewrite<br />copy: relative-reference-rewrite<br />structuralRewrite: ast-reference-rewrite |
| persistence | snapshot: formula-source<br />history: formula-source<br />collaboration: formula-source<br />xlsxSource: rewrite-on-structural-edit |

</details>

<details id="semantics-aggregate"><summary>Semantics: aggregate</summary>

| Dimension | Contract |
| --- | --- |
| shape | scalar: accepted<br />range: accepted<br />array: accepted<br />broadcast: none<br />result: scalar |
| coercion | blank: ignored<br />text: ignored-in-ranges<br />boolean: ignored-in-ranges<br />error: propagate |
| text | case: not-applicable<br />wildcard: not-applicable |
| environment | locale: invariant<br />dateSystem: not-applicable |
| numeric | tolerance: binary64<br />domain: function-defined<br />iteration: kind: none<br />maximum: none |
| calculation | dependencies: tracked<br />lazy: eager<br />spill: scalar<br />fill: relative-reference-rewrite<br />copy: relative-reference-rewrite<br />structuralRewrite: ast-reference-rewrite |
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

<details id="semantics-text"><summary>Semantics: text</summary>

| Dimension | Contract |
| --- | --- |
| shape | scalar: accepted<br />range: contextual<br />array: contextual<br />broadcast: function-defined<br />result: scalar |
| coercion | blank: empty-text<br />text: preserved<br />boolean: preserved<br />error: propagate |
| text | case: function-defined<br />wildcard: literal |
| environment | locale: function-defined<br />dateSystem: function-defined |
| numeric | tolerance: not-applicable<br />domain: function-defined<br />iteration: kind: none<br />maximum: none |
| calculation | dependencies: tracked<br />lazy: eager<br />spill: scalar<br />fill: relative-reference-rewrite<br />copy: relative-reference-rewrite<br />structuralRewrite: ast-reference-rewrite |
| persistence | snapshot: formula-source<br />history: formula-source<br />collaboration: formula-source<br />xlsxSource: rewrite-on-structural-edit |

</details>

<details id="semantics-text-sensitive"><summary>Semantics: text-sensitive</summary>

| Dimension | Contract |
| --- | --- |
| shape | scalar: accepted<br />range: contextual<br />array: contextual<br />broadcast: function-defined<br />result: scalar |
| coercion | blank: empty-text<br />text: preserved<br />boolean: preserved<br />error: propagate |
| text | case: sensitive<br />wildcard: literal |
| environment | locale: invariant<br />dateSystem: not-applicable |
| numeric | tolerance: not-applicable<br />domain: function-defined<br />iteration: kind: none<br />maximum: none |
| calculation | dependencies: tracked<br />lazy: eager<br />spill: scalar<br />fill: relative-reference-rewrite<br />copy: relative-reference-rewrite<br />structuralRewrite: ast-reference-rewrite |
| persistence | snapshot: formula-source<br />history: formula-source<br />collaboration: formula-source<br />xlsxSource: rewrite-on-structural-edit |

</details>

<details id="semantics-text-search"><summary>Semantics: text-search</summary>

| Dimension | Contract |
| --- | --- |
| shape | scalar: accepted<br />range: contextual<br />array: contextual<br />broadcast: function-defined<br />result: scalar |
| coercion | blank: empty-text<br />text: preserved<br />boolean: preserved<br />error: propagate |
| text | case: insensitive<br />wildcard: supported |
| environment | locale: invariant<br />dateSystem: not-applicable |
| numeric | tolerance: not-applicable<br />domain: function-defined<br />iteration: kind: none<br />maximum: none |
| calculation | dependencies: tracked<br />lazy: eager<br />spill: scalar<br />fill: relative-reference-rewrite<br />copy: relative-reference-rewrite<br />structuralRewrite: ast-reference-rewrite |
| persistence | snapshot: formula-source<br />history: formula-source<br />collaboration: formula-source<br />xlsxSource: rewrite-on-structural-edit |

</details>

<details id="semantics-criteria"><summary>Semantics: criteria</summary>

| Dimension | Contract |
| --- | --- |
| shape | scalar: accepted<br />range: accepted<br />array: accepted<br />broadcast: pairwise<br />result: scalar |
| coercion | blank: function-defined<br />text: function-defined<br />boolean: function-defined<br />error: propagate |
| text | case: insensitive<br />wildcard: supported |
| environment | locale: invariant<br />dateSystem: function-defined |
| numeric | tolerance: binary64<br />domain: function-defined<br />iteration: kind: none<br />maximum: none |
| calculation | dependencies: tracked<br />lazy: eager<br />spill: scalar<br />fill: relative-reference-rewrite<br />copy: relative-reference-rewrite<br />structuralRewrite: ast-reference-rewrite |
| persistence | snapshot: formula-source<br />history: formula-source<br />collaboration: formula-source<br />xlsxSource: rewrite-on-structural-edit |

</details>

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

<details id="semantics-lookup"><summary>Semantics: lookup</summary>

| Dimension | Contract |
| --- | --- |
| shape | scalar: accepted<br />range: accepted<br />array: accepted<br />broadcast: function-defined<br />result: contextual |
| coercion | blank: function-defined<br />text: function-defined<br />boolean: function-defined<br />error: propagate |
| text | case: insensitive<br />wildcard: function-defined |
| environment | locale: invariant<br />dateSystem: function-defined |
| numeric | tolerance: exact<br />domain: function-defined<br />iteration: kind: none<br />maximum: none |
| calculation | dependencies: tracked<br />lazy: eager<br />spill: contextual<br />fill: relative-reference-rewrite<br />copy: relative-reference-rewrite<br />structuralRewrite: ast-reference-rewrite |
| persistence | snapshot: formula-source<br />history: formula-source<br />collaboration: formula-source<br />xlsxSource: rewrite-on-structural-edit |

</details>

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

<details id="semantics-analysis-distributions"><summary>Semantics: analysis-distributions</summary>

| Dimension | Contract |
| --- | --- |
| shape | scalar: accepted<br />range: contextual<br />array: contextual<br />broadcast: none<br />result: scalar |
| coercion | blank: zero<br />text: number-if-parseable<br />boolean: number<br />error: propagate |
| text | case: not-applicable<br />wildcard: not-applicable |
| environment | locale: invariant<br />dateSystem: not-applicable |
| numeric | tolerance: binary64<br />domain: bounded<br />iteration: kind: function-defined<br />maximum: none |
| calculation | dependencies: tracked<br />lazy: eager<br />spill: scalar<br />fill: relative-reference-rewrite<br />copy: relative-reference-rewrite<br />structuralRewrite: ast-reference-rewrite |
| persistence | snapshot: formula-source<br />history: formula-source<br />collaboration: formula-source<br />xlsxSource: rewrite-on-structural-edit |

</details>

<details id="semantics-analysis-descriptive"><summary>Semantics: analysis-descriptive</summary>

| Dimension | Contract |
| --- | --- |
| shape | scalar: accepted<br />range: accepted<br />array: accepted<br />broadcast: none<br />result: scalar |
| coercion | blank: ignored<br />text: ignored-in-ranges<br />boolean: ignored-in-ranges<br />error: propagate |
| text | case: not-applicable<br />wildcard: not-applicable |
| environment | locale: invariant<br />dateSystem: not-applicable |
| numeric | tolerance: binary64<br />domain: function-defined<br />iteration: kind: none<br />maximum: none |
| calculation | dependencies: tracked<br />lazy: eager<br />spill: scalar<br />fill: relative-reference-rewrite<br />copy: relative-reference-rewrite<br />structuralRewrite: ast-reference-rewrite |
| persistence | snapshot: formula-source<br />history: formula-source<br />collaboration: formula-source<br />xlsxSource: rewrite-on-structural-edit |

</details>

<details id="semantics-analysis-regression"><summary>Semantics: analysis-regression</summary>

| Dimension | Contract |
| --- | --- |
| shape | scalar: accepted<br />range: accepted<br />array: accepted<br />broadcast: none<br />result: contextual |
| coercion | blank: function-defined<br />text: function-defined<br />boolean: function-defined<br />error: propagate |
| text | case: not-applicable<br />wildcard: not-applicable |
| environment | locale: invariant<br />dateSystem: not-applicable |
| numeric | tolerance: binary64<br />domain: function-defined<br />iteration: kind: none<br />maximum: none |
| calculation | dependencies: tracked<br />lazy: eager<br />spill: contextual<br />fill: relative-reference-rewrite<br />copy: relative-reference-rewrite<br />structuralRewrite: ast-reference-rewrite |
| persistence | snapshot: formula-source<br />history: formula-source<br />collaboration: formula-source<br />xlsxSource: rewrite-on-structural-edit |

</details>

<details id="semantics-analysis-math"><summary>Semantics: analysis-math</summary>

| Dimension | Contract |
| --- | --- |
| shape | scalar: accepted<br />range: accepted<br />array: accepted<br />broadcast: none<br />result: contextual |
| coercion | blank: function-defined<br />text: function-defined<br />boolean: function-defined<br />error: function-defined |
| text | case: not-applicable<br />wildcard: not-applicable |
| environment | locale: invariant<br />dateSystem: not-applicable |
| numeric | tolerance: binary64<br />domain: function-defined<br />iteration: kind: none<br />maximum: none |
| calculation | dependencies: tracked<br />lazy: eager<br />spill: contextual<br />fill: relative-reference-rewrite<br />copy: relative-reference-rewrite<br />structuralRewrite: ast-reference-rewrite |
| persistence | snapshot: formula-source<br />history: formula-source<br />collaboration: formula-source<br />xlsxSource: rewrite-on-structural-edit |

</details>

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

<details id="dialect-regex-lite-subset"><summary>Dialect: regex-lite-subset</summary>

| Dialect | Status |
| --- | --- |
| Microsoft Excel | divergent |
| Google Sheets | unverified |
| OpenFormula | unverified |

Limitations: REGEXTEST, REGEXEXTRACT, and REGEXREPLACE use the regex-lite syntax, not full PCRE2. Lookaround, backreferences, Unicode classes such as \p{L}, and other patterns the engine cannot compile return #VALUE!. \d, \s, and \w use ASCII character classes. \b uses ASCII word boundaries. As in Excel, caseSensitivity is 0 (case-sensitive, the default) or 1 (case-insensitive). Case-insensitive matching and the (?i) flag fold ASCII letters only. If caseSensitivity is 1 or the pattern enables an inline i flag, a pattern with a non-ASCII cased letter or a \x, \u, or \U escape returns #VALUE!. Regex programs are limited to 2 MiB. Text inputs and outputs are limited to 32,767 characters.

</details>

<details id="dialect-excel-documented"><summary>Dialect: excel-documented</summary>

| Dialect | Status |
| --- | --- |
| Microsoft Excel | documented |
| Google Sheets | unverified |
| OpenFormula | unverified |

Limitations: Google Sheets and OpenFormula results require producer evidence before compatibility is claimed.

</details>

<details id="dialect-analysis-distributions"><summary>Dialect: analysis-distributions</summary>

| Dialect | Status |
| --- | --- |
| Microsoft Excel | documented |
| Google Sheets | unverified |
| OpenFormula | unverified |

Limitations: Available only in the optional @sheetwrite/formulas analysis build; default @sheetwrite/wasm returns #NAME?. Scalar binary64 evaluation, not array broadcasting or blanket spreadsheet parity. Domain validation and finite numerical convergence may return #NUM!.

</details>

<details id="dialect-analysis-descriptive"><summary>Dialect: analysis-descriptive</summary>

| Dialect | Status |
| --- | --- |
| Microsoft Excel | documented |
| Google Sheets | unverified |
| OpenFormula | unverified |

Limitations: Available only in the optional @sheetwrite/formulas analysis build; default @sheetwrite/wasm returns #NAME?. Regression functions skip pairs where either value is not a number. PERCENTRANK results are truncated, not rounded, to the requested significant digits.

</details>

<details id="dialect-analysis-regression"><summary>Dialect: analysis-regression</summary>

| Dialect | Status |
| --- | --- |
| Microsoft Excel | documented |
| Google Sheets | unverified |
| OpenFormula | unverified |

Limitations: Available only in the optional @sheetwrite/formulas analysis build; default @sheetwrite/wasm returns #NAME?.

</details>

<details id="dialect-analysis-math"><summary>Dialect: analysis-math</summary>

| Dialect | Status |
| --- | --- |
| Microsoft Excel | documented |
| Google Sheets | unverified |
| OpenFormula | unverified |

Limitations: Available only in the optional @sheetwrite/formulas analysis build; default @sheetwrite/wasm returns #NAME?. Hidden rows are not part of the engine model. AGGREGATE row visibility options therefore have no effect. Matrix functions use engine resource limits.

</details>

<details id="dialect-analysis-database"><summary>Dialect: analysis-database</summary>

| Dialect | Status |
| --- | --- |
| Microsoft Excel | documented |
| Google Sheets | unverified |
| OpenFormula | unverified |

Limitations: Available only in the optional @sheetwrite/formulas analysis build; default @sheetwrite/wasm returns #NAME?. Database criteria use header names, AND across columns, and OR across rows. Custom formula predicates under headers that are not database fields are not supported.

</details>

<details id="dialect-analysis-lambda"><summary>Dialect: analysis-lambda</summary>

| Dialect | Status |
| --- | --- |
| Microsoft Excel | documented |
| Google Sheets | unverified |
| OpenFormula | unverified |

Limitations: Available only in @sheetwrite/formulas. Named ranges are supported, but workbook-defined named formulas are not available. LAMBDA uses lexical parameters and LET bindings. Calls are limited to depth 64 and 2000000 work units. Helpers reject nested arrays.

</details>

<details id="dialect-analysis-groupby"><summary>Dialect: analysis-groupby</summary>

| Dialect | Status |
| --- | --- |
| Microsoft Excel | documented |
| Google Sheets | unverified |
| OpenFormula | unverified |

Limitations: Available only in @sheetwrite/formulas. Aggregators must be a single eta-reduced built-in or a LAMBDA with one or two parameters. Vectors of functions are not supported. Grouping and output use the engine spill and work limits.

</details>

## Implementation profiles

<details id="implementation-text-analysis"><summary>Implementation: text-analysis</summary>

| Layer | Status and source/evidence |
| --- | --- |
| Parser | implemented<br />[`packages/wasm/src/eval/analysis/mod.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/eval/analysis/mod.rs) |
| Evaluator | implemented<br />[`packages/wasm/src/eval/analysis/text.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/eval/analysis/text.rs) |
| Formula assist | implemented<br />[`packages/wasm/src/eval/analysis/mod.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/eval/analysis/mod.rs) |
| Evidence | behavior-tested<br />[`packages/wasm/src/eval/analysis/text.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/eval/analysis/text.rs) |

</details>

<details id="implementation-implemented-assisted"><summary>Implementation: implemented-assisted</summary>

| Layer | Status and source/evidence |
| --- | --- |
| Parser | implemented<br />[`packages/wasm/src/calc.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/calc.rs) |
| Evaluator | implemented<br />[`packages/wasm/src/eval/mod.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/eval/mod.rs)<br />[`packages/wasm/src/eval/functions.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/eval/functions.rs) |
| Formula assist | implemented<br />[`packages/core/src/formula-assist.ts`](https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/formula-assist.ts) |
| Evidence | source-linked<br />[`packages/wasm/src/tests.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/tests.rs)<br />[`packages/core/test/formula-assist.test.ts`](https://github.com/chh-ay/sheetwrite/blob/main/packages/core/test/formula-assist.test.ts) |

</details>

<details id="implementation-parser-assisted-evaluator-declared"><summary>Implementation: parser-assisted-evaluator-declared</summary>

| Layer | Status and source/evidence |
| --- | --- |
| Parser | implemented<br />[`packages/wasm/src/calc.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/calc.rs) |
| Evaluator | declared |
| Formula assist | implemented<br />[`packages/core/src/formula-assist.ts`](https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/formula-assist.ts) |
| Evidence | source-linked<br />[`packages/core/src/formula-assist.ts`](https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/formula-assist.ts) |

</details>

<details id="implementation-parser-declared-target"><summary>Implementation: parser-declared-target</summary>

| Layer | Status and source/evidence |
| --- | --- |
| Parser | implemented<br />[`packages/wasm/src/calc.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/calc.rs) |
| Evaluator | declared |
| Formula assist | missing<br />[`packages/core/src/formula-assist.ts`](https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/formula-assist.ts) |
| Evidence | registration-tested<br />[`scripts/formula-contract.test.ts`](https://github.com/chh-ay/sheetwrite/blob/main/scripts/formula-contract.test.ts) |

</details>

<details id="implementation-analysis-distributions"><summary>Implementation: analysis-distributions</summary>

| Layer | Status and source/evidence |
| --- | --- |
| Parser | implemented<br />[`packages/wasm/src/calc.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/calc.rs) |
| Evaluator | implemented<br />[`packages/wasm/src/eval/analysis/distributions.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/eval/analysis/distributions.rs) |
| Formula assist | implemented<br />[`packages/core/src/formula-assist.ts`](https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/formula-assist.ts) |
| Evidence | source-linked<br />[`scripts/formula-contract.test.ts`](https://github.com/chh-ay/sheetwrite/blob/main/scripts/formula-contract.test.ts) |

</details>

<details id="implementation-analysis-descriptive"><summary>Implementation: analysis-descriptive</summary>

| Layer | Status and source/evidence |
| --- | --- |
| Parser | implemented<br />[`packages/wasm/src/calc.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/calc.rs) |
| Evaluator | implemented<br />[`packages/wasm/src/eval/analysis/descriptive.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/eval/analysis/descriptive.rs) |
| Formula assist | implemented<br />[`packages/core/src/formula-assist.ts`](https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/formula-assist.ts) |
| Evidence | source-linked<br />[`scripts/formula-contract.test.ts`](https://github.com/chh-ay/sheetwrite/blob/main/scripts/formula-contract.test.ts) |

</details>

<details id="implementation-analysis-dates"><summary>Implementation: analysis-dates</summary>

| Layer | Status and source/evidence |
| --- | --- |
| Parser | implemented<br />[`packages/wasm/src/calc.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/calc.rs) |
| Evaluator | implemented<br />[`packages/wasm/src/eval/analysis/dates.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/eval/analysis/dates.rs) |
| Formula assist | implemented<br />[`packages/core/src/formula-assist.ts`](https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/formula-assist.ts) |
| Evidence | source-linked<br />[`scripts/formula-contract.test.ts`](https://github.com/chh-ay/sheetwrite/blob/main/scripts/formula-contract.test.ts) |

</details>

<details id="implementation-analysis-finance"><summary>Implementation: analysis-finance</summary>

| Layer | Status and source/evidence |
| --- | --- |
| Parser | implemented<br />[`packages/wasm/src/calc.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/calc.rs) |
| Evaluator | implemented<br />[`packages/wasm/src/eval/analysis/finance.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/eval/analysis/finance.rs) |
| Formula assist | implemented<br />[`packages/core/src/formula-assist.ts`](https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/formula-assist.ts) |
| Evidence | source-linked<br />[`scripts/formula-contract.test.ts`](https://github.com/chh-ay/sheetwrite/blob/main/scripts/formula-contract.test.ts) |

</details>

<details id="implementation-analysis-regression"><summary>Implementation: analysis-regression</summary>

| Layer | Status and source/evidence |
| --- | --- |
| Parser | implemented<br />[`packages/wasm/src/calc.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/calc.rs) |
| Evaluator | implemented<br />[`packages/wasm/src/eval/analysis/regression.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/eval/analysis/regression.rs) |
| Formula assist | implemented<br />[`packages/core/src/formula-assist.ts`](https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/formula-assist.ts) |
| Evidence | source-linked<br />[`packages/wasm/src/eval/analysis/regression.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/eval/analysis/regression.rs)<br />[`scripts/formula-contract.test.ts`](https://github.com/chh-ay/sheetwrite/blob/main/scripts/formula-contract.test.ts) |

</details>

<details id="implementation-analysis-math"><summary>Implementation: analysis-math</summary>

| Layer | Status and source/evidence |
| --- | --- |
| Parser | implemented<br />[`packages/wasm/src/calc.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/calc.rs) |
| Evaluator | implemented<br />[`packages/wasm/src/eval/analysis/math.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/eval/analysis/math.rs)<br />[`packages/wasm/src/eval/analysis/aggregate.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/eval/analysis/aggregate.rs)<br />[`packages/wasm/src/eval/analysis/matrices.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/eval/analysis/matrices.rs) |
| Formula assist | implemented<br />[`packages/core/src/formula-assist.ts`](https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/formula-assist.ts) |
| Evidence | source-linked<br />[`scripts/formula-contract.test.ts`](https://github.com/chh-ay/sheetwrite/blob/main/scripts/formula-contract.test.ts) |

</details>

<details id="implementation-analysis-database"><summary>Implementation: analysis-database</summary>

| Layer | Status and source/evidence |
| --- | --- |
| Parser | implemented<br />[`packages/wasm/src/calc.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/calc.rs) |
| Evaluator | implemented<br />[`packages/wasm/src/eval/analysis/database.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/eval/analysis/database.rs) |
| Formula assist | implemented<br />[`packages/core/src/formula-assist.ts`](https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/formula-assist.ts) |
| Evidence | source-linked<br />[`scripts/formula-contract.test.ts`](https://github.com/chh-ay/sheetwrite/blob/main/scripts/formula-contract.test.ts) |

</details>

<details id="implementation-analysis-reshape"><summary>Implementation: analysis-reshape</summary>

| Layer | Status and source/evidence |
| --- | --- |
| Parser | implemented<br />[`packages/wasm/src/calc.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/calc.rs) |
| Evaluator | implemented<br />[`packages/wasm/src/eval/analysis/reshape.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/eval/analysis/reshape.rs) |
| Formula assist | implemented<br />[`packages/core/src/formula-assist.ts`](https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/formula-assist.ts) |
| Evidence | source-linked<br />[`packages/wasm/src/eval/analysis/reshape.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/eval/analysis/reshape.rs) |

</details>

<details id="implementation-analysis-lambda"><summary>Implementation: analysis-lambda</summary>

| Layer | Status and source/evidence |
| --- | --- |
| Parser | implemented<br />[`packages/wasm/src/calc.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/calc.rs) |
| Evaluator | implemented<br />[`packages/wasm/src/eval/analysis/lambda.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/eval/analysis/lambda.rs) |
| Formula assist | implemented<br />[`packages/core/src/formula-assist.ts`](https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/formula-assist.ts) |
| Evidence | source-linked<br />[`packages/wasm/src/eval/analysis/lambda.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/eval/analysis/lambda.rs) |

</details>

<details id="implementation-analysis-groupby"><summary>Implementation: analysis-groupby</summary>

| Layer | Status and source/evidence |
| --- | --- |
| Parser | implemented<br />[`packages/wasm/src/calc.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/calc.rs) |
| Evaluator | implemented<br />[`packages/wasm/src/eval/analysis/groupby.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/eval/analysis/groupby.rs) |
| Formula assist | implemented<br />[`packages/core/src/formula-assist.ts`](https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/formula-assist.ts) |
| Evidence | source-linked<br />[`packages/wasm/src/eval/analysis/groupby.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/eval/analysis/groupby.rs) |

</details>

## Unsupported categories

Unknown functions retain their source and evaluate to `#NAME?`; Sheetwrite does not silently execute a network, custom-code, or compatibility fallback.

| Category | Scope | Examples | Source | Evidence |
| --- | --- | --- | --- | --- |
| **Volatile recalculation** (`volatile`) | Automatic volatility semantics beyond the existing clock functions are outside the supported contract. | `INDIRECT`, `OFFSET`, `RAND`, `RANDBETWEEN`, `RANDARRAY` | [Math and trigonometry functions](https://support.microsoft.com/en-us/office/excel-functions-by-category-5f91f4e9-7b42-46d2-9bd1-63f26a86c0eb) | [`scripts/formula-contract.test.ts`](https://github.com/chh-ay/sheetwrite/blob/main/scripts/formula-contract.test.ts) |
| **Network functions** (`network`) | Formula evaluation never performs network requests. | `ENCODEURL`, `FILTERXML`, `IMAGE`, `WEBSERVICE` | [Web functions](https://support.microsoft.com/en-us/office/excel-functions-by-category-5f91f4e9-7b42-46d2-9bd1-63f26a86c0eb) | [`scripts/formula-contract.test.ts`](https://github.com/chh-ay/sheetwrite/blob/main/scripts/formula-contract.test.ts) |
| **External data functions** (`external`) | Functions that query external providers or live data connections are not evaluated. | `GOOGLEFINANCE`, `IMPORTDATA`, `IMPORTHTML`, `IMPORTXML`, `RTD` | [Add-in and Automation functions](https://support.microsoft.com/en-us/office/excel-functions-by-category-5f91f4e9-7b42-46d2-9bd1-63f26a86c0eb) | [`scripts/formula-contract.test.ts`](https://github.com/chh-ay/sheetwrite/blob/main/scripts/formula-contract.test.ts) |
| **Cube functions** (`cube`) | OLAP cube members, sets, and values are not resolved. | `CUBEMEMBER`, `CUBESET`, `CUBEVALUE` | [Cube functions](https://support.microsoft.com/en-us/office/excel-functions-by-category-5f91f4e9-7b42-46d2-9bd1-63f26a86c0eb) | [`scripts/formula-contract.test.ts`](https://github.com/chh-ay/sheetwrite/blob/main/scripts/formula-contract.test.ts) |
| **Arbitrary external workbook references** (`external-workbook`) | References to arbitrary workbook files are not loaded or dereferenced. | `'[Book.xlsx]Sheet1'!A1` | [Lookup and reference functions](https://support.microsoft.com/en-us/office/excel-functions-by-category-5f91f4e9-7b42-46d2-9bd1-63f26a86c0eb) | [`scripts/formula-contract.test.ts`](https://github.com/chh-ay/sheetwrite/blob/main/scripts/formula-contract.test.ts) |

Automatic volatile functions beyond the explicit host-clock barrier, network/external-data functions, arbitrary external workbook links, and cube/OLAP functions are unsupported. `TODAY` and `NOW` are the documented clock-function exception. Database functions and `LAMBDA` helpers require the full engine; `LET` is available in both engines.
