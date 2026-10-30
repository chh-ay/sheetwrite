---
title: "Statistical functions"
description: "Every statistical formula function, its engine build, and its signature, semantic, dialect, and implementation profiles."
---

This page lists the 92 functions of the statistical family. Taxonomy/source: [Statistical functions](https://support.microsoft.com/en-us/office/excel-functions-by-category-5f91f4e9-7b42-46d2-9bd1-63f26a86c0eb). The [formula function contract](/docs/reference/formula-functions/) has every family, the engine builds, and the evaluation limits.

## Functions

<FormulaReference>

<section class="sw-formula-family">

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

</FormulaReference>

## Signature profiles

Argument order, required/default state, accepted shapes, repetition, and return shape come directly from the inventory.

<details id="signature-optional-variadic-values"><summary>Signature: optional-variadic-values</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `value` | no | none | `scalar`, `range`, `array`, `reference` | `zero-or-more` |

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

<details id="signature-variadic-values"><summary>Signature: variadic-values</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `value` | yes | none | `scalar`, `range`, `array`, `reference` | `one-or-more` |

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

<details id="signature-unary-value"><summary>Signature: unary-value</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `value` | yes | none | `scalar`, `range`, `array`, `reference` | `once` |

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

<details id="signature-unary-number"><summary>Signature: unary-number</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `number` | yes | none | `scalar`, `reference` | `once` |

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

<details id="signature-frequency"><summary>Signature: frequency</summary>

Return shape: `array`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `data` | yes | none | `range`, `array`, `reference` | `once` |
| `bins` | yes | none | `range`, `array`, `reference` | `once` |

</details>

<details id="signature-variadic-values-array"><summary>Signature: variadic-values-array</summary>

Return shape: `array`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `value` | yes | none | `scalar`, `range`, `array`, `reference` | `one-or-more` |

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

<details id="signature-regression-fit"><summary>Signature: regression-fit</summary>

Return shape: `array`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `knownY` | yes | none | `range`, `array`, `reference` | `once` |
| `knownX` | no | 1,2,3,... | `range`, `array`, `reference` | `once` |
| `const` | no | true | `scalar`, `reference` | `once` |
| `stats` | no | false | `scalar`, `reference` | `once` |

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

## Dialect profiles

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

## Implementation profiles

<details id="implementation-implemented-assisted"><summary>Implementation: implemented-assisted</summary>

| Layer | Status and source/evidence |
| --- | --- |
| Parser | implemented<br />[`packages/wasm/src/calc.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/calc.rs) |
| Evaluator | implemented<br />[`packages/wasm/src/eval/mod.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/eval/mod.rs)<br />[`packages/wasm/src/eval/functions.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/eval/functions.rs) |
| Formula assist | implemented<br />[`packages/core/src/formula-assist.ts`](https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/formula-assist.ts) |
| Evidence | source-linked<br />[`packages/wasm/src/tests.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/tests.rs)<br />[`packages/core/test/formula-assist.test.ts`](https://github.com/chh-ay/sheetwrite/blob/main/packages/core/test/formula-assist.test.ts) |

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

<details id="implementation-analysis-regression"><summary>Implementation: analysis-regression</summary>

| Layer | Status and source/evidence |
| --- | --- |
| Parser | implemented<br />[`packages/wasm/src/calc.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/calc.rs) |
| Evaluator | implemented<br />[`packages/wasm/src/eval/analysis/regression.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/eval/analysis/regression.rs) |
| Formula assist | implemented<br />[`packages/core/src/formula-assist.ts`](https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/formula-assist.ts) |
| Evidence | source-linked<br />[`packages/wasm/src/eval/analysis/regression.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/eval/analysis/regression.rs)<br />[`scripts/formula-contract.test.ts`](https://github.com/chh-ay/sheetwrite/blob/main/scripts/formula-contract.test.ts) |

</details>
