---
title: "Text functions"
description: "Every text formula function, its engine build, and its signature, semantic, dialect, and implementation profiles."
---

This page lists the 34 functions of the text family. Taxonomy/source: [Text functions](https://support.microsoft.com/en-us/office/excel-functions-by-category-5f91f4e9-7b42-46d2-9bd1-63f26a86c0eb). The [formula function contract](/docs/reference/formula-functions/) has every family, the engine builds, and the evaluation limits.

## Functions

<FormulaReference>

<section class="sw-formula-family">

<table class="sw-formula-table"><thead><tr><th>Function (aliases)</th><th>Engine</th><th>Contract</th></tr></thead><tbody>
<tr data-formula-name="ARRAYTOTEXT" data-engine="full"><td><code>ARRAYTOTEXT</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-array-to-text">Signature: <code>array-to-text</code></a><br /><a href="#semantics-text">Semantics: <code>text</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-text-analysis">Implementation: <code>text-analysis</code></a></details></td></tr>
<tr data-formula-name="DOLLAR" data-engine="full"><td><code>DOLLAR</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-text-dollar">Signature: <code>text-dollar</code></a><br /><a href="#semantics-text">Semantics: <code>text</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-text-analysis">Implementation: <code>text-analysis</code></a></details></td></tr>
<tr data-formula-name="FIXED" data-engine="full"><td><code>FIXED</code></td><td><span class="sw-formula-build" data-build="full">Full only</span></td><td><details><summary>optional analysis</summary><a href="#signature-text-fixed">Signature: <code>text-fixed</code></a><br /><a href="#semantics-text">Semantics: <code>text</code></a><br /><a href="#dialect-excel-decimal-rounding">Dialect: <code>excel-decimal-rounding</code></a><br /><a href="#implementation-text-analysis">Implementation: <code>text-analysis</code></a></details></td></tr>
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
<tr data-formula-name="TRIM" data-engine="default"><td><code>TRIM</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>incumbent</summary><a href="#signature-unary-value">Signature: <code>unary-value</code></a><br /><a href="#semantics-text">Semantics: <code>text</code></a><br /><a href="#dialect-excel-trim-spaces">Dialect: <code>excel-trim-spaces</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="TEXT" data-engine="default"><td><code>TEXT</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>incumbent</summary><a href="#signature-text-format">Signature: <code>text-format</code></a><br /><a href="#semantics-text">Semantics: <code>text</code></a><br /><a href="#dialect-excel-text-format">Dialect: <code>excel-text-format</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="EXACT" data-engine="default"><td><code>EXACT</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>incumbent</summary><a href="#signature-binary-number">Signature: <code>binary-number</code></a><br /><a href="#semantics-text-sensitive">Semantics: <code>text-sensitive</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="TEXTJOIN" data-engine="default"><td><code>TEXTJOIN</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-text-join">Signature: <code>text-join</code></a><br /><a href="#semantics-text">Semantics: <code>text</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="SUBSTITUTE" data-engine="default"><td><code>SUBSTITUTE</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-substitute">Signature: <code>substitute</code></a><br /><a href="#semantics-text-sensitive">Semantics: <code>text-sensitive</code></a><br /><a href="#dialect-excel-documented">Dialect: <code>excel-documented</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
<tr data-formula-name="REPLACE" data-engine="default"><td><code>REPLACE</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>required target</summary><a href="#signature-replace">Signature: <code>replace</code></a><br /><a href="#semantics-text-sensitive">Semantics: <code>text-sensitive</code></a><br /><a href="#dialect-excel-replace-start">Dialect: <code>excel-replace-start</code></a><br /><a href="#implementation-implemented-assisted">Implementation: <code>implemented-assisted</code></a></details></td></tr>
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

</FormulaReference>

## Signature profiles

Argument order, required/default state, accepted shapes, repetition, and return shape come directly from the inventory.

<details id="signature-array-to-text"><summary>Signature: array-to-text</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `array` | yes | none | `scalar`, `range`, `array`, `reference` | `once` |
| `format` | no | 0 | `scalar`, `reference` | `once` |

</details>

<details id="signature-text-dollar"><summary>Signature: text-dollar</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `number` | yes | none | `scalar`, `reference` | `once` |
| `decimals` | no | 2 | `scalar`, `reference` | `once` |

</details>

<details id="signature-text-fixed"><summary>Signature: text-fixed</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `number` | yes | none | `scalar`, `reference` | `once` |
| `decimals` | no | 2 | `scalar`, `reference` | `once` |
| `noCommas` | no | false | `scalar`, `reference` | `once` |

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

<details id="signature-regex-test"><summary>Signature: regex-test</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `text` | yes | none | `scalar`, `reference` | `once` |
| `pattern` | yes | none | `scalar`, `reference` | `once` |
| `caseSensitivity` | no | 0 | `scalar`, `reference` | `once` |

</details>

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

<details id="signature-value-to-text"><summary>Signature: value-to-text</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `value` | yes | none | `scalar`, `reference` | `once` |
| `format` | no | 0 | `scalar`, `reference` | `once` |

</details>

<details id="signature-unary-value"><summary>Signature: unary-value</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `value` | yes | none | `scalar`, `range`, `array`, `reference` | `once` |

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

<details id="signature-variadic-values"><summary>Signature: variadic-values</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `value` | yes | none | `scalar`, `range`, `array`, `reference` | `one-or-more` |

</details>

<details id="signature-text-format"><summary>Signature: text-format</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `value` | yes | none | `scalar`, `reference` | `once` |
| `formatText` | yes | none | `scalar`, `reference` | `once` |

</details>

<details id="signature-binary-number"><summary>Signature: binary-number</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `number1` | yes | none | `scalar`, `reference` | `once` |
| `number2` | yes | none | `scalar`, `reference` | `once` |

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

<details id="signature-unary-number"><summary>Signature: unary-number</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `number` | yes | none | `scalar`, `reference` | `once` |

</details>

<details id="signature-number-value"><summary>Signature: number-value</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `text` | yes | none | `scalar`, `reference` | `once` |
| `decimalSeparator` | no | . | `scalar`, `reference` | `once` |
| `groupSeparator` | no | , | `scalar`, `reference` | `once` |

</details>

## Semantic profiles

These values are normative for the listed Sheetwrite subset. `function-defined` and `contextual` are explicit limitations: consult the formula guides' function-specific sections rather than assuming another spreadsheet's edge behavior.

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

## Dialect profiles

<details id="dialect-excel-documented"><summary>Dialect: excel-documented</summary>

| Dialect | Status |
| --- | --- |
| Microsoft Excel | documented |
| Google Sheets | unverified |
| OpenFormula | unverified |

Limitations: Google Sheets and OpenFormula results require producer evidence before compatibility is claimed.

</details>

<details id="dialect-excel-decimal-rounding"><summary>Dialect: excel-decimal-rounding</summary>

| Dialect | Status |
| --- | --- |
| Microsoft Excel | divergent |
| Google Sheets | unverified |
| OpenFormula | unverified |

Limitations: Decimal rounding exposes binary scaling error. =ROUND(1.005,2) returns 1; Excel returns 1.01 (#246).

</details>

<details id="dialect-regex-lite-subset"><summary>Dialect: regex-lite-subset</summary>

| Dialect | Status |
| --- | --- |
| Microsoft Excel | divergent |
| Google Sheets | unverified |
| OpenFormula | unverified |

Limitations: REGEXTEST, REGEXEXTRACT, and REGEXREPLACE use the regex-lite syntax, not full PCRE2. Lookaround, backreferences, Unicode classes such as \p{L}, and other patterns the engine cannot compile return #VALUE!. \d, \s, and \w use ASCII character classes. \b uses ASCII word boundaries. As in Excel, caseSensitivity is 0 (case-sensitive, the default) or 1 (case-insensitive). Case-insensitive matching and the (?i) flag fold ASCII letters only. If caseSensitivity is 1 or the pattern enables an inline i flag, a pattern with a non-ASCII cased letter or a \x, \u, or \U escape returns #VALUE!. Regex programs are limited to 2 MiB. Text inputs and outputs are limited to 32,767 characters.

</details>

<details id="dialect-excel-trim-spaces"><summary>Dialect: excel-trim-spaces</summary>

| Dialect | Status |
| --- | --- |
| Microsoft Excel | divergent |
| Google Sheets | unverified |
| OpenFormula | unverified |

Limitations: All Unicode whitespace is collapsed. Excel removes only ordinary spaces, so a line feed in =TRIM("a"&CHAR(10)&"b") stays a line feed in Excel (#246).

</details>

<details id="dialect-excel-text-format"><summary>Dialect: excel-text-format</summary>

| Dialect | Status |
| --- | --- |
| Microsoft Excel | divergent |
| Google Sheets | unverified |
| OpenFormula | unverified |

Limitations: Numeric format codes are reduced to a decimal count. =TEXT(0.5,"0%") returns 0, grouping in "#,##0.00" is omitted, and =TEXT(2.5,"0") rounds half to even (#246).

</details>

<details id="dialect-excel-replace-start"><summary>Dialect: excel-replace-start</summary>

| Dialect | Status |
| --- | --- |
| Microsoft Excel | divergent |
| Google Sheets | unverified |
| OpenFormula | unverified |

Limitations: A start position after the end of the text returns #VALUE!. Excel appends the new text, as in =REPLACE("abc",5,1,"X") (#246).

</details>

## Implementation profiles

<details id="implementation-text-analysis"><summary>Implementation: text-analysis</summary>

| Layer | Status and source/evidence |
| --- | --- |
| Parser | implemented<br />[`packages/wasm/src/eval/analysis/mod.rs`](https://github.com/chh-ay/sheetwrite/blob/develop/packages/wasm/src/eval/analysis/mod.rs) |
| Evaluator | implemented<br />[`packages/wasm/src/eval/analysis/text.rs`](https://github.com/chh-ay/sheetwrite/blob/develop/packages/wasm/src/eval/analysis/text.rs) |
| Formula assist | implemented<br />[`packages/wasm/src/eval/analysis/mod.rs`](https://github.com/chh-ay/sheetwrite/blob/develop/packages/wasm/src/eval/analysis/mod.rs) |
| Evidence | behavior-tested<br />[`packages/wasm/src/eval/analysis/text.rs`](https://github.com/chh-ay/sheetwrite/blob/develop/packages/wasm/src/eval/analysis/text.rs) |

</details>

<details id="implementation-implemented-assisted"><summary>Implementation: implemented-assisted</summary>

| Layer | Status and source/evidence |
| --- | --- |
| Parser | implemented<br />[`packages/wasm/src/calc.rs`](https://github.com/chh-ay/sheetwrite/blob/develop/packages/wasm/src/calc.rs) |
| Evaluator | implemented<br />[`packages/wasm/src/eval/mod.rs`](https://github.com/chh-ay/sheetwrite/blob/develop/packages/wasm/src/eval/mod.rs)<br />[`packages/wasm/src/eval/functions.rs`](https://github.com/chh-ay/sheetwrite/blob/develop/packages/wasm/src/eval/functions.rs) |
| Formula assist | implemented<br />[`packages/core/src/formula-assist.ts`](https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/formula-assist.ts) |
| Evidence | source-linked<br />[`packages/wasm/src/tests.rs`](https://github.com/chh-ay/sheetwrite/blob/develop/packages/wasm/src/tests.rs)<br />[`packages/core/test/formula-assist.test.ts`](https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/test/formula-assist.test.ts) |

</details>
