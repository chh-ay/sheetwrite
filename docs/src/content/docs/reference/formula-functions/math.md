---
title: "Math and trigonometry functions"
description: "Every math and trigonometry formula function, its engine build, and its signature, semantic, dialect, and implementation profiles."
---

This page lists the 52 functions of the math and trigonometry family. Taxonomy/source: [Math and trigonometry functions](https://support.microsoft.com/en-us/office/excel-functions-by-category-5f91f4e9-7b42-46d2-9bd1-63f26a86c0eb). The [formula function contract](/docs/reference/formula-functions/) has every family, the engine builds, and the evaluation limits.

## Functions

<FormulaReference>

<section class="sw-formula-family">

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
<tr data-formula-name="RAND" data-engine="default"><td><code>RAND</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>incumbent</summary><a href="#signature-zero">Signature: <code>zero</code></a><br /><a href="#semantics-volatile-random">Semantics: <code>volatile-random</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-random">Implementation: <code>implemented-random</code></a></details></td></tr>
<tr data-formula-name="RANDBETWEEN" data-engine="default"><td><code>RANDBETWEEN</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>incumbent</summary><a href="#signature-random-between">Signature: <code>random-between</code></a><br /><a href="#semantics-volatile-random">Semantics: <code>volatile-random</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-random">Implementation: <code>implemented-random</code></a></details></td></tr>
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
<tr data-formula-name="SUBTOTAL" data-engine="default"><td><code>SUBTOTAL</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-subtotal">Signature: <code>subtotal</code></a><br /><a href="#semantics-aggregate">Semantics: <code>aggregate</code></a><br /><a href="#dialect-excel-subtotal-visible">Dialect: <code>excel-subtotal-visible</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="AGGREGATE" data-engine="full"><td><code>AGGREGATE</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-aggregate">Signature: <code>aggregate</code></a><br /><a href="#semantics-analysis-math">Semantics: <code>analysis-math</code></a><br /><a href="#dialect-analysis-aggregate">Dialect: <code>analysis-aggregate</code></a><br /><a href="#implementation-analysis-math">Implementation: <code>analysis-math</code></a></details></td></tr>
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

</FormulaReference>

## Signature profiles

Argument order, required/default state, accepted shapes, repetition, and return shape come directly from the inventory.

<details id="signature-optional-variadic-values"><summary>Signature: optional-variadic-values</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `value` | no | none | `scalar`, `range`, `array`, `reference` | `zero-or-more` |

</details>

<details id="signature-unary-number"><summary>Signature: unary-number</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `number` | yes | none | `scalar`, `reference` | `once` |

</details>

<details id="signature-round"><summary>Signature: round</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `number` | yes | none | `scalar`, `reference` | `once` |
| `digits` | yes | none | `scalar`, `reference` | `once` |

</details>

<details id="signature-binary-number"><summary>Signature: binary-number</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `number1` | yes | none | `scalar`, `reference` | `once` |
| `number2` | yes | none | `scalar`, `reference` | `once` |

</details>

<details id="signature-trunc"><summary>Signature: trunc</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `number` | yes | none | `scalar`, `reference` | `once` |
| `digits` | no | 0 | `scalar`, `reference` | `once` |

</details>

<details id="signature-zero"><summary>Signature: zero</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| _none_ | — | — | — | — |

</details>

<details id="signature-random-between"><summary>Signature: random-between</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `bottom` | yes | none | `scalar`, `reference` | `once` |
| `top` | yes | none | `scalar`, `reference` | `once` |

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

<details id="signature-variadic-values"><summary>Signature: variadic-values</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `value` | yes | none | `scalar`, `range`, `array`, `reference` | `one-or-more` |

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

<details id="signature-aggregate"><summary>Signature: aggregate</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `functionNumber` | yes | none | `scalar`, `reference` | `once` |
| `options` | yes | none | `scalar`, `reference` | `once` |
| `reference` | yes | none | `range`, `array`, `reference` | `one-or-more` |

</details>

<details id="signature-round-math"><summary>Signature: round-math</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `number` | yes | none | `scalar`, `reference` | `once` |
| `significance` | no | 1 | `scalar`, `reference` | `once` |
| `mode` | no | 0 | `scalar`, `reference` | `once` |

</details>

<details id="signature-array-unary"><summary>Signature: array-unary</summary>

Return shape: `array`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `array` | yes | none | `range`, `array`, `reference` | `once` |

</details>

<details id="signature-matrix-unary"><summary>Signature: matrix-unary</summary>

Return shape: `array`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `array` | yes | none | `range`, `array`, `reference` | `once` |

</details>

<details id="signature-matrix-pair"><summary>Signature: matrix-pair</summary>

Return shape: `array`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `array1` | yes | none | `range`, `array`, `reference` | `once` |
| `array2` | yes | none | `range`, `array`, `reference` | `once` |

</details>

<details id="signature-matrix-unit"><summary>Signature: matrix-unit</summary>

Return shape: `array`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `dimension` | yes | none | `scalar`, `reference` | `once` |

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

<details id="signature-pair-arrays"><summary>Signature: pair-arrays</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `array1` | yes | none | `range`, `array`, `reference` | `once` |
| `array2` | yes | none | `range`, `array`, `reference` | `once` |

</details>

## Semantic profiles

These values are normative for the listed Sheetwrite subset. `function-defined` and `contextual` are explicit limitations: consult the formula guides' function-specific sections rather than assuming another spreadsheet's edge behavior.

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

<details id="semantics-volatile-random"><summary>Semantics: volatile-random</summary>

| Dimension | Contract |
| --- | --- |
| shape | scalar: accepted<br />range: rejected<br />array: rejected<br />broadcast: none<br />result: scalar |
| coercion | blank: zero<br />text: number-if-parseable<br />boolean: number<br />error: propagate |
| text | case: not-applicable<br />wildcard: not-applicable |
| environment | locale: invariant<br />dateSystem: not-applicable |
| numeric | tolerance: function-defined<br />domain: bounded<br />iteration: kind: none<br />maximum: none |
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

## Dialect profiles

<details id="dialect-excel-documented"><summary>Dialect: excel-documented</summary>

| Dialect | Status |
| --- | --- |
| Microsoft Excel | documented |
| Google Sheets | unverified |
| OpenFormula | unverified |

Limitations: Google Sheets and OpenFormula results require producer evidence before compatibility is claimed.

</details>

<details id="dialect-excel-subtotal-visible"><summary>Dialect: excel-subtotal-visible</summary>

| Dialect | Status |
| --- | --- |
| Microsoft Excel | divergent |
| Google Sheets | unverified |
| OpenFormula | unverified |

Limitations: Only function codes 1 to 11 are accepted. Codes 101 to 111, which ignore hidden rows in Excel, return #VALUE! (#246).

</details>

<details id="dialect-analysis-aggregate"><summary>Dialect: analysis-aggregate</summary>

| Dialect | Status |
| --- | --- |
| Microsoft Excel | divergent |
| Google Sheets | unverified |
| OpenFormula | unverified |

Limitations: Available only in the optional @sheetwrite/formulas analysis build; default @sheetwrite/wasm returns #NAME?. Hidden rows are not part of the engine model. AGGREGATE row visibility options therefore have no effect.

</details>

<details id="dialect-analysis-math"><summary>Dialect: analysis-math</summary>

| Dialect | Status |
| --- | --- |
| Microsoft Excel | documented |
| Google Sheets | unverified |
| OpenFormula | unverified |

Limitations: Available only in the optional @sheetwrite/formulas analysis build; default @sheetwrite/wasm returns #NAME?. Matrix functions use engine resource limits.

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

<details id="implementation-parser-assisted-evaluator-declared"><summary>Implementation: parser-assisted-evaluator-declared</summary>

| Layer | Status and source/evidence |
| --- | --- |
| Parser | implemented<br />[`packages/wasm/src/calc.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/calc.rs) |
| Evaluator | declared |
| Formula assist | implemented<br />[`packages/core/src/formula-assist.ts`](https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/formula-assist.ts) |
| Evidence | source-linked<br />[`packages/core/src/formula-assist.ts`](https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/formula-assist.ts) |

</details>

<details id="implementation-implemented-random"><summary>Implementation: implemented-random</summary>

| Layer | Status and source/evidence |
| --- | --- |
| Parser | implemented<br />[`packages/wasm/src/calc.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/calc.rs) |
| Evaluator | implemented<br />[`packages/wasm/src/eval/random.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/eval/random.rs)<br />[`packages/wasm/src/eval/dependency.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/eval/dependency.rs) |
| Formula assist | implemented<br />[`packages/core/src/formula-assist.ts`](https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/formula-assist.ts) |
| Evidence | source-linked<br />[`packages/wasm/src/tests.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/tests.rs)<br />[`packages/core/test/formula-assist.test.ts`](https://github.com/chh-ay/sheetwrite/blob/main/packages/core/test/formula-assist.test.ts) |

</details>

<details id="implementation-analysis-math"><summary>Implementation: analysis-math</summary>

| Layer | Status and source/evidence |
| --- | --- |
| Parser | implemented<br />[`packages/wasm/src/calc.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/calc.rs) |
| Evaluator | implemented<br />[`packages/wasm/src/eval/analysis/math.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/eval/analysis/math.rs)<br />[`packages/wasm/src/eval/analysis/aggregate.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/eval/analysis/aggregate.rs)<br />[`packages/wasm/src/eval/analysis/matrices.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/eval/analysis/matrices.rs) |
| Formula assist | implemented<br />[`packages/core/src/formula-assist.ts`](https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/formula-assist.ts) |
| Evidence | source-linked<br />[`scripts/formula-contract.test.ts`](https://github.com/chh-ay/sheetwrite/blob/main/scripts/formula-contract.test.ts) |

</details>
