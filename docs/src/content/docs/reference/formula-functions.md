---
title: "Formula function contract"
description: "Generated, source-linked formula names, signatures, semantics, dialect status, and unsupported boundaries."
---

# Formula function contract

This page is generated from the checked version 1 `sheetwrite.formula-capabilities` inventory. It publishes **100 required-supported target functions**, **54 incumbent functions**, and **36 optional analysis functions** (190 canonical functions total) without maintaining a second name list. Aliases share their canonical function's build availability.

A function's presence means only the signature and semantic profiles linked in its row. Microsoft Excel documentation supplies the naming/family taxonomy; it is not a blanket Excel claim. Google Sheets and OpenFormula behavior is unverified unless a dialect profile says otherwise.

## Engine builds

- `@sheetwrite/wasm` is the unchanged default engine. All incumbent and required-target functions are available in both builds.
- `@sheetwrite/formulas` is an opt-in, larger analysis engine that also includes the distribution functions marked below. Select it before creating any stores: `import * as formulas from "@sheetwrite/formulas"; await initSheetwrite(undefined, formulas);`.
- The active engine's registered names drive formula assist. Optional names are not suggested by the default engine and evaluate to `#NAME?` there; merely importing the optional package does not enable them.
- Distribution evaluation is scalar binary64 with function-specific domains and bounded numerical algorithms. The inventory does not claim array broadcasting, unlimited tail accuracy, or complete Excel/Google Sheets/OpenFormula parity.

## Bounded evaluation contract

- Parsing and dependency evaluation are each capped at 256 recursive levels. Range and matrix work is capped at 1,000,000 cells, 1,048,576 rows, 16,384 columns, and 64 MiB of value/intermediate storage; excess work returns an explicit formula error rather than truncating.
- One dynamic-array recompute pass is capped at 2,000,000 cell operations. Spill installation is atomic and collision-checked; see the [formula guide](/docs/guides/formulas/#dynamic-arrays-and-spills) for admission rules.
- `LET` permits at most 126 bindings and 16,384 expanded AST nodes. Bindings are lexical, shadow outer bindings, and are expanded lazily, so unused reads, errors, and volatility do not become dependencies.
- Generated text is capped at 16 MiB and bounded searches at 4,000,000 steps. Text case conversion and parsing are Unicode-aware and host-locale independent; `NUMBERVALUE` defaults to `.` decimal and `,` grouping separators unless supplied explicitly.
- `IRR` and `RATE` use deterministic root solving: 14 bracket steps, at most 100 solve steps, fixed `1e-12` convergence tolerances, and a finite search domain. Non-convergence or an invalid domain returns `#NUM!`.

No formula throughput or latency number is published here because this contract has no checked final formula-performance artifact. Use the [performance evidence protocol](/docs/guides/performance-resources/) to capture and validate measurements; limits above are implementation ceilings, not benchmark results.

## Functions by family

### Dynamic array

Taxonomy/source: [Lookup and reference functions](https://support.microsoft.com/en-us/office/excel-functions-by-category-5f91f4e9-7b42-46d2-9bd1-63f26a86c0eb).

| Function (aliases) | Builds | Contract | Signature profile | Semantics profile | Dialect profile | Implementation profile |
| --- | --- | --- | --- | --- | --- | --- |
| `FILTER` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | incumbent | [`filter`](#signature-filter) | [`array`](#semantics-array) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `SORT` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | incumbent | [`sort`](#signature-sort) | [`array`](#semantics-array) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `UNIQUE` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | incumbent | [`unique`](#signature-unique) | [`array`](#semantics-array) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `TRANSPOSE` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`array-unary`](#signature-array-unary) | [`array`](#semantics-array) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `SEQUENCE` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`sequence`](#signature-sequence) | [`array`](#semantics-array) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `TAKE` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`take-drop`](#signature-take-drop) | [`array`](#semantics-array) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `DROP` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`take-drop`](#signature-take-drop) | [`array`](#semantics-array) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `CHOOSECOLS` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`choose-axis`](#signature-choose-axis) | [`array`](#semantics-array) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `CHOOSEROWS` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`choose-axis`](#signature-choose-axis) | [`array`](#semantics-array) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |

### Date and time

Taxonomy/source: [Date and time functions](https://support.microsoft.com/en-us/office/excel-functions-by-category-5f91f4e9-7b42-46d2-9bd1-63f26a86c0eb).

| Function (aliases) | Builds | Contract | Signature profile | Semantics profile | Dialect profile | Implementation profile |
| --- | --- | --- | --- | --- | --- | --- |
| `DATE` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | incumbent | [`date-three`](#signature-date-three) | [`date-time`](#semantics-date-time) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `DATEVALUE` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | incumbent | [`unary-value`](#signature-unary-value) | [`date-time`](#semantics-date-time) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `DAY` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | incumbent | [`unary-number`](#signature-unary-number) | [`date-time`](#semantics-date-time) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `MONTH` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | incumbent | [`unary-number`](#signature-unary-number) | [`date-time`](#semantics-date-time) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `YEAR` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | incumbent | [`unary-number`](#signature-unary-number) | [`date-time`](#semantics-date-time) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `TODAY` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | incumbent | [`zero`](#signature-zero) | [`volatile-date`](#semantics-volatile-date) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `NOW` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | incumbent | [`zero`](#signature-zero) | [`volatile-date`](#semantics-volatile-date) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `TIME` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`date-three`](#signature-date-three) | [`date-time`](#semantics-date-time) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `TIMEVALUE` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`unary-value`](#signature-unary-value) | [`date-time`](#semantics-date-time) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `HOUR` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`unary-value`](#signature-unary-value) | [`date-time`](#semantics-date-time) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `MINUTE` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`unary-value`](#signature-unary-value) | [`date-time`](#semantics-date-time) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `SECOND` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`unary-value`](#signature-unary-value) | [`date-time`](#semantics-date-time) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `DAYS` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`date-pair`](#signature-date-pair) | [`date-time`](#semantics-date-time) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `EDATE` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`date-offset`](#signature-date-offset) | [`date-time`](#semantics-date-time) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `EOMONTH` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`date-offset`](#signature-date-offset) | [`date-time`](#semantics-date-time) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `WEEKDAY` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`weekday-weeknum`](#signature-weekday-weeknum) | [`date-time`](#semantics-date-time) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `WEEKNUM` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`weekday-weeknum`](#signature-weekday-weeknum) | [`date-time`](#semantics-date-time) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `WORKDAY` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`workday`](#signature-workday) | [`date-time`](#semantics-date-time) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `NETWORKDAYS` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`networkdays`](#signature-networkdays) | [`date-time`](#semantics-date-time) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `YEARFRAC` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`yearfrac-days360`](#signature-yearfrac-days360) | [`date-time`](#semantics-date-time) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `DAYS360` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`yearfrac-days360`](#signature-yearfrac-days360) | [`date-time`](#semantics-date-time) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |

### Financial

Taxonomy/source: [Financial functions](https://support.microsoft.com/en-us/office/excel-functions-by-category-5f91f4e9-7b42-46d2-9bd1-63f26a86c0eb).

| Function (aliases) | Builds | Contract | Signature profile | Semantics profile | Dialect profile | Implementation profile |
| --- | --- | --- | --- | --- | --- | --- |
| `PV` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`pv-fv-pmt`](#signature-pv-fv-pmt) | [`financial`](#semantics-financial) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `FV` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`pv-fv-pmt`](#signature-pv-fv-pmt) | [`financial`](#semantics-financial) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `PMT` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`pv-fv-pmt`](#signature-pv-fv-pmt) | [`financial`](#semantics-financial) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `NPV` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`npv`](#signature-npv) | [`financial`](#semantics-financial) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `IRR` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`irr`](#signature-irr) | [`financial-iterative`](#semantics-financial-iterative) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `RATE` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`rate`](#signature-rate) | [`financial-iterative`](#semantics-financial-iterative) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `IPMT` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`period-payment`](#signature-period-payment) | [`financial`](#semantics-financial) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `PPMT` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`period-payment`](#signature-period-payment) | [`financial`](#semantics-financial) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |

### Information and error

Taxonomy/source: [Information functions](https://support.microsoft.com/en-us/office/excel-functions-by-category-5f91f4e9-7b42-46d2-9bd1-63f26a86c0eb).

| Function (aliases) | Builds | Contract | Signature profile | Semantics profile | Dialect profile | Implementation profile |
| --- | --- | --- | --- | --- | --- | --- |
| `IFERROR` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | incumbent | [`if-error`](#signature-if-error) | [`lazy-control`](#semantics-lazy-control) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `IFNA` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`if-error`](#signature-if-error) | [`lazy-control`](#semantics-lazy-control) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `ISBLANK` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`unary-value`](#signature-unary-value) | [`information`](#semantics-information) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `ISNUMBER` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`unary-value`](#signature-unary-value) | [`information`](#semantics-information) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `ISTEXT` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`unary-value`](#signature-unary-value) | [`information`](#semantics-information) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `ISLOGICAL` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`unary-value`](#signature-unary-value) | [`information`](#semantics-information) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `ISERROR` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`unary-value`](#signature-unary-value) | [`information`](#semantics-information) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `ISERR` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`unary-value`](#signature-unary-value) | [`information`](#semantics-information) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `ISNA` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`unary-value`](#signature-unary-value) | [`information`](#semantics-information) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `TYPE` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`unary-value`](#signature-unary-value) | [`information`](#semantics-information) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `N` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`unary-value`](#signature-unary-value) | [`information`](#semantics-information) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `T` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`unary-value`](#signature-unary-value) | [`information`](#semantics-information) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `NA` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | incumbent | [`zero`](#signature-zero) | [`information`](#semantics-information) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |

### Logical and control flow

Taxonomy/source: [Logical functions](https://support.microsoft.com/en-us/office/excel-functions-by-category-5f91f4e9-7b42-46d2-9bd1-63f26a86c0eb).

| Function (aliases) | Builds | Contract | Signature profile | Semantics profile | Dialect profile | Implementation profile |
| --- | --- | --- | --- | --- | --- | --- |
| `IF` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | incumbent | [`if`](#signature-if) | [`lazy-control`](#semantics-lazy-control) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `AND` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | incumbent | [`logical-variadic`](#signature-logical-variadic) | [`logical`](#semantics-logical) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `OR` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | incumbent | [`logical-variadic`](#signature-logical-variadic) | [`logical`](#semantics-logical) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `NOT` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | incumbent | [`unary-value`](#signature-unary-value) | [`logical`](#semantics-logical) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `IFS` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`ifs`](#signature-ifs) | [`lazy-control`](#semantics-lazy-control) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `SWITCH` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`switch`](#signature-switch) | [`lazy-control`](#semantics-lazy-control) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `XOR` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`logical-variadic`](#signature-logical-variadic) | [`logical`](#semantics-logical) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `TRUE` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`zero`](#signature-zero) | [`logical`](#semantics-logical) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `FALSE` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`zero`](#signature-zero) | [`logical`](#semantics-logical) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `LET` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`let`](#signature-let) | [`let-binding`](#semantics-let-binding) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |

### Lookup and reference

Taxonomy/source: [Lookup and reference functions](https://support.microsoft.com/en-us/office/excel-functions-by-category-5f91f4e9-7b42-46d2-9bd1-63f26a86c0eb).

| Function (aliases) | Builds | Contract | Signature profile | Semantics profile | Dialect profile | Implementation profile |
| --- | --- | --- | --- | --- | --- | --- |
| `INDEX` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | incumbent | [`index`](#signature-index) | [`lookup`](#semantics-lookup) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `MATCH` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | incumbent | [`match`](#signature-match) | [`lookup`](#semantics-lookup) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `VLOOKUP` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | incumbent | [`table-lookup`](#signature-table-lookup) | [`lookup`](#semantics-lookup) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `HLOOKUP` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | incumbent | [`table-lookup`](#signature-table-lookup) | [`lookup`](#semantics-lookup) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `XLOOKUP` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | incumbent | [`xlookup`](#signature-xlookup) | [`lookup`](#semantics-lookup) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `XMATCH` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`xmatch`](#signature-xmatch) | [`lookup`](#semantics-lookup) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `CHOOSE` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`choose`](#signature-choose) | [`lookup`](#semantics-lookup) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `ROW` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`optional-reference`](#signature-optional-reference) | [`lookup`](#semantics-lookup) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `ROWS` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`unary-value`](#signature-unary-value) | [`lookup`](#semantics-lookup) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `COLUMN` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`optional-reference`](#signature-optional-reference) | [`lookup`](#semantics-lookup) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `COLUMNS` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`unary-value`](#signature-unary-value) | [`lookup`](#semantics-lookup) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `ADDRESS` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`address`](#signature-address) | [`lookup`](#semantics-lookup) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |

### Math and trigonometry

Taxonomy/source: [Math and trigonometry functions](https://support.microsoft.com/en-us/office/excel-functions-by-category-5f91f4e9-7b42-46d2-9bd1-63f26a86c0eb).

| Function (aliases) | Builds | Contract | Signature profile | Semantics profile | Dialect profile | Implementation profile |
| --- | --- | --- | --- | --- | --- | --- |
| `SUM` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | incumbent | [`optional-variadic-values`](#signature-optional-variadic-values) | [`aggregate`](#semantics-aggregate) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `ABS` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | incumbent | [`unary-number`](#signature-unary-number) | [`scalar`](#semantics-scalar) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `ROUND` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | incumbent | [`round`](#signature-round) | [`scalar`](#semantics-scalar) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `SQRT` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | incumbent | [`unary-number`](#signature-unary-number) | [`scalar`](#semantics-scalar) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `MOD` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | incumbent | [`binary-number`](#signature-binary-number) | [`scalar`](#semantics-scalar) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `POW` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | incumbent | [`binary-number`](#signature-binary-number) | [`scalar`](#semantics-scalar) | [`excel-documented`](#dialect-excel-documented) | [`parser-assisted-evaluator-declared`](#implementation-parser-assisted-evaluator-declared) |
| `FLOOR` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | incumbent | [`binary-number`](#signature-binary-number) | [`scalar`](#semantics-scalar) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `CEILING` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | incumbent | [`binary-number`](#signature-binary-number) | [`scalar`](#semantics-scalar) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `INT` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | incumbent | [`unary-number`](#signature-unary-number) | [`scalar`](#semantics-scalar) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `TRUNC` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | incumbent | [`trunc`](#signature-trunc) | [`scalar`](#semantics-scalar) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `SIGN` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | incumbent | [`unary-number`](#signature-unary-number) | [`scalar`](#semantics-scalar) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `PI` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | incumbent | [`zero`](#signature-zero) | [`scalar`](#semantics-scalar) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `SUMIF` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | incumbent | [`sumif`](#signature-sumif) | [`criteria`](#semantics-criteria) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `SUMIFS` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | incumbent | [`sumifs`](#signature-sumifs) | [`criteria`](#semantics-criteria) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `PRODUCT` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`variadic-values`](#signature-variadic-values) | [`aggregate`](#semantics-aggregate) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `SUMPRODUCT` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`variadic-values`](#signature-variadic-values) | [`aggregate`](#semantics-aggregate) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `POWER` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`binary-number`](#signature-binary-number) | [`scalar`](#semantics-scalar) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `EXP` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`unary-number`](#signature-unary-number) | [`scalar`](#semantics-scalar) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `LN` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`unary-number`](#signature-unary-number) | [`scalar`](#semantics-scalar) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `LOG` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`log`](#signature-log) | [`scalar`](#semantics-scalar) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `LOG10` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`unary-number`](#signature-unary-number) | [`scalar`](#semantics-scalar) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `ROUNDUP` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`round`](#signature-round) | [`scalar`](#semantics-scalar) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `ROUNDDOWN` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`round`](#signature-round) | [`scalar`](#semantics-scalar) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `MROUND` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`binary-number`](#signature-binary-number) | [`scalar`](#semantics-scalar) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `EVEN` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`unary-number`](#signature-unary-number) | [`scalar`](#semantics-scalar) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `ODD` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`unary-number`](#signature-unary-number) | [`scalar`](#semantics-scalar) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `QUOTIENT` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`binary-number`](#signature-binary-number) | [`scalar`](#semantics-scalar) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `GCD` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`variadic-values`](#signature-variadic-values) | [`aggregate`](#semantics-aggregate) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `LCM` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`variadic-values`](#signature-variadic-values) | [`aggregate`](#semantics-aggregate) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `SUBTOTAL` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`subtotal`](#signature-subtotal) | [`aggregate`](#semantics-aggregate) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |

### Statistical

Taxonomy/source: [Statistical functions](https://support.microsoft.com/en-us/office/excel-functions-by-category-5f91f4e9-7b42-46d2-9bd1-63f26a86c0eb).

| Function (aliases) | Builds | Contract | Signature profile | Semantics profile | Dialect profile | Implementation profile |
| --- | --- | --- | --- | --- | --- | --- |
| `AVERAGE` (`AVG`) | `@sheetwrite/wasm`, `@sheetwrite/formulas` | incumbent | [`optional-variadic-values`](#signature-optional-variadic-values) | [`aggregate`](#semantics-aggregate) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `MIN` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | incumbent | [`optional-variadic-values`](#signature-optional-variadic-values) | [`aggregate`](#semantics-aggregate) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `MAX` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | incumbent | [`optional-variadic-values`](#signature-optional-variadic-values) | [`aggregate`](#semantics-aggregate) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `COUNT` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | incumbent | [`optional-variadic-values`](#signature-optional-variadic-values) | [`aggregate`](#semantics-aggregate) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `COUNTA` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | incumbent | [`optional-variadic-values`](#signature-optional-variadic-values) | [`aggregate`](#semantics-aggregate) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `COUNTIF` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | incumbent | [`criteria-one`](#signature-criteria-one) | [`criteria`](#semantics-criteria) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `COUNTIFS` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | incumbent | [`criteria-many`](#signature-criteria-many) | [`criteria`](#semantics-criteria) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `AVERAGEIF` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | incumbent | [`sumif`](#signature-sumif) | [`criteria`](#semantics-criteria) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `AVERAGEIFS` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | incumbent | [`sumifs`](#signature-sumifs) | [`criteria`](#semantics-criteria) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `MEDIAN` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`variadic-values`](#signature-variadic-values) | [`aggregate`](#semantics-aggregate) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `MODE.SNGL` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`variadic-values`](#signature-variadic-values) | [`aggregate`](#semantics-aggregate) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `LARGE` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`value-k`](#signature-value-k) | [`aggregate`](#semantics-aggregate) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `SMALL` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`value-k`](#signature-value-k) | [`aggregate`](#semantics-aggregate) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `RANK.EQ` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`rank`](#signature-rank) | [`aggregate`](#semantics-aggregate) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `PERCENTILE.INC` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`percentile`](#signature-percentile) | [`aggregate`](#semantics-aggregate) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `QUARTILE.INC` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`percentile`](#signature-percentile) | [`aggregate`](#semantics-aggregate) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `STDEV.S` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`variadic-values`](#signature-variadic-values) | [`aggregate`](#semantics-aggregate) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `STDEV.P` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`variadic-values`](#signature-variadic-values) | [`aggregate`](#semantics-aggregate) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `VAR.S` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`variadic-values`](#signature-variadic-values) | [`aggregate`](#semantics-aggregate) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `VAR.P` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`variadic-values`](#signature-variadic-values) | [`aggregate`](#semantics-aggregate) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `GEOMEAN` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`variadic-values`](#signature-variadic-values) | [`aggregate`](#semantics-aggregate) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `CORREL` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`pair-arrays`](#signature-pair-arrays) | [`aggregate`](#semantics-aggregate) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `COVARIANCE.S` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`pair-arrays`](#signature-pair-arrays) | [`aggregate`](#semantics-aggregate) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `COVARIANCE.P` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`pair-arrays`](#signature-pair-arrays) | [`aggregate`](#semantics-aggregate) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `COUNTBLANK` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`unary-value`](#signature-unary-value) | [`aggregate`](#semantics-aggregate) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `MAXIFS` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`sumifs`](#signature-sumifs) | [`criteria`](#semantics-criteria) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `MINIFS` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`sumifs`](#signature-sumifs) | [`criteria`](#semantics-criteria) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `NORM.DIST` | `@sheetwrite/formulas` | optional analysis | [`norm-dist`](#signature-norm-dist) | [`analysis-distributions`](#semantics-analysis-distributions) | [`analysis-distributions`](#dialect-analysis-distributions) | [`analysis-distributions`](#implementation-analysis-distributions) |
| `NORM.INV` | `@sheetwrite/formulas` | optional analysis | [`norm-inv`](#signature-norm-inv) | [`analysis-distributions`](#semantics-analysis-distributions) | [`analysis-distributions`](#dialect-analysis-distributions) | [`analysis-distributions`](#implementation-analysis-distributions) |
| `NORM.S.DIST` | `@sheetwrite/formulas` | optional analysis | [`norm-s-dist`](#signature-norm-s-dist) | [`analysis-distributions`](#semantics-analysis-distributions) | [`analysis-distributions`](#dialect-analysis-distributions) | [`analysis-distributions`](#implementation-analysis-distributions) |
| `NORM.S.INV` | `@sheetwrite/formulas` | optional analysis | [`unary-number`](#signature-unary-number) | [`analysis-distributions`](#semantics-analysis-distributions) | [`analysis-distributions`](#dialect-analysis-distributions) | [`analysis-distributions`](#implementation-analysis-distributions) |
| `T.DIST` | `@sheetwrite/formulas` | optional analysis | [`t-dist`](#signature-t-dist) | [`analysis-distributions`](#semantics-analysis-distributions) | [`analysis-distributions`](#dialect-analysis-distributions) | [`analysis-distributions`](#implementation-analysis-distributions) |
| `T.DIST.2T` | `@sheetwrite/formulas` | optional analysis | [`distribution-tail`](#signature-distribution-tail) | [`analysis-distributions`](#semantics-analysis-distributions) | [`analysis-distributions`](#dialect-analysis-distributions) | [`analysis-distributions`](#implementation-analysis-distributions) |
| `T.DIST.RT` | `@sheetwrite/formulas` | optional analysis | [`distribution-tail`](#signature-distribution-tail) | [`analysis-distributions`](#semantics-analysis-distributions) | [`analysis-distributions`](#dialect-analysis-distributions) | [`analysis-distributions`](#implementation-analysis-distributions) |
| `T.INV` | `@sheetwrite/formulas` | optional analysis | [`distribution-inverse`](#signature-distribution-inverse) | [`analysis-distributions`](#semantics-analysis-distributions) | [`analysis-distributions`](#dialect-analysis-distributions) | [`analysis-distributions`](#implementation-analysis-distributions) |
| `T.INV.2T` | `@sheetwrite/formulas` | optional analysis | [`distribution-inverse`](#signature-distribution-inverse) | [`analysis-distributions`](#semantics-analysis-distributions) | [`analysis-distributions`](#dialect-analysis-distributions) | [`analysis-distributions`](#implementation-analysis-distributions) |
| `CHISQ.DIST` | `@sheetwrite/formulas` | optional analysis | [`t-dist`](#signature-t-dist) | [`analysis-distributions`](#semantics-analysis-distributions) | [`analysis-distributions`](#dialect-analysis-distributions) | [`analysis-distributions`](#implementation-analysis-distributions) |
| `CHISQ.DIST.RT` | `@sheetwrite/formulas` | optional analysis | [`distribution-tail`](#signature-distribution-tail) | [`analysis-distributions`](#semantics-analysis-distributions) | [`analysis-distributions`](#dialect-analysis-distributions) | [`analysis-distributions`](#implementation-analysis-distributions) |
| `CHISQ.INV` | `@sheetwrite/formulas` | optional analysis | [`distribution-inverse`](#signature-distribution-inverse) | [`analysis-distributions`](#semantics-analysis-distributions) | [`analysis-distributions`](#dialect-analysis-distributions) | [`analysis-distributions`](#implementation-analysis-distributions) |
| `CHISQ.INV.RT` | `@sheetwrite/formulas` | optional analysis | [`distribution-inverse`](#signature-distribution-inverse) | [`analysis-distributions`](#semantics-analysis-distributions) | [`analysis-distributions`](#dialect-analysis-distributions) | [`analysis-distributions`](#implementation-analysis-distributions) |
| `F.DIST` | `@sheetwrite/formulas` | optional analysis | [`f-dist`](#signature-f-dist) | [`analysis-distributions`](#semantics-analysis-distributions) | [`analysis-distributions`](#dialect-analysis-distributions) | [`analysis-distributions`](#implementation-analysis-distributions) |
| `F.DIST.RT` | `@sheetwrite/formulas` | optional analysis | [`f-tail`](#signature-f-tail) | [`analysis-distributions`](#semantics-analysis-distributions) | [`analysis-distributions`](#dialect-analysis-distributions) | [`analysis-distributions`](#implementation-analysis-distributions) |
| `F.INV` | `@sheetwrite/formulas` | optional analysis | [`f-inverse`](#signature-f-inverse) | [`analysis-distributions`](#semantics-analysis-distributions) | [`analysis-distributions`](#dialect-analysis-distributions) | [`analysis-distributions`](#implementation-analysis-distributions) |
| `F.INV.RT` | `@sheetwrite/formulas` | optional analysis | [`f-inverse`](#signature-f-inverse) | [`analysis-distributions`](#semantics-analysis-distributions) | [`analysis-distributions`](#dialect-analysis-distributions) | [`analysis-distributions`](#implementation-analysis-distributions) |
| `BINOM.DIST` | `@sheetwrite/formulas` | optional analysis | [`binom-dist`](#signature-binom-dist) | [`analysis-distributions`](#semantics-analysis-distributions) | [`analysis-distributions`](#dialect-analysis-distributions) | [`analysis-distributions`](#implementation-analysis-distributions) |
| `POISSON.DIST` | `@sheetwrite/formulas` | optional analysis | [`poisson-dist`](#signature-poisson-dist) | [`analysis-distributions`](#semantics-analysis-distributions) | [`analysis-distributions`](#dialect-analysis-distributions) | [`analysis-distributions`](#implementation-analysis-distributions) |
| `EXPON.DIST` | `@sheetwrite/formulas` | optional analysis | [`expon-dist`](#signature-expon-dist) | [`analysis-distributions`](#semantics-analysis-distributions) | [`analysis-distributions`](#dialect-analysis-distributions) | [`analysis-distributions`](#implementation-analysis-distributions) |
| `GAMMA` | `@sheetwrite/formulas` | optional analysis | [`unary-number`](#signature-unary-number) | [`analysis-distributions`](#semantics-analysis-distributions) | [`analysis-distributions`](#dialect-analysis-distributions) | [`analysis-distributions`](#implementation-analysis-distributions) |
| `GAMMALN` | `@sheetwrite/formulas` | optional analysis | [`unary-number`](#signature-unary-number) | [`analysis-distributions`](#semantics-analysis-distributions) | [`analysis-distributions`](#dialect-analysis-distributions) | [`analysis-distributions`](#implementation-analysis-distributions) |
| `GAMMA.DIST` | `@sheetwrite/formulas` | optional analysis | [`gamma-dist`](#signature-gamma-dist) | [`analysis-distributions`](#semantics-analysis-distributions) | [`analysis-distributions`](#dialect-analysis-distributions) | [`analysis-distributions`](#implementation-analysis-distributions) |
| `GAMMA.INV` | `@sheetwrite/formulas` | optional analysis | [`gamma-inverse`](#signature-gamma-inverse) | [`analysis-distributions`](#semantics-analysis-distributions) | [`analysis-distributions`](#dialect-analysis-distributions) | [`analysis-distributions`](#implementation-analysis-distributions) |
| `BETA.DIST` | `@sheetwrite/formulas` | optional analysis | [`beta-dist`](#signature-beta-dist) | [`analysis-distributions`](#semantics-analysis-distributions) | [`analysis-distributions`](#dialect-analysis-distributions) | [`analysis-distributions`](#implementation-analysis-distributions) |
| `BETA.INV` | `@sheetwrite/formulas` | optional analysis | [`beta-inverse`](#signature-beta-inverse) | [`analysis-distributions`](#semantics-analysis-distributions) | [`analysis-distributions`](#dialect-analysis-distributions) | [`analysis-distributions`](#implementation-analysis-distributions) |
| `LOGNORM.DIST` | `@sheetwrite/formulas` | optional analysis | [`lognorm-dist`](#signature-lognorm-dist) | [`analysis-distributions`](#semantics-analysis-distributions) | [`analysis-distributions`](#dialect-analysis-distributions) | [`analysis-distributions`](#implementation-analysis-distributions) |
| `LOGNORM.INV` | `@sheetwrite/formulas` | optional analysis | [`lognorm-inverse`](#signature-lognorm-inverse) | [`analysis-distributions`](#semantics-analysis-distributions) | [`analysis-distributions`](#dialect-analysis-distributions) | [`analysis-distributions`](#implementation-analysis-distributions) |
| `WEIBULL.DIST` | `@sheetwrite/formulas` | optional analysis | [`weibull-dist`](#signature-weibull-dist) | [`analysis-distributions`](#semantics-analysis-distributions) | [`analysis-distributions`](#dialect-analysis-distributions) | [`analysis-distributions`](#implementation-analysis-distributions) |
| `CONFIDENCE.NORM` | `@sheetwrite/formulas` | optional analysis | [`confidence`](#signature-confidence) | [`analysis-distributions`](#semantics-analysis-distributions) | [`analysis-distributions`](#dialect-analysis-distributions) | [`analysis-distributions`](#implementation-analysis-distributions) |
| `CONFIDENCE.T` | `@sheetwrite/formulas` | optional analysis | [`confidence`](#signature-confidence) | [`analysis-distributions`](#semantics-analysis-distributions) | [`analysis-distributions`](#dialect-analysis-distributions) | [`analysis-distributions`](#implementation-analysis-distributions) |
| `STANDARDIZE` | `@sheetwrite/formulas` | optional analysis | [`standardize`](#signature-standardize) | [`analysis-distributions`](#semantics-analysis-distributions) | [`analysis-distributions`](#dialect-analysis-distributions) | [`analysis-distributions`](#implementation-analysis-distributions) |
| `FISHER` | `@sheetwrite/formulas` | optional analysis | [`unary-number`](#signature-unary-number) | [`analysis-distributions`](#semantics-analysis-distributions) | [`analysis-distributions`](#dialect-analysis-distributions) | [`analysis-distributions`](#implementation-analysis-distributions) |
| `FISHERINV` | `@sheetwrite/formulas` | optional analysis | [`unary-number`](#signature-unary-number) | [`analysis-distributions`](#semantics-analysis-distributions) | [`analysis-distributions`](#dialect-analysis-distributions) | [`analysis-distributions`](#implementation-analysis-distributions) |
| `PHI` | `@sheetwrite/formulas` | optional analysis | [`unary-number`](#signature-unary-number) | [`analysis-distributions`](#semantics-analysis-distributions) | [`analysis-distributions`](#dialect-analysis-distributions) | [`analysis-distributions`](#implementation-analysis-distributions) |
| `GAUSS` | `@sheetwrite/formulas` | optional analysis | [`unary-number`](#signature-unary-number) | [`analysis-distributions`](#semantics-analysis-distributions) | [`analysis-distributions`](#dialect-analysis-distributions) | [`analysis-distributions`](#implementation-analysis-distributions) |

### Text

Taxonomy/source: [Text functions](https://support.microsoft.com/en-us/office/excel-functions-by-category-5f91f4e9-7b42-46d2-9bd1-63f26a86c0eb).

| Function (aliases) | Builds | Contract | Signature profile | Semantics profile | Dialect profile | Implementation profile |
| --- | --- | --- | --- | --- | --- | --- |
| `LEN` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | incumbent | [`unary-value`](#signature-unary-value) | [`text`](#semantics-text) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `LEFT` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | incumbent | [`left-right`](#signature-left-right) | [`text`](#semantics-text) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `RIGHT` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | incumbent | [`left-right`](#signature-left-right) | [`text`](#semantics-text) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `MID` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | incumbent | [`mid`](#signature-mid) | [`text`](#semantics-text) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `CONCAT` (`CONCATENATE`) | `@sheetwrite/wasm`, `@sheetwrite/formulas` | incumbent | [`variadic-values`](#signature-variadic-values) | [`text`](#semantics-text) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `UPPER` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | incumbent | [`unary-value`](#signature-unary-value) | [`text`](#semantics-text) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `LOWER` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | incumbent | [`unary-value`](#signature-unary-value) | [`text`](#semantics-text) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `TRIM` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | incumbent | [`unary-value`](#signature-unary-value) | [`text`](#semantics-text) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `TEXT` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | incumbent | [`text-format`](#signature-text-format) | [`text`](#semantics-text) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `EXACT` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | incumbent | [`binary-number`](#signature-binary-number) | [`text-sensitive`](#semantics-text-sensitive) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `TEXTJOIN` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`text-join`](#signature-text-join) | [`text`](#semantics-text) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `SUBSTITUTE` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`substitute`](#signature-substitute) | [`text-sensitive`](#semantics-text-sensitive) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `REPLACE` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`replace`](#signature-replace) | [`text-sensitive`](#semantics-text-sensitive) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `FIND` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`find-search`](#signature-find-search) | [`text-sensitive`](#semantics-text-sensitive) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `SEARCH` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`find-search`](#signature-find-search) | [`text-search`](#semantics-text-search) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `VALUE` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`unary-value`](#signature-unary-value) | [`text`](#semantics-text) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `CLEAN` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`unary-value`](#signature-unary-value) | [`text`](#semantics-text) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `REPT` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`repeat-text`](#signature-repeat-text) | [`text`](#semantics-text) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `CHAR` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`unary-number`](#signature-unary-number) | [`text`](#semantics-text) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `CODE` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`unary-value`](#signature-unary-value) | [`text`](#semantics-text) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `UNICHAR` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`unary-number`](#signature-unary-number) | [`text`](#semantics-text) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `UNICODE` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`unary-value`](#signature-unary-value) | [`text`](#semantics-text) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `PROPER` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`unary-value`](#signature-unary-value) | [`text`](#semantics-text) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `NUMBERVALUE` | `@sheetwrite/wasm`, `@sheetwrite/formulas` | required target | [`number-value`](#signature-number-value) | [`text`](#semantics-text) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |

### Formula operators

Taxonomy/source: [Types of operators](https://support.microsoft.com/en-us/office/calculation-operators-and-precedence-in-excel-48be406d-4975-4d31-b2b8-7af9e0e2878a).

| Function (aliases) | Builds | Contract | Signature profile | Semantics profile | Dialect profile | Implementation profile |
| --- | --- | --- | --- | --- | --- | --- |

## Signature profiles

Argument order, required/default state, accepted shapes, repetition, and return shape come directly from the inventory.

### Signature: zero

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| _none_ | — | — | — | — |

### Signature: unary-value

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `value` | yes | none | `scalar`, `range`, `array`, `reference` | `once` |

### Signature: unary-number

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `number` | yes | none | `scalar`, `reference` | `once` |

### Signature: binary-number

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `number1` | yes | none | `scalar`, `reference` | `once` |
| `number2` | yes | none | `scalar`, `reference` | `once` |

### Signature: variadic-values

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `value` | yes | none | `scalar`, `range`, `array`, `reference` | `one-or-more` |

### Signature: optional-variadic-values

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `value` | no | none | `scalar`, `range`, `array`, `reference` | `zero-or-more` |

### Signature: logical-variadic

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `logical` | yes | none | `scalar`, `range`, `array`, `reference` | `one-or-more` |

### Signature: if

Return shape: `contextual`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `logicalTest` | yes | none | `scalar`, `reference` | `once` |
| `valueIfTrue` | no | true | `scalar`, `range`, `array`, `reference` | `once` |
| `valueIfFalse` | no | false | `scalar`, `range`, `array`, `reference` | `once` |

### Signature: if-error

Return shape: `contextual`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `value` | yes | none | `scalar`, `range`, `array`, `reference` | `once` |
| `valueIfError` | yes | none | `scalar`, `range`, `array`, `reference` | `once` |

### Signature: ifs

Return shape: `contextual`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `testAndValue` | yes | none | `scalar`, `range`, `array`, `reference` | `paired` |

### Signature: switch

Return shape: `contextual`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `expression` | yes | none | `scalar`, `reference` | `once` |
| `valueAndResult` | yes | none | `scalar`, `range`, `array`, `reference` | `paired` |
| `defaultValue` | no | #N/A | `scalar`, `range`, `array`, `reference` | `once` |

### Signature: let

Return shape: `contextual`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `nameAndValue` | yes | none | `scalar`, `range`, `array`, `name`, `reference` | `paired` |
| `calculation` | yes | none | `scalar`, `range`, `array`, `name`, `reference` | `once` |

### Signature: round

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `number` | yes | none | `scalar`, `reference` | `once` |
| `digits` | yes | none | `scalar`, `reference` | `once` |

### Signature: trunc

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `number` | yes | none | `scalar`, `reference` | `once` |
| `digits` | no | 0 | `scalar`, `reference` | `once` |

### Signature: log

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `number` | yes | none | `scalar`, `reference` | `once` |
| `base` | no | 10 | `scalar`, `reference` | `once` |

### Signature: subtotal

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `functionNumber` | yes | none | `scalar`, `reference` | `once` |
| `reference` | yes | none | `range`, `array`, `reference` | `one-or-more` |

### Signature: left-right

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `text` | yes | none | `scalar`, `reference` | `once` |
| `count` | no | 1 | `scalar`, `reference` | `once` |

### Signature: mid

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `text` | yes | none | `scalar`, `reference` | `once` |
| `start` | yes | none | `scalar`, `reference` | `once` |
| `count` | yes | none | `scalar`, `reference` | `once` |

### Signature: text-format

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `value` | yes | none | `scalar`, `reference` | `once` |
| `formatText` | yes | none | `scalar`, `reference` | `once` |

### Signature: text-join

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `delimiter` | yes | none | `scalar`, `reference` | `once` |
| `ignoreEmpty` | yes | none | `scalar`, `reference` | `once` |
| `text` | yes | none | `scalar`, `range`, `array`, `reference` | `one-or-more` |

### Signature: substitute

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `text` | yes | none | `scalar`, `reference` | `once` |
| `oldText` | yes | none | `scalar`, `reference` | `once` |
| `newText` | yes | none | `scalar`, `reference` | `once` |
| `instance` | no | all | `scalar`, `reference` | `once` |

### Signature: replace

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `oldText` | yes | none | `scalar`, `reference` | `once` |
| `start` | yes | none | `scalar`, `reference` | `once` |
| `count` | yes | none | `scalar`, `reference` | `once` |
| `newText` | yes | none | `scalar`, `reference` | `once` |

### Signature: find-search

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `findText` | yes | none | `scalar`, `reference` | `once` |
| `withinText` | yes | none | `scalar`, `reference` | `once` |
| `start` | no | 1 | `scalar`, `reference` | `once` |

### Signature: repeat-text

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `text` | yes | none | `scalar`, `reference` | `once` |
| `count` | yes | none | `scalar`, `reference` | `once` |

### Signature: number-value

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `text` | yes | none | `scalar`, `reference` | `once` |
| `decimalSeparator` | no | . | `scalar`, `reference` | `once` |
| `groupSeparator` | no | , | `scalar`, `reference` | `once` |

### Signature: date-three

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `part1` | yes | none | `scalar`, `reference` | `once` |
| `part2` | yes | none | `scalar`, `reference` | `once` |
| `part3` | yes | none | `scalar`, `reference` | `once` |

### Signature: date-pair

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `endDate` | yes | none | `scalar`, `reference` | `once` |
| `startDate` | yes | none | `scalar`, `reference` | `once` |

### Signature: date-offset

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `startDate` | yes | none | `scalar`, `reference` | `once` |
| `offset` | yes | none | `scalar`, `reference` | `once` |

### Signature: weekday-weeknum

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `serialNumber` | yes | none | `scalar`, `reference` | `once` |
| `returnType` | no | 1 | `scalar`, `reference` | `once` |

### Signature: workday

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `startDate` | yes | none | `scalar`, `reference` | `once` |
| `days` | yes | none | `scalar`, `reference` | `once` |
| `holidays` | no | none | `range`, `array`, `reference` | `once` |

### Signature: networkdays

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `startDate` | yes | none | `scalar`, `reference` | `once` |
| `endDate` | yes | none | `scalar`, `reference` | `once` |
| `holidays` | no | none | `range`, `array`, `reference` | `once` |

### Signature: yearfrac-days360

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `startDate` | yes | none | `scalar`, `reference` | `once` |
| `endDate` | yes | none | `scalar`, `reference` | `once` |
| `basisOrMethod` | no | 0 | `scalar`, `reference` | `once` |

### Signature: value-k

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `array` | yes | none | `range`, `array`, `reference` | `once` |
| `k` | yes | none | `scalar`, `reference` | `once` |

### Signature: rank

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `number` | yes | none | `scalar`, `reference` | `once` |
| `reference` | yes | none | `range`, `array`, `reference` | `once` |
| `order` | no | 0 | `scalar`, `reference` | `once` |

### Signature: percentile

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `array` | yes | none | `range`, `array`, `reference` | `once` |
| `fraction` | yes | none | `scalar`, `reference` | `once` |

### Signature: pair-arrays

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `array1` | yes | none | `range`, `array`, `reference` | `once` |
| `array2` | yes | none | `range`, `array`, `reference` | `once` |

### Signature: criteria-one

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `range` | yes | none | `range`, `array`, `reference` | `once` |
| `criteria` | yes | none | `scalar`, `reference` | `once` |

### Signature: criteria-many

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `rangeAndCriteria` | yes | none | `scalar`, `range`, `array`, `reference` | `paired` |

### Signature: sumif

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `range` | yes | none | `range`, `array`, `reference` | `once` |
| `criteria` | yes | none | `scalar`, `reference` | `once` |
| `sumRange` | no | range | `range`, `array`, `reference` | `once` |

### Signature: sumifs

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `sumRange` | yes | none | `range`, `array`, `reference` | `once` |
| `rangeAndCriteria` | yes | none | `scalar`, `range`, `array`, `reference` | `paired` |

### Signature: match

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `lookupValue` | yes | none | `scalar`, `reference` | `once` |
| `lookupArray` | yes | none | `range`, `array`, `reference` | `once` |
| `matchMode` | no | 1 | `scalar`, `reference` | `once` |

### Signature: xmatch

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `lookupValue` | yes | none | `scalar`, `reference` | `once` |
| `lookupArray` | yes | none | `range`, `array`, `reference` | `once` |
| `matchMode` | no | 0 | `scalar`, `reference` | `once` |
| `searchMode` | no | 1 | `scalar`, `reference` | `once` |

### Signature: index

Return shape: `contextual`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `array` | yes | none | `range`, `array`, `reference` | `once` |
| `row` | yes | none | `scalar`, `reference` | `once` |
| `column` | no | 1 | `scalar`, `reference` | `once` |

### Signature: xlookup

Return shape: `contextual`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `lookupValue` | yes | none | `scalar`, `reference` | `once` |
| `lookupArray` | yes | none | `range`, `array`, `reference` | `once` |
| `returnArray` | yes | none | `range`, `array`, `reference` | `once` |
| `ifNotFound` | no | #N/A | `scalar`, `reference` | `once` |
| `matchMode` | no | 0 | `scalar`, `reference` | `once` |
| `searchMode` | no | 1 | `scalar`, `reference` | `once` |

### Signature: table-lookup

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `lookupValue` | yes | none | `scalar`, `reference` | `once` |
| `table` | yes | none | `range`, `array`, `reference` | `once` |
| `index` | yes | none | `scalar`, `reference` | `once` |
| `approximate` | no | true | `scalar`, `reference` | `once` |

### Signature: filter

Return shape: `array`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `array` | yes | none | `range`, `array`, `reference` | `once` |
| `include` | yes | none | `range`, `array`, `reference` | `once` |
| `ifEmpty` | no | #CALC! | `scalar`, `reference` | `once` |

### Signature: sort

Return shape: `array`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `array` | yes | none | `range`, `array`, `reference` | `once` |
| `sortIndex` | no | 1 | `scalar`, `reference` | `once` |
| `sortOrder` | no | 1 | `scalar`, `reference` | `once` |
| `byColumn` | no | false | `scalar`, `reference` | `once` |

### Signature: unique

Return shape: `array`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `array` | yes | none | `range`, `array`, `reference` | `once` |
| `byColumn` | no | false | `scalar`, `reference` | `once` |
| `exactlyOnce` | no | false | `scalar`, `reference` | `once` |

### Signature: choose

Return shape: `contextual`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `index` | yes | none | `scalar`, `reference` | `once` |
| `value` | yes | none | `scalar`, `range`, `array`, `reference` | `one-or-more` |

### Signature: optional-reference

Return shape: `contextual`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `reference` | no | formula-cell | `range`, `array`, `reference` | `once` |

### Signature: address

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `row` | yes | none | `scalar`, `reference` | `once` |
| `column` | yes | none | `scalar`, `reference` | `once` |
| `absNumber` | no | 1 | `scalar`, `reference` | `once` |
| `a1` | no | true | `scalar`, `reference` | `once` |
| `sheetText` | no | none | `scalar`, `reference` | `once` |

### Signature: array-unary

Return shape: `array`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `array` | yes | none | `range`, `array`, `reference` | `once` |

### Signature: sequence

Return shape: `array`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `rows` | yes | none | `scalar`, `reference` | `once` |
| `columns` | no | 1 | `scalar`, `reference` | `once` |
| `start` | no | 1 | `scalar`, `reference` | `once` |
| `step` | no | 1 | `scalar`, `reference` | `once` |

### Signature: take-drop

Return shape: `array`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `array` | yes | none | `range`, `array`, `reference` | `once` |
| `rows` | yes | none | `scalar`, `reference` | `once` |
| `columns` | no | all | `scalar`, `reference` | `once` |

### Signature: choose-axis

Return shape: `array`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `array` | yes | none | `range`, `array`, `reference` | `once` |
| `index` | yes | none | `scalar`, `array`, `reference` | `one-or-more` |

### Signature: pv-fv-pmt

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `rate` | yes | none | `scalar`, `reference` | `once` |
| `nper` | yes | none | `scalar`, `reference` | `once` |
| `paymentOrPresentValue` | yes | none | `scalar`, `reference` | `once` |
| `futureValue` | no | 0 | `scalar`, `reference` | `once` |
| `type` | no | 0 | `scalar`, `reference` | `once` |

### Signature: npv

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `rate` | yes | none | `scalar`, `reference` | `once` |
| `value` | yes | none | `scalar`, `range`, `array`, `reference` | `one-or-more` |

### Signature: irr

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `values` | yes | none | `range`, `array`, `reference` | `once` |
| `guess` | no | 0.1 | `scalar`, `reference` | `once` |

### Signature: rate

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `nper` | yes | none | `scalar`, `reference` | `once` |
| `payment` | yes | none | `scalar`, `reference` | `once` |
| `presentValue` | yes | none | `scalar`, `reference` | `once` |
| `futureValue` | no | 0 | `scalar`, `reference` | `once` |
| `type` | no | 0 | `scalar`, `reference` | `once` |
| `guess` | no | 0.1 | `scalar`, `reference` | `once` |

### Signature: period-payment

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `rate` | yes | none | `scalar`, `reference` | `once` |
| `period` | yes | none | `scalar`, `reference` | `once` |
| `nper` | yes | none | `scalar`, `reference` | `once` |
| `presentValue` | yes | none | `scalar`, `reference` | `once` |
| `futureValue` | no | 0 | `scalar`, `reference` | `once` |
| `type` | no | 0 | `scalar`, `reference` | `once` |

### Signature: norm-dist

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `x` | yes | none | `scalar`, `reference` | `once` |
| `mean` | yes | none | `scalar`, `reference` | `once` |
| `standardDeviation` | yes | none | `scalar`, `reference` | `once` |
| `cumulative` | yes | none | `scalar`, `reference` | `once` |

### Signature: norm-inv

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `probability` | yes | none | `scalar`, `reference` | `once` |
| `mean` | yes | none | `scalar`, `reference` | `once` |
| `standardDeviation` | yes | none | `scalar`, `reference` | `once` |

### Signature: norm-s-dist

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `z` | yes | none | `scalar`, `reference` | `once` |
| `cumulative` | yes | none | `scalar`, `reference` | `once` |

### Signature: t-dist

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `x` | yes | none | `scalar`, `reference` | `once` |
| `degreesFreedom` | yes | none | `scalar`, `reference` | `once` |
| `cumulative` | yes | none | `scalar`, `reference` | `once` |

### Signature: distribution-tail

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `x` | yes | none | `scalar`, `reference` | `once` |
| `degreesFreedom` | yes | none | `scalar`, `reference` | `once` |

### Signature: distribution-inverse

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `probability` | yes | none | `scalar`, `reference` | `once` |
| `degreesFreedom` | yes | none | `scalar`, `reference` | `once` |

### Signature: f-dist

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `x` | yes | none | `scalar`, `reference` | `once` |
| `degreesFreedom1` | yes | none | `scalar`, `reference` | `once` |
| `degreesFreedom2` | yes | none | `scalar`, `reference` | `once` |
| `cumulative` | yes | none | `scalar`, `reference` | `once` |

### Signature: f-tail

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `x` | yes | none | `scalar`, `reference` | `once` |
| `degreesFreedom1` | yes | none | `scalar`, `reference` | `once` |
| `degreesFreedom2` | yes | none | `scalar`, `reference` | `once` |

### Signature: f-inverse

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `probability` | yes | none | `scalar`, `reference` | `once` |
| `degreesFreedom1` | yes | none | `scalar`, `reference` | `once` |
| `degreesFreedom2` | yes | none | `scalar`, `reference` | `once` |

### Signature: binom-dist

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `successes` | yes | none | `scalar`, `reference` | `once` |
| `trials` | yes | none | `scalar`, `reference` | `once` |
| `probability` | yes | none | `scalar`, `reference` | `once` |
| `cumulative` | yes | none | `scalar`, `reference` | `once` |

### Signature: poisson-dist

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `x` | yes | none | `scalar`, `reference` | `once` |
| `mean` | yes | none | `scalar`, `reference` | `once` |
| `cumulative` | yes | none | `scalar`, `reference` | `once` |

### Signature: expon-dist

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `x` | yes | none | `scalar`, `reference` | `once` |
| `lambda` | yes | none | `scalar`, `reference` | `once` |
| `cumulative` | yes | none | `scalar`, `reference` | `once` |

### Signature: gamma-dist

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `x` | yes | none | `scalar`, `reference` | `once` |
| `alpha` | yes | none | `scalar`, `reference` | `once` |
| `beta` | yes | none | `scalar`, `reference` | `once` |
| `cumulative` | yes | none | `scalar`, `reference` | `once` |

### Signature: gamma-inverse

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `probability` | yes | none | `scalar`, `reference` | `once` |
| `alpha` | yes | none | `scalar`, `reference` | `once` |
| `beta` | yes | none | `scalar`, `reference` | `once` |

### Signature: beta-dist

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `x` | yes | none | `scalar`, `reference` | `once` |
| `alpha` | yes | none | `scalar`, `reference` | `once` |
| `beta` | yes | none | `scalar`, `reference` | `once` |
| `cumulative` | yes | none | `scalar`, `reference` | `once` |
| `lower` | no | 0 | `scalar`, `reference` | `once` |
| `upper` | no | 1 | `scalar`, `reference` | `once` |

### Signature: beta-inverse

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `probability` | yes | none | `scalar`, `reference` | `once` |
| `alpha` | yes | none | `scalar`, `reference` | `once` |
| `beta` | yes | none | `scalar`, `reference` | `once` |
| `lower` | no | 0 | `scalar`, `reference` | `once` |
| `upper` | no | 1 | `scalar`, `reference` | `once` |

### Signature: lognorm-dist

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `x` | yes | none | `scalar`, `reference` | `once` |
| `mean` | yes | none | `scalar`, `reference` | `once` |
| `standardDeviation` | yes | none | `scalar`, `reference` | `once` |
| `cumulative` | yes | none | `scalar`, `reference` | `once` |

### Signature: lognorm-inverse

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `probability` | yes | none | `scalar`, `reference` | `once` |
| `mean` | yes | none | `scalar`, `reference` | `once` |
| `standardDeviation` | yes | none | `scalar`, `reference` | `once` |

### Signature: weibull-dist

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `x` | yes | none | `scalar`, `reference` | `once` |
| `alpha` | yes | none | `scalar`, `reference` | `once` |
| `beta` | yes | none | `scalar`, `reference` | `once` |
| `cumulative` | yes | none | `scalar`, `reference` | `once` |

### Signature: confidence

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `alpha` | yes | none | `scalar`, `reference` | `once` |
| `standardDeviation` | yes | none | `scalar`, `reference` | `once` |
| `size` | yes | none | `scalar`, `reference` | `once` |

### Signature: standardize

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `x` | yes | none | `scalar`, `reference` | `once` |
| `mean` | yes | none | `scalar`, `reference` | `once` |
| `standardDeviation` | yes | none | `scalar`, `reference` | `once` |

## Semantic profiles

These values are normative for the listed Sheetwrite subset. `function-defined` and `contextual` are explicit limitations: consult the formula guide's function-specific sections rather than assuming another spreadsheet's edge behavior.

### Semantics: scalar

| Dimension | Contract |
| --- | --- |
| shape | scalar: accepted<br />range: contextual<br />array: contextual<br />broadcast: function-defined<br />result: scalar |
| coercion | blank: zero<br />text: number-if-parseable<br />boolean: number<br />error: propagate |
| text | case: not-applicable<br />wildcard: not-applicable |
| environment | locale: invariant<br />dateSystem: not-applicable |
| numeric | tolerance: binary64<br />domain: function-defined<br />iteration: kind: none<br />maximum: none |
| calculation | dependencies: tracked<br />lazy: eager<br />spill: scalar<br />fill: relative-reference-rewrite<br />copy: relative-reference-rewrite<br />structuralRewrite: ast-reference-rewrite |
| persistence | snapshot: formula-source<br />history: formula-source<br />collaboration: formula-source<br />xlsxSource: rewrite-on-structural-edit |

### Semantics: aggregate

| Dimension | Contract |
| --- | --- |
| shape | scalar: accepted<br />range: accepted<br />array: accepted<br />broadcast: none<br />result: scalar |
| coercion | blank: ignored<br />text: ignored-in-ranges<br />boolean: ignored-in-ranges<br />error: propagate |
| text | case: not-applicable<br />wildcard: not-applicable |
| environment | locale: invariant<br />dateSystem: not-applicable |
| numeric | tolerance: binary64<br />domain: function-defined<br />iteration: kind: none<br />maximum: none |
| calculation | dependencies: tracked<br />lazy: eager<br />spill: scalar<br />fill: relative-reference-rewrite<br />copy: relative-reference-rewrite<br />structuralRewrite: ast-reference-rewrite |
| persistence | snapshot: formula-source<br />history: formula-source<br />collaboration: formula-source<br />xlsxSource: rewrite-on-structural-edit |

### Semantics: information

| Dimension | Contract |
| --- | --- |
| shape | scalar: accepted<br />range: contextual<br />array: contextual<br />broadcast: function-defined<br />result: scalar |
| coercion | blank: preserved<br />text: preserved<br />boolean: preserved<br />error: function-defined |
| text | case: not-applicable<br />wildcard: not-applicable |
| environment | locale: invariant<br />dateSystem: not-applicable |
| numeric | tolerance: exact<br />domain: all-inputs<br />iteration: kind: none<br />maximum: none |
| calculation | dependencies: tracked<br />lazy: eager<br />spill: scalar<br />fill: relative-reference-rewrite<br />copy: relative-reference-rewrite<br />structuralRewrite: ast-reference-rewrite |
| persistence | snapshot: formula-source<br />history: formula-source<br />collaboration: formula-source<br />xlsxSource: rewrite-on-structural-edit |

### Semantics: logical

| Dimension | Contract |
| --- | --- |
| shape | scalar: accepted<br />range: accepted<br />array: contextual<br />broadcast: function-defined<br />result: scalar |
| coercion | blank: false<br />text: function-defined<br />boolean: preserved<br />error: propagate |
| text | case: insensitive<br />wildcard: literal |
| environment | locale: invariant<br />dateSystem: not-applicable |
| numeric | tolerance: exact<br />domain: all-inputs<br />iteration: kind: none<br />maximum: none |
| calculation | dependencies: tracked<br />lazy: eager<br />spill: scalar<br />fill: relative-reference-rewrite<br />copy: relative-reference-rewrite<br />structuralRewrite: ast-reference-rewrite |
| persistence | snapshot: formula-source<br />history: formula-source<br />collaboration: formula-source<br />xlsxSource: rewrite-on-structural-edit |

### Semantics: lazy-control

| Dimension | Contract |
| --- | --- |
| shape | scalar: accepted<br />range: contextual<br />array: contextual<br />broadcast: function-defined<br />result: contextual |
| coercion | blank: function-defined<br />text: function-defined<br />boolean: function-defined<br />error: trap-selected |
| text | case: insensitive<br />wildcard: literal |
| environment | locale: invariant<br />dateSystem: function-defined |
| numeric | tolerance: function-defined<br />domain: function-defined<br />iteration: kind: none<br />maximum: none |
| calculation | dependencies: contextual<br />lazy: lazy-branches<br />spill: contextual<br />fill: relative-reference-rewrite<br />copy: relative-reference-rewrite<br />structuralRewrite: ast-reference-rewrite |
| persistence | snapshot: formula-source<br />history: formula-source<br />collaboration: formula-source<br />xlsxSource: rewrite-on-structural-edit |

### Semantics: let-binding

| Dimension | Contract |
| --- | --- |
| shape | scalar: accepted<br />range: accepted<br />array: accepted<br />broadcast: function-defined<br />result: contextual |
| coercion | blank: preserved<br />text: preserved<br />boolean: preserved<br />error: propagate |
| text | case: insensitive<br />wildcard: literal |
| environment | locale: invariant<br />dateSystem: function-defined |
| numeric | tolerance: function-defined<br />domain: function-defined<br />iteration: kind: none<br />maximum: none |
| calculation | dependencies: contextual<br />lazy: lazy-bindings<br />spill: contextual<br />fill: relative-reference-rewrite<br />copy: relative-reference-rewrite<br />structuralRewrite: ast-reference-rewrite |
| persistence | snapshot: formula-source<br />history: formula-source<br />collaboration: formula-source<br />xlsxSource: rewrite-on-structural-edit |

### Semantics: text

| Dimension | Contract |
| --- | --- |
| shape | scalar: accepted<br />range: contextual<br />array: contextual<br />broadcast: function-defined<br />result: scalar |
| coercion | blank: empty-text<br />text: preserved<br />boolean: preserved<br />error: propagate |
| text | case: function-defined<br />wildcard: literal |
| environment | locale: function-defined<br />dateSystem: function-defined |
| numeric | tolerance: not-applicable<br />domain: function-defined<br />iteration: kind: none<br />maximum: none |
| calculation | dependencies: tracked<br />lazy: eager<br />spill: scalar<br />fill: relative-reference-rewrite<br />copy: relative-reference-rewrite<br />structuralRewrite: ast-reference-rewrite |
| persistence | snapshot: formula-source<br />history: formula-source<br />collaboration: formula-source<br />xlsxSource: rewrite-on-structural-edit |

### Semantics: text-sensitive

| Dimension | Contract |
| --- | --- |
| shape | scalar: accepted<br />range: contextual<br />array: contextual<br />broadcast: function-defined<br />result: scalar |
| coercion | blank: empty-text<br />text: preserved<br />boolean: preserved<br />error: propagate |
| text | case: sensitive<br />wildcard: literal |
| environment | locale: invariant<br />dateSystem: not-applicable |
| numeric | tolerance: not-applicable<br />domain: function-defined<br />iteration: kind: none<br />maximum: none |
| calculation | dependencies: tracked<br />lazy: eager<br />spill: scalar<br />fill: relative-reference-rewrite<br />copy: relative-reference-rewrite<br />structuralRewrite: ast-reference-rewrite |
| persistence | snapshot: formula-source<br />history: formula-source<br />collaboration: formula-source<br />xlsxSource: rewrite-on-structural-edit |

### Semantics: text-search

| Dimension | Contract |
| --- | --- |
| shape | scalar: accepted<br />range: contextual<br />array: contextual<br />broadcast: function-defined<br />result: scalar |
| coercion | blank: empty-text<br />text: preserved<br />boolean: preserved<br />error: propagate |
| text | case: insensitive<br />wildcard: supported |
| environment | locale: invariant<br />dateSystem: not-applicable |
| numeric | tolerance: not-applicable<br />domain: function-defined<br />iteration: kind: none<br />maximum: none |
| calculation | dependencies: tracked<br />lazy: eager<br />spill: scalar<br />fill: relative-reference-rewrite<br />copy: relative-reference-rewrite<br />structuralRewrite: ast-reference-rewrite |
| persistence | snapshot: formula-source<br />history: formula-source<br />collaboration: formula-source<br />xlsxSource: rewrite-on-structural-edit |

### Semantics: criteria

| Dimension | Contract |
| --- | --- |
| shape | scalar: accepted<br />range: accepted<br />array: accepted<br />broadcast: pairwise<br />result: scalar |
| coercion | blank: function-defined<br />text: function-defined<br />boolean: function-defined<br />error: propagate |
| text | case: insensitive<br />wildcard: supported |
| environment | locale: invariant<br />dateSystem: function-defined |
| numeric | tolerance: binary64<br />domain: function-defined<br />iteration: kind: none<br />maximum: none |
| calculation | dependencies: tracked<br />lazy: eager<br />spill: scalar<br />fill: relative-reference-rewrite<br />copy: relative-reference-rewrite<br />structuralRewrite: ast-reference-rewrite |
| persistence | snapshot: formula-source<br />history: formula-source<br />collaboration: formula-source<br />xlsxSource: rewrite-on-structural-edit |

### Semantics: date-time

| Dimension | Contract |
| --- | --- |
| shape | scalar: accepted<br />range: contextual<br />array: contextual<br />broadcast: function-defined<br />result: scalar |
| coercion | blank: zero<br />text: number-if-parseable<br />boolean: number<br />error: propagate |
| text | case: insensitive<br />wildcard: literal |
| environment | locale: invariant<br />dateSystem: excel-1900 |
| numeric | tolerance: binary64<br />domain: bounded<br />iteration: kind: none<br />maximum: none |
| calculation | dependencies: tracked<br />lazy: eager<br />spill: scalar<br />fill: relative-reference-rewrite<br />copy: relative-reference-rewrite<br />structuralRewrite: ast-reference-rewrite |
| persistence | snapshot: formula-source<br />history: formula-source<br />collaboration: formula-source<br />xlsxSource: rewrite-on-structural-edit |

### Semantics: volatile-date

| Dimension | Contract |
| --- | --- |
| shape | scalar: accepted<br />range: rejected<br />array: rejected<br />broadcast: none<br />result: scalar |
| coercion | blank: preserved<br />text: preserved<br />boolean: preserved<br />error: propagate |
| text | case: not-applicable<br />wildcard: not-applicable |
| environment | locale: not-applicable<br />dateSystem: host-clock |
| numeric | tolerance: binary64<br />domain: bounded<br />iteration: kind: none<br />maximum: none |
| calculation | dependencies: none<br />lazy: not-applicable<br />spill: scalar<br />fill: source-preserved<br />copy: source-preserved<br />structuralRewrite: source-preserved |
| persistence | snapshot: formula-source<br />history: formula-source<br />collaboration: formula-source<br />xlsxSource: rewrite-on-structural-edit |

### Semantics: lookup

| Dimension | Contract |
| --- | --- |
| shape | scalar: accepted<br />range: accepted<br />array: accepted<br />broadcast: function-defined<br />result: contextual |
| coercion | blank: function-defined<br />text: function-defined<br />boolean: function-defined<br />error: propagate |
| text | case: insensitive<br />wildcard: function-defined |
| environment | locale: invariant<br />dateSystem: function-defined |
| numeric | tolerance: exact<br />domain: function-defined<br />iteration: kind: none<br />maximum: none |
| calculation | dependencies: tracked<br />lazy: eager<br />spill: contextual<br />fill: relative-reference-rewrite<br />copy: relative-reference-rewrite<br />structuralRewrite: ast-reference-rewrite |
| persistence | snapshot: formula-source<br />history: formula-source<br />collaboration: formula-source<br />xlsxSource: rewrite-on-structural-edit |

### Semantics: array

| Dimension | Contract |
| --- | --- |
| shape | scalar: contextual<br />range: accepted<br />array: accepted<br />broadcast: function-defined<br />result: array |
| coercion | blank: preserved<br />text: preserved<br />boolean: preserved<br />error: propagate |
| text | case: function-defined<br />wildcard: function-defined |
| environment | locale: invariant<br />dateSystem: function-defined |
| numeric | tolerance: function-defined<br />domain: bounded<br />iteration: kind: none<br />maximum: none |
| calculation | dependencies: tracked<br />lazy: eager<br />spill: array<br />fill: relative-reference-rewrite<br />copy: relative-reference-rewrite<br />structuralRewrite: ast-reference-rewrite |
| persistence | snapshot: formula-source<br />history: formula-source<br />collaboration: formula-source<br />xlsxSource: rewrite-on-structural-edit |

### Semantics: financial

| Dimension | Contract |
| --- | --- |
| shape | scalar: accepted<br />range: contextual<br />array: contextual<br />broadcast: function-defined<br />result: scalar |
| coercion | blank: zero<br />text: number-if-parseable<br />boolean: number<br />error: propagate |
| text | case: not-applicable<br />wildcard: not-applicable |
| environment | locale: invariant<br />dateSystem: not-applicable |
| numeric | tolerance: binary64<br />domain: bounded<br />iteration: kind: none<br />maximum: none |
| calculation | dependencies: tracked<br />lazy: eager<br />spill: scalar<br />fill: relative-reference-rewrite<br />copy: relative-reference-rewrite<br />structuralRewrite: ast-reference-rewrite |
| persistence | snapshot: formula-source<br />history: formula-source<br />collaboration: formula-source<br />xlsxSource: rewrite-on-structural-edit |

### Semantics: financial-iterative

| Dimension | Contract |
| --- | --- |
| shape | scalar: accepted<br />range: accepted<br />array: accepted<br />broadcast: none<br />result: scalar |
| coercion | blank: zero<br />text: number-if-parseable<br />boolean: number<br />error: propagate |
| text | case: not-applicable<br />wildcard: not-applicable |
| environment | locale: invariant<br />dateSystem: not-applicable |
| numeric | tolerance: binary64<br />domain: bounded<br />iteration: kind: bounded<br />maximum: 100 |
| calculation | dependencies: tracked<br />lazy: eager<br />spill: scalar<br />fill: relative-reference-rewrite<br />copy: relative-reference-rewrite<br />structuralRewrite: ast-reference-rewrite |
| persistence | snapshot: formula-source<br />history: formula-source<br />collaboration: formula-source<br />xlsxSource: rewrite-on-structural-edit |

### Semantics: analysis-distributions

| Dimension | Contract |
| --- | --- |
| shape | scalar: accepted<br />range: contextual<br />array: contextual<br />broadcast: none<br />result: scalar |
| coercion | blank: zero<br />text: number-if-parseable<br />boolean: number<br />error: propagate |
| text | case: not-applicable<br />wildcard: not-applicable |
| environment | locale: invariant<br />dateSystem: not-applicable |
| numeric | tolerance: binary64<br />domain: bounded<br />iteration: kind: function-defined<br />maximum: none |
| calculation | dependencies: tracked<br />lazy: eager<br />spill: scalar<br />fill: relative-reference-rewrite<br />copy: relative-reference-rewrite<br />structuralRewrite: ast-reference-rewrite |
| persistence | snapshot: formula-source<br />history: formula-source<br />collaboration: formula-source<br />xlsxSource: rewrite-on-structural-edit |

## Dialect profiles

### Dialect: excel-documented

| Dialect | Status |
| --- | --- |
| Microsoft Excel | documented |
| Google Sheets | unverified |
| OpenFormula | unverified |

Limitations: Google Sheets and OpenFormula results require producer evidence before compatibility is claimed.

### Dialect: analysis-distributions

| Dialect | Status |
| --- | --- |
| Microsoft Excel | documented |
| Google Sheets | unverified |
| OpenFormula | unverified |

Limitations: Available only in the optional @sheetwrite/formulas analysis build; default @sheetwrite/wasm returns #NAME?. Scalar binary64 evaluation, not array broadcasting or blanket spreadsheet parity. Domain validation and finite numerical convergence may return #NUM!.

## Implementation profiles

### Implementation: implemented-assisted

| Layer | Status and source/evidence |
| --- | --- |
| Parser | implemented<br />[`packages/wasm/src/calc.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/calc.rs) |
| Evaluator | implemented<br />[`packages/wasm/src/eval/mod.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/eval/mod.rs)<br />[`packages/wasm/src/eval/functions.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/eval/functions.rs) |
| Formula assist | implemented<br />[`packages/core/src/formula-assist.ts`](https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/formula-assist.ts) |
| Evidence | source-linked<br />[`packages/wasm/src/tests.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/tests.rs)<br />[`packages/core/test/formula-assist.test.ts`](https://github.com/chh-ay/sheetwrite/blob/main/packages/core/test/formula-assist.test.ts) |

### Implementation: parser-assisted-evaluator-declared

| Layer | Status and source/evidence |
| --- | --- |
| Parser | implemented<br />[`packages/wasm/src/calc.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/calc.rs) |
| Evaluator | declared |
| Formula assist | implemented<br />[`packages/core/src/formula-assist.ts`](https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/formula-assist.ts) |
| Evidence | source-linked<br />[`packages/core/src/formula-assist.ts`](https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/formula-assist.ts) |

### Implementation: parser-declared-target

| Layer | Status and source/evidence |
| --- | --- |
| Parser | implemented<br />[`packages/wasm/src/calc.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/calc.rs) |
| Evaluator | declared |
| Formula assist | missing<br />[`packages/core/src/formula-assist.ts`](https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/formula-assist.ts) |
| Evidence | registration-tested<br />[`scripts/formula-contract.test.ts`](https://github.com/chh-ay/sheetwrite/blob/main/scripts/formula-contract.test.ts) |

### Implementation: analysis-distributions

| Layer | Status and source/evidence |
| --- | --- |
| Parser | implemented<br />[`packages/wasm/src/calc.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/calc.rs) |
| Evaluator | implemented<br />[`packages/wasm/src/eval/analysis/distributions.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/eval/analysis/distributions.rs) |
| Formula assist | implemented<br />[`packages/core/src/formula-assist.ts`](https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/formula-assist.ts) |
| Evidence | source-linked<br />[`scripts/formula-contract.test.ts`](https://github.com/chh-ay/sheetwrite/blob/main/scripts/formula-contract.test.ts) |

## Unsupported categories

Unknown functions retain their source and evaluate to `#NAME?`; Sheetwrite does not silently execute a network, custom-code, or compatibility fallback.

| Category | Scope | Examples | Source | Evidence |
| --- | --- | --- | --- | --- |
| **Volatile recalculation** (`volatile`) | Automatic volatility semantics beyond the existing clock functions are outside the supported contract. | `INDIRECT`, `OFFSET`, `RAND`, `RANDBETWEEN`, `RANDARRAY` | [Math and trigonometry functions](https://support.microsoft.com/en-us/office/excel-functions-by-category-5f91f4e9-7b42-46d2-9bd1-63f26a86c0eb) | [`scripts/formula-contract.test.ts`](https://github.com/chh-ay/sheetwrite/blob/main/scripts/formula-contract.test.ts) |
| **Network functions** (`network`) | Formula evaluation never performs network requests. | `ENCODEURL`, `FILTERXML`, `IMAGE`, `WEBSERVICE` | [Web functions](https://support.microsoft.com/en-us/office/excel-functions-by-category-5f91f4e9-7b42-46d2-9bd1-63f26a86c0eb) | [`scripts/formula-contract.test.ts`](https://github.com/chh-ay/sheetwrite/blob/main/scripts/formula-contract.test.ts) |
| **External data functions** (`external`) | Functions that query external providers or live data connections are not evaluated. | `GOOGLEFINANCE`, `IMPORTDATA`, `IMPORTHTML`, `IMPORTXML`, `RTD` | [Add-in and Automation functions](https://support.microsoft.com/en-us/office/excel-functions-by-category-5f91f4e9-7b42-46d2-9bd1-63f26a86c0eb) | [`scripts/formula-contract.test.ts`](https://github.com/chh-ay/sheetwrite/blob/main/scripts/formula-contract.test.ts) |
| **Database functions** (`database`) | D-prefixed database aggregation functions are not evaluated. | `DAVERAGE`, `DCOUNT`, `DGET`, `DSUM`, `DVAR` | [Database functions](https://support.microsoft.com/en-us/office/excel-functions-by-category-5f91f4e9-7b42-46d2-9bd1-63f26a86c0eb) | [`scripts/formula-contract.test.ts`](https://github.com/chh-ay/sheetwrite/blob/main/scripts/formula-contract.test.ts) |
| **Cube functions** (`cube`) | OLAP cube members, sets, and values are not resolved. | `CUBEMEMBER`, `CUBESET`, `CUBEVALUE` | [Cube functions](https://support.microsoft.com/en-us/office/excel-functions-by-category-5f91f4e9-7b42-46d2-9bd1-63f26a86c0eb) | [`scripts/formula-contract.test.ts`](https://github.com/chh-ay/sheetwrite/blob/main/scripts/formula-contract.test.ts) |
| **LAMBDA and higher-order functions** (`lambda`) | User-defined lambdas and higher-order array execution are not evaluated. | `BYCOL`, `BYROW`, `LAMBDA`, `MAKEARRAY`, `MAP`, `REDUCE`, `SCAN` | [Logical functions](https://support.microsoft.com/en-us/office/excel-functions-by-category-5f91f4e9-7b42-46d2-9bd1-63f26a86c0eb) | [`scripts/formula-contract.test.ts`](https://github.com/chh-ay/sheetwrite/blob/main/scripts/formula-contract.test.ts) |
| **Arbitrary external workbook references** (`external-workbook`) | References to arbitrary workbook files are not loaded or dereferenced. | `'[Book.xlsx]Sheet1'!A1` | [Lookup and reference functions](https://support.microsoft.com/en-us/office/excel-functions-by-category-5f91f4e9-7b42-46d2-9bd1-63f26a86c0eb) | [`scripts/formula-contract.test.ts`](https://github.com/chh-ay/sheetwrite/blob/main/scripts/formula-contract.test.ts) |

In particular, automatic volatile functions beyond the explicit host-clock barrier, network/external-data functions, arbitrary external workbook links, database functions, cube/OLAP functions, and `LAMBDA`/higher-order execution are unsupported. `TODAY` and `NOW` are the documented clock-function exception; `LET` is supported and is not a `LAMBDA` fallback.
