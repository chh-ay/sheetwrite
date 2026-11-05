---
title: "Lookup and reference functions"
description: "Every lookup and reference formula function, its engine build, and its signature, semantic, dialect, and implementation profiles."
---

This page lists the 17 functions of the lookup and reference family. Taxonomy/source: [Lookup and reference functions](https://support.microsoft.com/en-us/office/excel-functions-by-category-5f91f4e9-7b42-46d2-9bd1-63f26a86c0eb). The [formula function contract](/docs/reference/formula-functions/) has every family, the engine builds, and the evaluation limits.

## Functions

<FormulaReference>

<section class="sw-formula-family">

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
<tr data-formula-name="OFFSET" data-engine="default"><td><code>OFFSET</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>incumbent</summary><a href="#signature-offset">Signature: <code>offset</code></a><br /><a href="#semantics-dynamic-reference">Semantics: <code>dynamic-reference</code></a><br /><a href="#dialect-excel-dynamic-reference">Dialect: <code>excel-dynamic-reference</code></a><br /><a href="#implementation-implemented-dynamic-reference">Implementation: <code>implemented-dynamic-reference</code></a></details></td></tr>
<tr data-formula-name="INDIRECT" data-engine="default"><td><code>INDIRECT</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>incumbent</summary><a href="#signature-indirect">Signature: <code>indirect</code></a><br /><a href="#semantics-dynamic-reference">Semantics: <code>dynamic-reference</code></a><br /><a href="#dialect-excel-dynamic-reference">Dialect: <code>excel-dynamic-reference</code></a><br /><a href="#implementation-implemented-dynamic-reference">Implementation: <code>implemented-dynamic-reference</code></a></details></td></tr>
<tr data-formula-name="AREAS" data-engine="default"><td><code>AREAS</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>incumbent</summary><a href="#signature-required-reference">Signature: <code>required-reference</code></a><br /><a href="#semantics-information">Semantics: <code>information</code></a><br /><a href="#dialect-excel-reference-operators">Dialect: <code>excel-reference-operators</code></a><br /><a href="#implementation-implemented-reference-operators">Implementation: <code>implemented-reference-operators</code></a></details></td></tr>
<tr data-formula-name="FORMULATEXT" data-engine="default"><td><code>FORMULATEXT</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>incumbent</summary><a href="#signature-required-reference">Signature: <code>required-reference</code></a><br /><a href="#semantics-information">Semantics: <code>information</code></a><br /><a href="#dialect-excel-reference-information">Dialect: <code>excel-reference-information</code></a><br /><a href="#implementation-implemented-reference-information">Implementation: <code>implemented-reference-information</code></a></details></td></tr>
<tr data-formula-name="HYPERLINK" data-engine="default"><td><code>HYPERLINK</code></td><td><span class="sw-formula-build" data-build="default">Default + full</span></td><td><details><summary>incumbent</summary><a href="#signature-hyperlink">Signature: <code>hyperlink</code></a><br /><a href="#semantics-hyperlink-display">Semantics: <code>hyperlink-display</code></a><br /><a href="#dialect-excel-hyperlink-value">Dialect: <code>excel-hyperlink-value</code></a><br /><a href="#implementation-implemented-reference-information">Implementation: <code>implemented-reference-information</code></a></details></td></tr>
</tbody></table>

</section>

</FormulaReference>

## Signature profiles

Argument order, required/default state, accepted shapes, repetition, and return shape come directly from the inventory.

<details id="signature-index"><summary>Signature: index</summary>

Return shape: `contextual`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `array` | yes | none | `range`, `array`, `reference` | `once` |
| `row` | yes | none | `scalar`, `reference` | `once` |
| `column` | no | 1 | `scalar`, `reference` | `once` |

</details>

<details id="signature-match"><summary>Signature: match</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `lookupValue` | yes | none | `scalar`, `reference` | `once` |
| `lookupArray` | yes | none | `range`, `array`, `reference` | `once` |
| `matchMode` | no | 1 | `scalar`, `reference` | `once` |

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

<details id="signature-xmatch"><summary>Signature: xmatch</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `lookupValue` | yes | none | `scalar`, `reference` | `once` |
| `lookupArray` | yes | none | `range`, `array`, `reference` | `once` |
| `matchMode` | no | 0 | `scalar`, `reference` | `once` |
| `searchMode` | no | 1 | `scalar`, `reference` | `once` |

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

<details id="signature-unary-value"><summary>Signature: unary-value</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `value` | yes | none | `scalar`, `range`, `array`, `reference` | `once` |

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

<details id="signature-offset"><summary>Signature: offset</summary>

Return shape: `reference`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `reference` | yes | none | `range`, `reference` | `once` |
| `rows` | yes | none | `scalar`, `reference` | `once` |
| `cols` | yes | none | `scalar`, `reference` | `once` |
| `height` | no | reference-height | `scalar`, `reference` | `once` |
| `width` | no | reference-width | `scalar`, `reference` | `once` |

</details>

<details id="signature-indirect"><summary>Signature: indirect</summary>

Return shape: `reference`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `text` | yes | none | `scalar`, `reference` | `once` |
| `a1` | no | true | `scalar`, `reference` | `once` |

</details>

<details id="signature-required-reference"><summary>Signature: required-reference</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `reference` | yes | none | `range`, `reference` | `once` |

</details>

<details id="signature-hyperlink"><summary>Signature: hyperlink</summary>

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `linkLocation` | yes | none | `scalar`, `reference` | `once` |
| `friendlyName` | no | none | `scalar`, `reference` | `once` |

</details>

## Semantic profiles

These values are normative for the listed Sheetwrite subset. `function-defined` and `contextual` are explicit limitations: consult the formula guides' function-specific sections rather than assuming another spreadsheet's edge behavior.

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

<details id="semantics-dynamic-reference"><summary>Semantics: dynamic-reference</summary>

| Dimension | Contract |
| --- | --- |
| shape | scalar: contextual<br />range: contextual<br />array: rejected<br />broadcast: none<br />result: reference |
| coercion | blank: function-defined<br />text: function-defined<br />boolean: function-defined<br />error: propagate |
| text | case: insensitive<br />wildcard: literal |
| environment | locale: invariant<br />dateSystem: not-applicable |
| numeric | tolerance: exact<br />domain: bounded<br />iteration: kind: none<br />maximum: none |
| calculation | dependencies: dynamic<br />lazy: function-defined<br />spill: contextual<br />fill: relative-reference-rewrite<br />copy: relative-reference-rewrite<br />structuralRewrite: ast-reference-rewrite |
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

<details id="semantics-hyperlink-display"><summary>Semantics: hyperlink-display</summary>

| Dimension | Contract |
| --- | --- |
| shape | scalar: accepted<br />range: rejected<br />array: rejected<br />broadcast: none<br />result: scalar |
| coercion | blank: preserved<br />text: preserved<br />boolean: preserved<br />error: propagate |
| text | case: not-applicable<br />wildcard: not-applicable |
| environment | locale: invariant<br />dateSystem: not-applicable |
| numeric | tolerance: exact<br />domain: all-inputs<br />iteration: kind: none<br />maximum: none |
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

<details id="dialect-excel-dynamic-reference"><summary>Dialect: excel-dynamic-reference</summary>

| Dialect | Status |
| --- | --- |
| Microsoft Excel | divergent |
| Google Sheets | unverified |
| OpenFormula | unverified |

Limitations: OFFSET and INDIRECT are volatile and return references. Multi-cell results spill when used as formula results; reference-taking functions consume the reference. OFFSET requires a reference and positive height and width; omitted dimensions inherit the source shape. Row and column offsets truncate toward zero. Out-of-grid bounds return #REF!; nonpositive dimensions, nonnumeric offsets and a non-reference first argument return #VALUE!. INDIRECT supports A1 by default and R1C1 when a1 is FALSE, including relative R1C1 coordinates, sheet-qualified references, defined names and table references. Invalid reference text and external workbook references return #REF!. Reference text inside INDIRECT is not rewritten by fill, copy or structural edits. Ordinary reference arguments to OFFSET are rewritten. References must stay within the Excel grid; reading beyond the loaded sheet retains the engine's #REF! behavior. Existing range, spill and work limits apply. A reference that creates a runtime dependency cycle returns #CYCLE!. Google Sheets and OpenFormula results require producer evidence before compatibility is claimed.

</details>

<details id="dialect-excel-reference-operators"><summary>Dialect: excel-reference-operators</summary>

| Dialect | Status |
| --- | --- |
| Microsoft Excel | divergent |
| Google Sheets | unverified |
| OpenFormula | unverified |

Limitations: A space between two references is the intersection operator. An empty intersection, or references on different sheets, return #NULL!. A non-reference operand returns #VALUE!. Spaces around other operators, after commas, before a closing parenthesis and between a function name and its parenthesis are not operators. A comma inside parentheses that are not a function call is the union operator, as in (A1:A2,C1:C2). Aggregate functions that read their arguments as a list of values accept a union. INDEX picks area area_num of a union, and an area_num past the last area returns #REF!. A union in any other position returns #VALUE!. AREAS counts the areas of a reference: the members of a union, or 1 for a cell, range or intersection. A non-reference argument returns #VALUE!. A 3-D reference such as Sheet1:Sheet3!A1:B2 or 'Sheet 1:Sheet 3'!A1 spans the sheets between its endpoints in workbook tab order. SUM, AVERAGE, COUNT, COUNTA, MAX, MIN, PRODUCT, STDEV.S, STDEV.P, VAR.S and VAR.P accept it; any other position returns #VALUE!. Excel also accepts it in the A-suffixed aggregate functions. A sheet inserted or moved inside the span joins it; a sheet moved out leaves it. Deleting an endpoint moves the endpoint to its inner neighbour; moving an endpoint past the other endpoint drops it; renaming an endpoint rewrites the formula text. Deleting every sheet of the span gives #REF!. Row and column edits do not change a 3-D reference. Cells beyond a smaller sheet's grid read as blank. XLSX import and export keep the Excel formula text of intersections, unions and 3-D references. Google Sheets and OpenFormula results require producer evidence before compatibility is claimed.

</details>

<details id="dialect-excel-reference-information"><summary>Dialect: excel-reference-information</summary>

| Dialect | Status |
| --- | --- |
| Microsoft Excel | divergent |
| Google Sheets | unverified |
| OpenFormula | unverified |

Limitations: CELL supports the info types address, col, contents, row and type. Other info types return #VALUE!. CELL without a reference describes the cell of the formula, as in LibreOffice. Excel uses the last changed cell. A formula that reads its own cell with FORMULATEXT, ISFORMULA or CELL is a #CYCLE! error. Cells inside a spilled range and host-linked reference cells hold no formula. For them, FORMULATEXT returns #N/A and ISFORMULA returns FALSE. Google Sheets and OpenFormula results require producer evidence before compatibility is claimed.

</details>

<details id="dialect-excel-hyperlink-value"><summary>Dialect: excel-hyperlink-value</summary>

| Dialect | Status |
| --- | --- |
| Microsoft Excel | divergent |
| Google Sheets | unverified |
| OpenFormula | unverified |

Limitations: HYPERLINK returns its display value: the friendly name, or the link when there is no friendly name. The grid does not open the link. Use cell hyperlinks for links that open. Google Sheets and OpenFormula results require producer evidence before compatibility is claimed.

</details>

## Implementation profiles

<details id="implementation-implemented-assisted"><summary>Implementation: implemented-assisted</summary>

| Layer | Status and source/evidence |
| --- | --- |
| Parser | implemented<br />[`packages/wasm/src/calc.rs`](https://github.com/chh-ay/sheetwrite/blob/develop/packages/wasm/src/calc.rs) |
| Evaluator | implemented<br />[`packages/wasm/src/eval/mod.rs`](https://github.com/chh-ay/sheetwrite/blob/develop/packages/wasm/src/eval/mod.rs)<br />[`packages/wasm/src/eval/functions.rs`](https://github.com/chh-ay/sheetwrite/blob/develop/packages/wasm/src/eval/functions.rs) |
| Formula assist | implemented<br />[`packages/core/src/formula-assist.ts`](https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/formula-assist.ts) |
| Evidence | source-linked<br />[`packages/wasm/src/tests.rs`](https://github.com/chh-ay/sheetwrite/blob/develop/packages/wasm/src/tests.rs)<br />[`packages/core/test/formula-assist.test.ts`](https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/test/formula-assist.test.ts) |

</details>

<details id="implementation-implemented-dynamic-reference"><summary>Implementation: implemented-dynamic-reference</summary>

| Layer | Status and source/evidence |
| --- | --- |
| Parser | implemented<br />[`packages/wasm/src/calc.rs`](https://github.com/chh-ay/sheetwrite/blob/develop/packages/wasm/src/calc.rs) |
| Evaluator | implemented<br />[`packages/wasm/src/eval/reference.rs`](https://github.com/chh-ay/sheetwrite/blob/develop/packages/wasm/src/eval/reference.rs)<br />[`packages/wasm/src/eval/dependency.rs`](https://github.com/chh-ay/sheetwrite/blob/develop/packages/wasm/src/eval/dependency.rs) |
| Formula assist | implemented<br />[`packages/core/src/formula-assist.ts`](https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/formula-assist.ts) |
| Evidence | source-linked<br />[`packages/wasm/src/tests.rs`](https://github.com/chh-ay/sheetwrite/blob/develop/packages/wasm/src/tests.rs)<br />[`scripts/conformance/formula-evidence.ts`](https://github.com/chh-ay/sheetwrite/blob/develop/scripts/conformance/formula-evidence.ts) |

</details>

<details id="implementation-implemented-reference-operators"><summary>Implementation: implemented-reference-operators</summary>

| Layer | Status and source/evidence |
| --- | --- |
| Parser | implemented<br />[`packages/wasm/src/calc.rs`](https://github.com/chh-ay/sheetwrite/blob/develop/packages/wasm/src/calc.rs) |
| Evaluator | implemented<br />[`packages/wasm/src/eval/areas.rs`](https://github.com/chh-ay/sheetwrite/blob/develop/packages/wasm/src/eval/areas.rs)<br />[`packages/wasm/src/eval/matrix.rs`](https://github.com/chh-ay/sheetwrite/blob/develop/packages/wasm/src/eval/matrix.rs)<br />[`packages/wasm/src/store.rs`](https://github.com/chh-ay/sheetwrite/blob/develop/packages/wasm/src/store.rs) |
| Formula assist | implemented<br />[`packages/core/src/formula-assist.ts`](https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/formula-assist.ts) |
| Evidence | source-linked<br />[`packages/wasm/src/tests.rs`](https://github.com/chh-ay/sheetwrite/blob/develop/packages/wasm/src/tests.rs)<br />[`packages/xlsx/test/formula-source-preservation.test.ts`](https://github.com/chh-ay/sheetwrite/blob/develop/packages/xlsx/test/formula-source-preservation.test.ts)<br />[`scripts/conformance/formula-evidence.ts`](https://github.com/chh-ay/sheetwrite/blob/develop/scripts/conformance/formula-evidence.ts) |

</details>

<details id="implementation-implemented-reference-information"><summary>Implementation: implemented-reference-information</summary>

| Layer | Status and source/evidence |
| --- | --- |
| Parser | implemented<br />[`packages/wasm/src/calc.rs`](https://github.com/chh-ay/sheetwrite/blob/develop/packages/wasm/src/calc.rs) |
| Evaluator | implemented<br />[`packages/wasm/src/eval/info.rs`](https://github.com/chh-ay/sheetwrite/blob/develop/packages/wasm/src/eval/info.rs) |
| Formula assist | implemented<br />[`packages/core/src/formula-assist.ts`](https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/formula-assist.ts) |
| Evidence | source-linked<br />[`packages/wasm/src/tests.rs`](https://github.com/chh-ay/sheetwrite/blob/develop/packages/wasm/src/tests.rs)<br />[`packages/core/test/formula-assist.test.ts`](https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/test/formula-assist.test.ts) |

</details>
