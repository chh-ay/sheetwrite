---
title: "Formula function contract"
description: "Generated, source-linked formula names, signatures, semantics, dialect status, and unsupported boundaries."
---

# Formula function contract

This page is generated from the checked version 1 `sheetwrite.formula-capabilities` inventory. It publishes **100 required-supported target functions**, **54 incumbent functions**, and **145 optional analysis functions** (299 canonical functions total) without maintaining a second name list. Aliases share their canonical function's build availability.

A function's presence means only the signature and semantic profiles linked in its row. Microsoft Excel documentation supplies the naming/family taxonomy; it is not a blanket Excel claim. Google Sheets and OpenFormula behavior is unverified unless a dialect profile says otherwise.

## Engine builds

- `@sheetwrite/wasm` is the default engine. In the function tables, the Engine column shows `default, full` for a function in both engines and `full` for a function in `@sheetwrite/formulas` only.
- `@sheetwrite/formulas` is the full engine. It adds the analysis families marked below: distributions and statistics, regression, finance, dates, text and regex, database, math and matrices, reshaping, LAMBDA helpers, and grouping. Select it before creating any stores: `import * as formulas from "@sheetwrite/formulas"; await initSheetwrite(undefined, formulas);`.
- The active engine's registered names drive formula assist. Optional names are not suggested by the default engine and evaluate to `#NAME?` there; merely importing the optional package does not enable them.
- Numeric functions use binary64 arithmetic with function-specific domains and bounded numerical algorithms. The inventory does not claim unlimited tail accuracy or complete Excel/Google Sheets/OpenFormula parity.

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

| Function (aliases) | Engine | Contract | Signature | Semantics | Dialect | Implementation |
| --- | --- | --- | --- | --- | --- | --- |
| `FILTER` | default, full | incumbent | [`filter`](#signature-filter) | [`array`](#semantics-array) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `SORT` | default, full | incumbent | [`sort`](#signature-sort) | [`array`](#semantics-array) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `UNIQUE` | default, full | incumbent | [`unique`](#signature-unique) | [`array`](#semantics-array) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `TRANSPOSE` | default, full | required target | [`array-unary`](#signature-array-unary) | [`array`](#semantics-array) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `SEQUENCE` | default, full | required target | [`sequence`](#signature-sequence) | [`array`](#semantics-array) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `TAKE` | default, full | required target | [`take-drop`](#signature-take-drop) | [`array`](#semantics-array) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `DROP` | default, full | required target | [`take-drop`](#signature-take-drop) | [`array`](#semantics-array) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `CHOOSECOLS` | default, full | required target | [`choose-axis`](#signature-choose-axis) | [`array`](#semantics-array) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `CHOOSEROWS` | default, full | required target | [`choose-axis`](#signature-choose-axis) | [`array`](#semantics-array) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `EXPAND` | full | optional analysis | [`reshape-expand`](#signature-reshape-expand) | [`array`](#semantics-array) | [`excel-documented`](#dialect-excel-documented) | [`analysis-reshape`](#implementation-analysis-reshape) |
| `HSTACK` | full | optional analysis | [`reshape-stack`](#signature-reshape-stack) | [`array`](#semantics-array) | [`excel-documented`](#dialect-excel-documented) | [`analysis-reshape`](#implementation-analysis-reshape) |
| `SORTBY` | full | optional analysis | [`sort-by`](#signature-sort-by) | [`array`](#semantics-array) | [`excel-documented`](#dialect-excel-documented) | [`analysis-reshape`](#implementation-analysis-reshape) |
| `TOCOL` | full | optional analysis | [`reshape-flatten`](#signature-reshape-flatten) | [`array`](#semantics-array) | [`excel-documented`](#dialect-excel-documented) | [`analysis-reshape`](#implementation-analysis-reshape) |
| `TOROW` | full | optional analysis | [`reshape-flatten`](#signature-reshape-flatten) | [`array`](#semantics-array) | [`excel-documented`](#dialect-excel-documented) | [`analysis-reshape`](#implementation-analysis-reshape) |
| `VSTACK` | full | optional analysis | [`reshape-stack`](#signature-reshape-stack) | [`array`](#semantics-array) | [`excel-documented`](#dialect-excel-documented) | [`analysis-reshape`](#implementation-analysis-reshape) |
| `WRAPCOLS` | full | optional analysis | [`reshape-wrap`](#signature-reshape-wrap) | [`array`](#semantics-array) | [`excel-documented`](#dialect-excel-documented) | [`analysis-reshape`](#implementation-analysis-reshape) |
| `WRAPROWS` | full | optional analysis | [`reshape-wrap`](#signature-reshape-wrap) | [`array`](#semantics-array) | [`excel-documented`](#dialect-excel-documented) | [`analysis-reshape`](#implementation-analysis-reshape) |
| `GROUPBY` | full | optional analysis | [`groupby-groupby`](#signature-groupby-groupby) | [`analysis-groupby`](#semantics-analysis-groupby) | [`analysis-groupby`](#dialect-analysis-groupby) | [`analysis-groupby`](#implementation-analysis-groupby) |
| `PIVOTBY` | full | optional analysis | [`groupby-pivotby`](#signature-groupby-pivotby) | [`analysis-groupby`](#semantics-analysis-groupby) | [`analysis-groupby`](#dialect-analysis-groupby) | [`analysis-groupby`](#implementation-analysis-groupby) |
| `PERCENTOF` | full | optional analysis | [`groupby-percentof`](#signature-groupby-percentof) | [`analysis-groupby`](#semantics-analysis-groupby) | [`analysis-groupby`](#dialect-analysis-groupby) | [`analysis-groupby`](#implementation-analysis-groupby) |

### Date and time

Taxonomy/source: [Date and time functions](https://support.microsoft.com/en-us/office/excel-functions-by-category-5f91f4e9-7b42-46d2-9bd1-63f26a86c0eb).

| Function (aliases) | Engine | Contract | Signature | Semantics | Dialect | Implementation |
| --- | --- | --- | --- | --- | --- | --- |
| `DATE` | default, full | incumbent | [`date-three`](#signature-date-three) | [`date-time`](#semantics-date-time) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `DATEVALUE` | default, full | incumbent | [`unary-value`](#signature-unary-value) | [`date-time`](#semantics-date-time) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `DAY` | default, full | incumbent | [`unary-number`](#signature-unary-number) | [`date-time`](#semantics-date-time) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `MONTH` | default, full | incumbent | [`unary-number`](#signature-unary-number) | [`date-time`](#semantics-date-time) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `YEAR` | default, full | incumbent | [`unary-number`](#signature-unary-number) | [`date-time`](#semantics-date-time) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `TODAY` | default, full | incumbent | [`zero`](#signature-zero) | [`volatile-date`](#semantics-volatile-date) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `NOW` | default, full | incumbent | [`zero`](#signature-zero) | [`volatile-date`](#semantics-volatile-date) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `TIME` | default, full | required target | [`date-three`](#signature-date-three) | [`date-time`](#semantics-date-time) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `TIMEVALUE` | default, full | required target | [`unary-value`](#signature-unary-value) | [`date-time`](#semantics-date-time) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `HOUR` | default, full | required target | [`unary-value`](#signature-unary-value) | [`date-time`](#semantics-date-time) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `MINUTE` | default, full | required target | [`unary-value`](#signature-unary-value) | [`date-time`](#semantics-date-time) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `SECOND` | default, full | required target | [`unary-value`](#signature-unary-value) | [`date-time`](#semantics-date-time) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `DAYS` | default, full | required target | [`date-pair`](#signature-date-pair) | [`date-time`](#semantics-date-time) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `EDATE` | default, full | required target | [`date-offset`](#signature-date-offset) | [`date-time`](#semantics-date-time) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `EOMONTH` | default, full | required target | [`date-offset`](#signature-date-offset) | [`date-time`](#semantics-date-time) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `WEEKDAY` | default, full | required target | [`weekday-weeknum`](#signature-weekday-weeknum) | [`date-time`](#semantics-date-time) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `WEEKNUM` | default, full | required target | [`weekday-weeknum`](#signature-weekday-weeknum) | [`date-time`](#semantics-date-time) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `WORKDAY` | default, full | required target | [`workday`](#signature-workday) | [`date-time`](#semantics-date-time) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `NETWORKDAYS` | default, full | required target | [`networkdays`](#signature-networkdays) | [`date-time`](#semantics-date-time) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `YEARFRAC` | default, full | required target | [`yearfrac-days360`](#signature-yearfrac-days360) | [`date-time`](#semantics-date-time) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `DAYS360` | default, full | required target | [`yearfrac-days360`](#signature-yearfrac-days360) | [`date-time`](#semantics-date-time) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `DATEDIF` | full | optional analysis | [`datedif`](#signature-datedif) | [`date-time`](#semantics-date-time) | [`excel-documented`](#dialect-excel-documented) | [`analysis-dates`](#implementation-analysis-dates) |
| `ISOWEEKNUM` | full | optional analysis | [`unary-number`](#signature-unary-number) | [`date-time`](#semantics-date-time) | [`excel-documented`](#dialect-excel-documented) | [`analysis-dates`](#implementation-analysis-dates) |
| `NETWORKDAYS.INTL` | full | optional analysis | [`calendar-intl`](#signature-calendar-intl) | [`date-time`](#semantics-date-time) | [`excel-documented`](#dialect-excel-documented) | [`analysis-dates`](#implementation-analysis-dates) |
| `WORKDAY.INTL` | full | optional analysis | [`calendar-intl`](#signature-calendar-intl) | [`date-time`](#semantics-date-time) | [`excel-documented`](#dialect-excel-documented) | [`analysis-dates`](#implementation-analysis-dates) |

### Financial

Taxonomy/source: [Financial functions](https://support.microsoft.com/en-us/office/excel-functions-by-category-5f91f4e9-7b42-46d2-9bd1-63f26a86c0eb).

| Function (aliases) | Engine | Contract | Signature | Semantics | Dialect | Implementation |
| --- | --- | --- | --- | --- | --- | --- |
| `PV` | default, full | required target | [`pv-fv-pmt`](#signature-pv-fv-pmt) | [`financial`](#semantics-financial) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `FV` | default, full | required target | [`pv-fv-pmt`](#signature-pv-fv-pmt) | [`financial`](#semantics-financial) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `PMT` | default, full | required target | [`pv-fv-pmt`](#signature-pv-fv-pmt) | [`financial`](#semantics-financial) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `NPV` | default, full | required target | [`npv`](#signature-npv) | [`financial`](#semantics-financial) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `IRR` | default, full | required target | [`irr`](#signature-irr) | [`financial-iterative`](#semantics-financial-iterative) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `RATE` | default, full | required target | [`rate`](#signature-rate) | [`financial-iterative`](#semantics-financial-iterative) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `IPMT` | default, full | required target | [`period-payment`](#signature-period-payment) | [`financial`](#semantics-financial) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `PPMT` | default, full | required target | [`period-payment`](#signature-period-payment) | [`financial`](#semantics-financial) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `CUMIPMT` | full | optional analysis | [`cumulative-payment`](#signature-cumulative-payment) | [`financial`](#semantics-financial) | [`excel-documented`](#dialect-excel-documented) | [`analysis-finance`](#implementation-analysis-finance) |
| `CUMPRINC` | full | optional analysis | [`cumulative-payment`](#signature-cumulative-payment) | [`financial`](#semantics-financial) | [`excel-documented`](#dialect-excel-documented) | [`analysis-finance`](#implementation-analysis-finance) |
| `DB` | full | optional analysis | [`db`](#signature-db) | [`financial`](#semantics-financial) | [`excel-documented`](#dialect-excel-documented) | [`analysis-finance`](#implementation-analysis-finance) |
| `DDB` | full | optional analysis | [`ddb`](#signature-ddb) | [`financial`](#semantics-financial) | [`excel-documented`](#dialect-excel-documented) | [`analysis-finance`](#implementation-analysis-finance) |
| `EFFECT` | full | optional analysis | [`binary-number`](#signature-binary-number) | [`financial`](#semantics-financial) | [`excel-documented`](#dialect-excel-documented) | [`analysis-finance`](#implementation-analysis-finance) |
| `FVSCHEDULE` | full | optional analysis | [`fvschedule`](#signature-fvschedule) | [`financial`](#semantics-financial) | [`excel-documented`](#dialect-excel-documented) | [`analysis-finance`](#implementation-analysis-finance) |
| `MIRR` | full | optional analysis | [`mirr`](#signature-mirr) | [`financial`](#semantics-financial) | [`excel-documented`](#dialect-excel-documented) | [`analysis-finance`](#implementation-analysis-finance) |
| `NOMINAL` | full | optional analysis | [`binary-number`](#signature-binary-number) | [`financial`](#semantics-financial) | [`excel-documented`](#dialect-excel-documented) | [`analysis-finance`](#implementation-analysis-finance) |
| `NPER` | full | optional analysis | [`nper`](#signature-nper) | [`financial`](#semantics-financial) | [`excel-documented`](#dialect-excel-documented) | [`analysis-finance`](#implementation-analysis-finance) |
| `PDURATION` | full | optional analysis | [`pduration`](#signature-pduration) | [`financial`](#semantics-financial) | [`excel-documented`](#dialect-excel-documented) | [`analysis-finance`](#implementation-analysis-finance) |
| `RRI` | full | optional analysis | [`rri`](#signature-rri) | [`financial`](#semantics-financial) | [`excel-documented`](#dialect-excel-documented) | [`analysis-finance`](#implementation-analysis-finance) |
| `SLN` | full | optional analysis | [`sln`](#signature-sln) | [`financial`](#semantics-financial) | [`excel-documented`](#dialect-excel-documented) | [`analysis-finance`](#implementation-analysis-finance) |
| `SYD` | full | optional analysis | [`syd`](#signature-syd) | [`financial`](#semantics-financial) | [`excel-documented`](#dialect-excel-documented) | [`analysis-finance`](#implementation-analysis-finance) |
| `XIRR` | full | optional analysis | [`xirr`](#signature-xirr) | [`financial-iterative`](#semantics-financial-iterative) | [`excel-documented`](#dialect-excel-documented) | [`analysis-finance`](#implementation-analysis-finance) |
| `XNPV` | full | optional analysis | [`xnpv`](#signature-xnpv) | [`financial`](#semantics-financial) | [`excel-documented`](#dialect-excel-documented) | [`analysis-finance`](#implementation-analysis-finance) |

### Information and error

Taxonomy/source: [Information functions](https://support.microsoft.com/en-us/office/excel-functions-by-category-5f91f4e9-7b42-46d2-9bd1-63f26a86c0eb).

| Function (aliases) | Engine | Contract | Signature | Semantics | Dialect | Implementation |
| --- | --- | --- | --- | --- | --- | --- |
| `IFERROR` | default, full | incumbent | [`if-error`](#signature-if-error) | [`lazy-control`](#semantics-lazy-control) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `IFNA` | default, full | required target | [`if-error`](#signature-if-error) | [`lazy-control`](#semantics-lazy-control) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `ISBLANK` | default, full | required target | [`unary-value`](#signature-unary-value) | [`information`](#semantics-information) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `ISNUMBER` | default, full | required target | [`unary-value`](#signature-unary-value) | [`information`](#semantics-information) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `ISTEXT` | default, full | required target | [`unary-value`](#signature-unary-value) | [`information`](#semantics-information) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `ISLOGICAL` | default, full | required target | [`unary-value`](#signature-unary-value) | [`information`](#semantics-information) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `ISERROR` | default, full | required target | [`unary-value`](#signature-unary-value) | [`information`](#semantics-information) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `ISERR` | default, full | required target | [`unary-value`](#signature-unary-value) | [`information`](#semantics-information) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `ISNA` | default, full | required target | [`unary-value`](#signature-unary-value) | [`information`](#semantics-information) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `TYPE` | default, full | required target | [`unary-value`](#signature-unary-value) | [`information`](#semantics-information) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `N` | default, full | required target | [`unary-value`](#signature-unary-value) | [`information`](#semantics-information) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `T` | default, full | required target | [`unary-value`](#signature-unary-value) | [`information`](#semantics-information) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `NA` | default, full | incumbent | [`zero`](#signature-zero) | [`information`](#semantics-information) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `ISOMITTED` | full | optional analysis | [`lambda-isomitted`](#signature-lambda-isomitted) | [`analysis-lambda`](#semantics-analysis-lambda) | [`analysis-lambda`](#dialect-analysis-lambda) | [`analysis-lambda`](#implementation-analysis-lambda) |

### Logical and control flow

Taxonomy/source: [Logical functions](https://support.microsoft.com/en-us/office/excel-functions-by-category-5f91f4e9-7b42-46d2-9bd1-63f26a86c0eb).

| Function (aliases) | Engine | Contract | Signature | Semantics | Dialect | Implementation |
| --- | --- | --- | --- | --- | --- | --- |
| `IF` | default, full | incumbent | [`if`](#signature-if) | [`lazy-control`](#semantics-lazy-control) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `AND` | default, full | incumbent | [`logical-variadic`](#signature-logical-variadic) | [`logical`](#semantics-logical) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `OR` | default, full | incumbent | [`logical-variadic`](#signature-logical-variadic) | [`logical`](#semantics-logical) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `NOT` | default, full | incumbent | [`unary-value`](#signature-unary-value) | [`logical`](#semantics-logical) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `IFS` | default, full | required target | [`ifs`](#signature-ifs) | [`lazy-control`](#semantics-lazy-control) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `SWITCH` | default, full | required target | [`switch`](#signature-switch) | [`lazy-control`](#semantics-lazy-control) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `XOR` | default, full | required target | [`logical-variadic`](#signature-logical-variadic) | [`logical`](#semantics-logical) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `TRUE` | default, full | required target | [`zero`](#signature-zero) | [`logical`](#semantics-logical) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `FALSE` | default, full | required target | [`zero`](#signature-zero) | [`logical`](#semantics-logical) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `LET` | default, full | required target | [`let`](#signature-let) | [`let-binding`](#semantics-let-binding) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `LAMBDA` | full | optional analysis | [`lambda-lambda`](#signature-lambda-lambda) | [`analysis-lambda`](#semantics-analysis-lambda) | [`analysis-lambda`](#dialect-analysis-lambda) | [`analysis-lambda`](#implementation-analysis-lambda) |
| `MAP` | full | optional analysis | [`lambda-map`](#signature-lambda-map) | [`analysis-lambda`](#semantics-analysis-lambda) | [`analysis-lambda`](#dialect-analysis-lambda) | [`analysis-lambda`](#implementation-analysis-lambda) |
| `REDUCE` | full | optional analysis | [`lambda-reduce`](#signature-lambda-reduce) | [`analysis-lambda`](#semantics-analysis-lambda) | [`analysis-lambda`](#dialect-analysis-lambda) | [`analysis-lambda`](#implementation-analysis-lambda) |
| `SCAN` | full | optional analysis | [`lambda-scan`](#signature-lambda-scan) | [`analysis-lambda`](#semantics-analysis-lambda) | [`analysis-lambda`](#dialect-analysis-lambda) | [`analysis-lambda`](#implementation-analysis-lambda) |
| `BYROW` | full | optional analysis | [`lambda-byrow`](#signature-lambda-byrow) | [`analysis-lambda`](#semantics-analysis-lambda) | [`analysis-lambda`](#dialect-analysis-lambda) | [`analysis-lambda`](#implementation-analysis-lambda) |
| `BYCOL` | full | optional analysis | [`lambda-bycol`](#signature-lambda-bycol) | [`analysis-lambda`](#semantics-analysis-lambda) | [`analysis-lambda`](#dialect-analysis-lambda) | [`analysis-lambda`](#implementation-analysis-lambda) |
| `MAKEARRAY` | full | optional analysis | [`lambda-makearray`](#signature-lambda-makearray) | [`analysis-lambda`](#semantics-analysis-lambda) | [`analysis-lambda`](#dialect-analysis-lambda) | [`analysis-lambda`](#implementation-analysis-lambda) |

### Lookup and reference

Taxonomy/source: [Lookup and reference functions](https://support.microsoft.com/en-us/office/excel-functions-by-category-5f91f4e9-7b42-46d2-9bd1-63f26a86c0eb).

| Function (aliases) | Engine | Contract | Signature | Semantics | Dialect | Implementation |
| --- | --- | --- | --- | --- | --- | --- |
| `INDEX` | default, full | incumbent | [`index`](#signature-index) | [`lookup`](#semantics-lookup) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `MATCH` | default, full | incumbent | [`match`](#signature-match) | [`lookup`](#semantics-lookup) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `VLOOKUP` | default, full | incumbent | [`table-lookup`](#signature-table-lookup) | [`lookup`](#semantics-lookup) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `HLOOKUP` | default, full | incumbent | [`table-lookup`](#signature-table-lookup) | [`lookup`](#semantics-lookup) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `XLOOKUP` | default, full | incumbent | [`xlookup`](#signature-xlookup) | [`lookup`](#semantics-lookup) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `XMATCH` | default, full | required target | [`xmatch`](#signature-xmatch) | [`lookup`](#semantics-lookup) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `CHOOSE` | default, full | required target | [`choose`](#signature-choose) | [`lookup`](#semantics-lookup) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `ROW` | default, full | required target | [`optional-reference`](#signature-optional-reference) | [`lookup`](#semantics-lookup) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `ROWS` | default, full | required target | [`unary-value`](#signature-unary-value) | [`lookup`](#semantics-lookup) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `COLUMN` | default, full | required target | [`optional-reference`](#signature-optional-reference) | [`lookup`](#semantics-lookup) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `COLUMNS` | default, full | required target | [`unary-value`](#signature-unary-value) | [`lookup`](#semantics-lookup) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `ADDRESS` | default, full | required target | [`address`](#signature-address) | [`lookup`](#semantics-lookup) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |

### Math and trigonometry

Taxonomy/source: [Math and trigonometry functions](https://support.microsoft.com/en-us/office/excel-functions-by-category-5f91f4e9-7b42-46d2-9bd1-63f26a86c0eb).

| Function (aliases) | Engine | Contract | Signature | Semantics | Dialect | Implementation |
| --- | --- | --- | --- | --- | --- | --- |
| `SUM` | default, full | incumbent | [`optional-variadic-values`](#signature-optional-variadic-values) | [`aggregate`](#semantics-aggregate) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `ABS` | default, full | incumbent | [`unary-number`](#signature-unary-number) | [`scalar`](#semantics-scalar) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `ROUND` | default, full | incumbent | [`round`](#signature-round) | [`scalar`](#semantics-scalar) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `SQRT` | default, full | incumbent | [`unary-number`](#signature-unary-number) | [`scalar`](#semantics-scalar) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `MOD` | default, full | incumbent | [`binary-number`](#signature-binary-number) | [`scalar`](#semantics-scalar) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `POW` | default, full | incumbent | [`binary-number`](#signature-binary-number) | [`scalar`](#semantics-scalar) | [`excel-documented`](#dialect-excel-documented) | [`parser-assisted-evaluator-declared`](#implementation-parser-assisted-evaluator-declared) |
| `FLOOR` | default, full | incumbent | [`binary-number`](#signature-binary-number) | [`scalar`](#semantics-scalar) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `CEILING` | default, full | incumbent | [`binary-number`](#signature-binary-number) | [`scalar`](#semantics-scalar) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `INT` | default, full | incumbent | [`unary-number`](#signature-unary-number) | [`scalar`](#semantics-scalar) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `TRUNC` | default, full | incumbent | [`trunc`](#signature-trunc) | [`scalar`](#semantics-scalar) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `SIGN` | default, full | incumbent | [`unary-number`](#signature-unary-number) | [`scalar`](#semantics-scalar) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `PI` | default, full | incumbent | [`zero`](#signature-zero) | [`scalar`](#semantics-scalar) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `SUMIF` | default, full | incumbent | [`sumif`](#signature-sumif) | [`criteria`](#semantics-criteria) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `SUMIFS` | default, full | incumbent | [`sumifs`](#signature-sumifs) | [`criteria`](#semantics-criteria) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `PRODUCT` | default, full | required target | [`variadic-values`](#signature-variadic-values) | [`aggregate`](#semantics-aggregate) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `SUMPRODUCT` | default, full | required target | [`variadic-values`](#signature-variadic-values) | [`aggregate`](#semantics-aggregate) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `POWER` | default, full | required target | [`binary-number`](#signature-binary-number) | [`scalar`](#semantics-scalar) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `EXP` | default, full | required target | [`unary-number`](#signature-unary-number) | [`scalar`](#semantics-scalar) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `LN` | default, full | required target | [`unary-number`](#signature-unary-number) | [`scalar`](#semantics-scalar) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `LOG` | default, full | required target | [`log`](#signature-log) | [`scalar`](#semantics-scalar) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `LOG10` | default, full | required target | [`unary-number`](#signature-unary-number) | [`scalar`](#semantics-scalar) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `ROUNDUP` | default, full | required target | [`round`](#signature-round) | [`scalar`](#semantics-scalar) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `ROUNDDOWN` | default, full | required target | [`round`](#signature-round) | [`scalar`](#semantics-scalar) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `MROUND` | default, full | required target | [`binary-number`](#signature-binary-number) | [`scalar`](#semantics-scalar) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `EVEN` | default, full | required target | [`unary-number`](#signature-unary-number) | [`scalar`](#semantics-scalar) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `ODD` | default, full | required target | [`unary-number`](#signature-unary-number) | [`scalar`](#semantics-scalar) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `QUOTIENT` | default, full | required target | [`binary-number`](#signature-binary-number) | [`scalar`](#semantics-scalar) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `GCD` | default, full | required target | [`variadic-values`](#signature-variadic-values) | [`aggregate`](#semantics-aggregate) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `LCM` | default, full | required target | [`variadic-values`](#signature-variadic-values) | [`aggregate`](#semantics-aggregate) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `SUBTOTAL` | default, full | required target | [`subtotal`](#signature-subtotal) | [`aggregate`](#semantics-aggregate) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `AGGREGATE` | full | optional analysis | [`aggregate`](#signature-aggregate) | [`analysis-math`](#semantics-analysis-math) | [`analysis-math`](#dialect-analysis-math) | [`analysis-math`](#implementation-analysis-math) |
| `CEILING.MATH` | full | optional analysis | [`round-math`](#signature-round-math) | [`analysis-math`](#semantics-analysis-math) | [`analysis-math`](#dialect-analysis-math) | [`analysis-math`](#implementation-analysis-math) |
| `COMBIN` | full | optional analysis | [`binary-number`](#signature-binary-number) | [`analysis-math`](#semantics-analysis-math) | [`analysis-math`](#dialect-analysis-math) | [`analysis-math`](#implementation-analysis-math) |
| `COMBINA` | full | optional analysis | [`binary-number`](#signature-binary-number) | [`analysis-math`](#semantics-analysis-math) | [`analysis-math`](#dialect-analysis-math) | [`analysis-math`](#implementation-analysis-math) |
| `FACT` | full | optional analysis | [`unary-number`](#signature-unary-number) | [`analysis-math`](#semantics-analysis-math) | [`analysis-math`](#dialect-analysis-math) | [`analysis-math`](#implementation-analysis-math) |
| `FACTDOUBLE` | full | optional analysis | [`unary-number`](#signature-unary-number) | [`analysis-math`](#semantics-analysis-math) | [`analysis-math`](#dialect-analysis-math) | [`analysis-math`](#implementation-analysis-math) |
| `FLOOR.MATH` | full | optional analysis | [`round-math`](#signature-round-math) | [`analysis-math`](#semantics-analysis-math) | [`analysis-math`](#dialect-analysis-math) | [`analysis-math`](#implementation-analysis-math) |
| `MDETERM` | full | optional analysis | [`array-unary`](#signature-array-unary) | [`analysis-math`](#semantics-analysis-math) | [`analysis-math`](#dialect-analysis-math) | [`analysis-math`](#implementation-analysis-math) |
| `MINVERSE` | full | optional analysis | [`matrix-unary`](#signature-matrix-unary) | [`analysis-math`](#semantics-analysis-math) | [`analysis-math`](#dialect-analysis-math) | [`analysis-math`](#implementation-analysis-math) |
| `MMULT` | full | optional analysis | [`matrix-pair`](#signature-matrix-pair) | [`analysis-math`](#semantics-analysis-math) | [`analysis-math`](#dialect-analysis-math) | [`analysis-math`](#implementation-analysis-math) |
| `MULTINOMIAL` | full | optional analysis | [`variadic-values`](#signature-variadic-values) | [`analysis-math`](#semantics-analysis-math) | [`analysis-math`](#dialect-analysis-math) | [`analysis-math`](#implementation-analysis-math) |
| `MUNIT` | full | optional analysis | [`matrix-unit`](#signature-matrix-unit) | [`analysis-math`](#semantics-analysis-math) | [`analysis-math`](#dialect-analysis-math) | [`analysis-math`](#implementation-analysis-math) |
| `PERMUT` | full | optional analysis | [`binary-number`](#signature-binary-number) | [`analysis-math`](#semantics-analysis-math) | [`analysis-math`](#dialect-analysis-math) | [`analysis-math`](#implementation-analysis-math) |
| `PERMUTATIONA` | full | optional analysis | [`binary-number`](#signature-binary-number) | [`analysis-math`](#semantics-analysis-math) | [`analysis-math`](#dialect-analysis-math) | [`analysis-math`](#implementation-analysis-math) |
| `SERIESSUM` | full | optional analysis | [`series-sum`](#signature-series-sum) | [`analysis-math`](#semantics-analysis-math) | [`analysis-math`](#dialect-analysis-math) | [`analysis-math`](#implementation-analysis-math) |
| `SQRTPI` | full | optional analysis | [`unary-number`](#signature-unary-number) | [`analysis-math`](#semantics-analysis-math) | [`analysis-math`](#dialect-analysis-math) | [`analysis-math`](#implementation-analysis-math) |
| `SUMSQ` | full | optional analysis | [`variadic-values`](#signature-variadic-values) | [`analysis-math`](#semantics-analysis-math) | [`analysis-math`](#dialect-analysis-math) | [`analysis-math`](#implementation-analysis-math) |
| `SUMX2MY2` | full | optional analysis | [`pair-arrays`](#signature-pair-arrays) | [`analysis-math`](#semantics-analysis-math) | [`analysis-math`](#dialect-analysis-math) | [`analysis-math`](#implementation-analysis-math) |
| `SUMX2PY2` | full | optional analysis | [`pair-arrays`](#signature-pair-arrays) | [`analysis-math`](#semantics-analysis-math) | [`analysis-math`](#dialect-analysis-math) | [`analysis-math`](#implementation-analysis-math) |
| `SUMXMY2` | full | optional analysis | [`pair-arrays`](#signature-pair-arrays) | [`analysis-math`](#semantics-analysis-math) | [`analysis-math`](#dialect-analysis-math) | [`analysis-math`](#implementation-analysis-math) |

### Statistical

Taxonomy/source: [Statistical functions](https://support.microsoft.com/en-us/office/excel-functions-by-category-5f91f4e9-7b42-46d2-9bd1-63f26a86c0eb).

| Function (aliases) | Engine | Contract | Signature | Semantics | Dialect | Implementation |
| --- | --- | --- | --- | --- | --- | --- |
| `AVERAGE` (`AVG`) | default, full | incumbent | [`optional-variadic-values`](#signature-optional-variadic-values) | [`aggregate`](#semantics-aggregate) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `MIN` | default, full | incumbent | [`optional-variadic-values`](#signature-optional-variadic-values) | [`aggregate`](#semantics-aggregate) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `MAX` | default, full | incumbent | [`optional-variadic-values`](#signature-optional-variadic-values) | [`aggregate`](#semantics-aggregate) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `COUNT` | default, full | incumbent | [`optional-variadic-values`](#signature-optional-variadic-values) | [`aggregate`](#semantics-aggregate) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `COUNTA` | default, full | incumbent | [`optional-variadic-values`](#signature-optional-variadic-values) | [`aggregate`](#semantics-aggregate) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `COUNTIF` | default, full | incumbent | [`criteria-one`](#signature-criteria-one) | [`criteria`](#semantics-criteria) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `COUNTIFS` | default, full | incumbent | [`criteria-many`](#signature-criteria-many) | [`criteria`](#semantics-criteria) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `AVERAGEIF` | default, full | incumbent | [`sumif`](#signature-sumif) | [`criteria`](#semantics-criteria) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `AVERAGEIFS` | default, full | incumbent | [`sumifs`](#signature-sumifs) | [`criteria`](#semantics-criteria) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `MEDIAN` | default, full | required target | [`variadic-values`](#signature-variadic-values) | [`aggregate`](#semantics-aggregate) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `MODE.SNGL` | default, full | required target | [`variadic-values`](#signature-variadic-values) | [`aggregate`](#semantics-aggregate) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `LARGE` | default, full | required target | [`value-k`](#signature-value-k) | [`aggregate`](#semantics-aggregate) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `SMALL` | default, full | required target | [`value-k`](#signature-value-k) | [`aggregate`](#semantics-aggregate) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `RANK.EQ` | default, full | required target | [`rank`](#signature-rank) | [`aggregate`](#semantics-aggregate) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `PERCENTILE.INC` | default, full | required target | [`percentile`](#signature-percentile) | [`aggregate`](#semantics-aggregate) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `QUARTILE.INC` | default, full | required target | [`percentile`](#signature-percentile) | [`aggregate`](#semantics-aggregate) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `STDEV.S` | default, full | required target | [`variadic-values`](#signature-variadic-values) | [`aggregate`](#semantics-aggregate) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `STDEV.P` | default, full | required target | [`variadic-values`](#signature-variadic-values) | [`aggregate`](#semantics-aggregate) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `VAR.S` | default, full | required target | [`variadic-values`](#signature-variadic-values) | [`aggregate`](#semantics-aggregate) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `VAR.P` | default, full | required target | [`variadic-values`](#signature-variadic-values) | [`aggregate`](#semantics-aggregate) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `GEOMEAN` | default, full | required target | [`variadic-values`](#signature-variadic-values) | [`aggregate`](#semantics-aggregate) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `CORREL` | default, full | required target | [`pair-arrays`](#signature-pair-arrays) | [`aggregate`](#semantics-aggregate) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `COVARIANCE.S` | default, full | required target | [`pair-arrays`](#signature-pair-arrays) | [`aggregate`](#semantics-aggregate) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `COVARIANCE.P` | default, full | required target | [`pair-arrays`](#signature-pair-arrays) | [`aggregate`](#semantics-aggregate) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `COUNTBLANK` | default, full | required target | [`unary-value`](#signature-unary-value) | [`aggregate`](#semantics-aggregate) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `MAXIFS` | default, full | required target | [`sumifs`](#signature-sumifs) | [`criteria`](#semantics-criteria) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `MINIFS` | default, full | required target | [`sumifs`](#signature-sumifs) | [`criteria`](#semantics-criteria) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `NORM.DIST` | full | optional analysis | [`norm-dist`](#signature-norm-dist) | [`analysis-distributions`](#semantics-analysis-distributions) | [`analysis-distributions`](#dialect-analysis-distributions) | [`analysis-distributions`](#implementation-analysis-distributions) |
| `NORM.INV` | full | optional analysis | [`norm-inv`](#signature-norm-inv) | [`analysis-distributions`](#semantics-analysis-distributions) | [`analysis-distributions`](#dialect-analysis-distributions) | [`analysis-distributions`](#implementation-analysis-distributions) |
| `NORM.S.DIST` | full | optional analysis | [`norm-s-dist`](#signature-norm-s-dist) | [`analysis-distributions`](#semantics-analysis-distributions) | [`analysis-distributions`](#dialect-analysis-distributions) | [`analysis-distributions`](#implementation-analysis-distributions) |
| `NORM.S.INV` | full | optional analysis | [`unary-number`](#signature-unary-number) | [`analysis-distributions`](#semantics-analysis-distributions) | [`analysis-distributions`](#dialect-analysis-distributions) | [`analysis-distributions`](#implementation-analysis-distributions) |
| `T.DIST` | full | optional analysis | [`t-dist`](#signature-t-dist) | [`analysis-distributions`](#semantics-analysis-distributions) | [`analysis-distributions`](#dialect-analysis-distributions) | [`analysis-distributions`](#implementation-analysis-distributions) |
| `T.DIST.2T` | full | optional analysis | [`distribution-tail`](#signature-distribution-tail) | [`analysis-distributions`](#semantics-analysis-distributions) | [`analysis-distributions`](#dialect-analysis-distributions) | [`analysis-distributions`](#implementation-analysis-distributions) |
| `T.DIST.RT` | full | optional analysis | [`distribution-tail`](#signature-distribution-tail) | [`analysis-distributions`](#semantics-analysis-distributions) | [`analysis-distributions`](#dialect-analysis-distributions) | [`analysis-distributions`](#implementation-analysis-distributions) |
| `T.INV` | full | optional analysis | [`distribution-inverse`](#signature-distribution-inverse) | [`analysis-distributions`](#semantics-analysis-distributions) | [`analysis-distributions`](#dialect-analysis-distributions) | [`analysis-distributions`](#implementation-analysis-distributions) |
| `T.INV.2T` | full | optional analysis | [`distribution-inverse`](#signature-distribution-inverse) | [`analysis-distributions`](#semantics-analysis-distributions) | [`analysis-distributions`](#dialect-analysis-distributions) | [`analysis-distributions`](#implementation-analysis-distributions) |
| `CHISQ.DIST` | full | optional analysis | [`t-dist`](#signature-t-dist) | [`analysis-distributions`](#semantics-analysis-distributions) | [`analysis-distributions`](#dialect-analysis-distributions) | [`analysis-distributions`](#implementation-analysis-distributions) |
| `CHISQ.DIST.RT` | full | optional analysis | [`distribution-tail`](#signature-distribution-tail) | [`analysis-distributions`](#semantics-analysis-distributions) | [`analysis-distributions`](#dialect-analysis-distributions) | [`analysis-distributions`](#implementation-analysis-distributions) |
| `CHISQ.INV` | full | optional analysis | [`distribution-inverse`](#signature-distribution-inverse) | [`analysis-distributions`](#semantics-analysis-distributions) | [`analysis-distributions`](#dialect-analysis-distributions) | [`analysis-distributions`](#implementation-analysis-distributions) |
| `CHISQ.INV.RT` | full | optional analysis | [`distribution-inverse`](#signature-distribution-inverse) | [`analysis-distributions`](#semantics-analysis-distributions) | [`analysis-distributions`](#dialect-analysis-distributions) | [`analysis-distributions`](#implementation-analysis-distributions) |
| `F.DIST` | full | optional analysis | [`f-dist`](#signature-f-dist) | [`analysis-distributions`](#semantics-analysis-distributions) | [`analysis-distributions`](#dialect-analysis-distributions) | [`analysis-distributions`](#implementation-analysis-distributions) |
| `F.DIST.RT` | full | optional analysis | [`f-tail`](#signature-f-tail) | [`analysis-distributions`](#semantics-analysis-distributions) | [`analysis-distributions`](#dialect-analysis-distributions) | [`analysis-distributions`](#implementation-analysis-distributions) |
| `F.INV` | full | optional analysis | [`f-inverse`](#signature-f-inverse) | [`analysis-distributions`](#semantics-analysis-distributions) | [`analysis-distributions`](#dialect-analysis-distributions) | [`analysis-distributions`](#implementation-analysis-distributions) |
| `F.INV.RT` | full | optional analysis | [`f-inverse`](#signature-f-inverse) | [`analysis-distributions`](#semantics-analysis-distributions) | [`analysis-distributions`](#dialect-analysis-distributions) | [`analysis-distributions`](#implementation-analysis-distributions) |
| `BINOM.DIST` | full | optional analysis | [`binom-dist`](#signature-binom-dist) | [`analysis-distributions`](#semantics-analysis-distributions) | [`analysis-distributions`](#dialect-analysis-distributions) | [`analysis-distributions`](#implementation-analysis-distributions) |
| `POISSON.DIST` | full | optional analysis | [`poisson-dist`](#signature-poisson-dist) | [`analysis-distributions`](#semantics-analysis-distributions) | [`analysis-distributions`](#dialect-analysis-distributions) | [`analysis-distributions`](#implementation-analysis-distributions) |
| `EXPON.DIST` | full | optional analysis | [`expon-dist`](#signature-expon-dist) | [`analysis-distributions`](#semantics-analysis-distributions) | [`analysis-distributions`](#dialect-analysis-distributions) | [`analysis-distributions`](#implementation-analysis-distributions) |
| `GAMMA` | full | optional analysis | [`unary-number`](#signature-unary-number) | [`analysis-distributions`](#semantics-analysis-distributions) | [`analysis-distributions`](#dialect-analysis-distributions) | [`analysis-distributions`](#implementation-analysis-distributions) |
| `GAMMALN` | full | optional analysis | [`unary-number`](#signature-unary-number) | [`analysis-distributions`](#semantics-analysis-distributions) | [`analysis-distributions`](#dialect-analysis-distributions) | [`analysis-distributions`](#implementation-analysis-distributions) |
| `GAMMA.DIST` | full | optional analysis | [`gamma-dist`](#signature-gamma-dist) | [`analysis-distributions`](#semantics-analysis-distributions) | [`analysis-distributions`](#dialect-analysis-distributions) | [`analysis-distributions`](#implementation-analysis-distributions) |
| `GAMMA.INV` | full | optional analysis | [`gamma-inverse`](#signature-gamma-inverse) | [`analysis-distributions`](#semantics-analysis-distributions) | [`analysis-distributions`](#dialect-analysis-distributions) | [`analysis-distributions`](#implementation-analysis-distributions) |
| `BETA.DIST` | full | optional analysis | [`beta-dist`](#signature-beta-dist) | [`analysis-distributions`](#semantics-analysis-distributions) | [`analysis-distributions`](#dialect-analysis-distributions) | [`analysis-distributions`](#implementation-analysis-distributions) |
| `BETA.INV` | full | optional analysis | [`beta-inverse`](#signature-beta-inverse) | [`analysis-distributions`](#semantics-analysis-distributions) | [`analysis-distributions`](#dialect-analysis-distributions) | [`analysis-distributions`](#implementation-analysis-distributions) |
| `LOGNORM.DIST` | full | optional analysis | [`lognorm-dist`](#signature-lognorm-dist) | [`analysis-distributions`](#semantics-analysis-distributions) | [`analysis-distributions`](#dialect-analysis-distributions) | [`analysis-distributions`](#implementation-analysis-distributions) |
| `LOGNORM.INV` | full | optional analysis | [`lognorm-inverse`](#signature-lognorm-inverse) | [`analysis-distributions`](#semantics-analysis-distributions) | [`analysis-distributions`](#dialect-analysis-distributions) | [`analysis-distributions`](#implementation-analysis-distributions) |
| `WEIBULL.DIST` | full | optional analysis | [`weibull-dist`](#signature-weibull-dist) | [`analysis-distributions`](#semantics-analysis-distributions) | [`analysis-distributions`](#dialect-analysis-distributions) | [`analysis-distributions`](#implementation-analysis-distributions) |
| `CONFIDENCE.NORM` | full | optional analysis | [`confidence`](#signature-confidence) | [`analysis-distributions`](#semantics-analysis-distributions) | [`analysis-distributions`](#dialect-analysis-distributions) | [`analysis-distributions`](#implementation-analysis-distributions) |
| `CONFIDENCE.T` | full | optional analysis | [`confidence`](#signature-confidence) | [`analysis-distributions`](#semantics-analysis-distributions) | [`analysis-distributions`](#dialect-analysis-distributions) | [`analysis-distributions`](#implementation-analysis-distributions) |
| `STANDARDIZE` | full | optional analysis | [`standardize`](#signature-standardize) | [`analysis-distributions`](#semantics-analysis-distributions) | [`analysis-distributions`](#dialect-analysis-distributions) | [`analysis-distributions`](#implementation-analysis-distributions) |
| `FISHER` | full | optional analysis | [`unary-number`](#signature-unary-number) | [`analysis-distributions`](#semantics-analysis-distributions) | [`analysis-distributions`](#dialect-analysis-distributions) | [`analysis-distributions`](#implementation-analysis-distributions) |
| `FISHERINV` | full | optional analysis | [`unary-number`](#signature-unary-number) | [`analysis-distributions`](#semantics-analysis-distributions) | [`analysis-distributions`](#dialect-analysis-distributions) | [`analysis-distributions`](#implementation-analysis-distributions) |
| `PHI` | full | optional analysis | [`unary-number`](#signature-unary-number) | [`analysis-distributions`](#semantics-analysis-distributions) | [`analysis-distributions`](#dialect-analysis-distributions) | [`analysis-distributions`](#implementation-analysis-distributions) |
| `GAUSS` | full | optional analysis | [`unary-number`](#signature-unary-number) | [`analysis-distributions`](#semantics-analysis-distributions) | [`analysis-distributions`](#dialect-analysis-distributions) | [`analysis-distributions`](#implementation-analysis-distributions) |
| `AVEDEV` | full | optional analysis | [`variadic-values`](#signature-variadic-values) | [`analysis-descriptive`](#semantics-analysis-descriptive) | [`analysis-descriptive`](#dialect-analysis-descriptive) | [`analysis-descriptive`](#implementation-analysis-descriptive) |
| `DEVSQ` | full | optional analysis | [`variadic-values`](#signature-variadic-values) | [`analysis-descriptive`](#semantics-analysis-descriptive) | [`analysis-descriptive`](#dialect-analysis-descriptive) | [`analysis-descriptive`](#implementation-analysis-descriptive) |
| `HARMEAN` | full | optional analysis | [`variadic-values`](#signature-variadic-values) | [`analysis-descriptive`](#semantics-analysis-descriptive) | [`analysis-descriptive`](#dialect-analysis-descriptive) | [`analysis-descriptive`](#implementation-analysis-descriptive) |
| `KURT` | full | optional analysis | [`variadic-values`](#signature-variadic-values) | [`analysis-descriptive`](#semantics-analysis-descriptive) | [`analysis-descriptive`](#dialect-analysis-descriptive) | [`analysis-descriptive`](#implementation-analysis-descriptive) |
| `SKEW` | full | optional analysis | [`variadic-values`](#signature-variadic-values) | [`analysis-descriptive`](#semantics-analysis-descriptive) | [`analysis-descriptive`](#dialect-analysis-descriptive) | [`analysis-descriptive`](#implementation-analysis-descriptive) |
| `SKEW.P` | full | optional analysis | [`variadic-values`](#signature-variadic-values) | [`analysis-descriptive`](#semantics-analysis-descriptive) | [`analysis-descriptive`](#dialect-analysis-descriptive) | [`analysis-descriptive`](#implementation-analysis-descriptive) |
| `TRIMMEAN` | full | optional analysis | [`trim-mean`](#signature-trim-mean) | [`analysis-descriptive`](#semantics-analysis-descriptive) | [`analysis-descriptive`](#dialect-analysis-descriptive) | [`analysis-descriptive`](#implementation-analysis-descriptive) |
| `PERCENTILE.EXC` | full | optional analysis | [`percentile`](#signature-percentile) | [`analysis-descriptive`](#semantics-analysis-descriptive) | [`analysis-descriptive`](#dialect-analysis-descriptive) | [`analysis-descriptive`](#implementation-analysis-descriptive) |
| `QUARTILE.EXC` | full | optional analysis | [`percentile`](#signature-percentile) | [`analysis-descriptive`](#semantics-analysis-descriptive) | [`analysis-descriptive`](#dialect-analysis-descriptive) | [`analysis-descriptive`](#implementation-analysis-descriptive) |
| `PERCENTRANK.INC` | full | optional analysis | [`percent-rank`](#signature-percent-rank) | [`analysis-descriptive`](#semantics-analysis-descriptive) | [`analysis-descriptive`](#dialect-analysis-descriptive) | [`analysis-descriptive`](#implementation-analysis-descriptive) |
| `PERCENTRANK.EXC` | full | optional analysis | [`percent-rank`](#signature-percent-rank) | [`analysis-descriptive`](#semantics-analysis-descriptive) | [`analysis-descriptive`](#dialect-analysis-descriptive) | [`analysis-descriptive`](#implementation-analysis-descriptive) |
| `RANK.AVG` | full | optional analysis | [`rank`](#signature-rank) | [`analysis-descriptive`](#semantics-analysis-descriptive) | [`analysis-descriptive`](#dialect-analysis-descriptive) | [`analysis-descriptive`](#implementation-analysis-descriptive) |
| `PEARSON` | full | optional analysis | [`pair-arrays`](#signature-pair-arrays) | [`analysis-descriptive`](#semantics-analysis-descriptive) | [`analysis-descriptive`](#dialect-analysis-descriptive) | [`analysis-descriptive`](#implementation-analysis-descriptive) |
| `RSQ` | full | optional analysis | [`known-y-x`](#signature-known-y-x) | [`analysis-descriptive`](#semantics-analysis-descriptive) | [`analysis-descriptive`](#dialect-analysis-descriptive) | [`analysis-descriptive`](#implementation-analysis-descriptive) |
| `SLOPE` | full | optional analysis | [`known-y-x`](#signature-known-y-x) | [`analysis-descriptive`](#semantics-analysis-descriptive) | [`analysis-descriptive`](#dialect-analysis-descriptive) | [`analysis-descriptive`](#implementation-analysis-descriptive) |
| `INTERCEPT` | full | optional analysis | [`known-y-x`](#signature-known-y-x) | [`analysis-descriptive`](#semantics-analysis-descriptive) | [`analysis-descriptive`](#dialect-analysis-descriptive) | [`analysis-descriptive`](#implementation-analysis-descriptive) |
| `STEYX` | full | optional analysis | [`known-y-x`](#signature-known-y-x) | [`analysis-descriptive`](#semantics-analysis-descriptive) | [`analysis-descriptive`](#dialect-analysis-descriptive) | [`analysis-descriptive`](#implementation-analysis-descriptive) |
| `FORECAST.LINEAR` (`FORECAST`) | full | optional analysis | [`forecast`](#signature-forecast) | [`analysis-descriptive`](#semantics-analysis-descriptive) | [`analysis-descriptive`](#dialect-analysis-descriptive) | [`analysis-descriptive`](#implementation-analysis-descriptive) |
| `FREQUENCY` | full | optional analysis | [`frequency`](#signature-frequency) | [`analysis-regression`](#semantics-analysis-regression) | [`analysis-regression`](#dialect-analysis-regression) | [`analysis-regression`](#implementation-analysis-regression) |
| `MODE.MULT` | full | optional analysis | [`variadic-values-array`](#signature-variadic-values-array) | [`analysis-regression`](#semantics-analysis-regression) | [`analysis-regression`](#dialect-analysis-regression) | [`analysis-regression`](#implementation-analysis-regression) |
| `GROWTH` | full | optional analysis | [`regression-predict`](#signature-regression-predict) | [`analysis-regression`](#semantics-analysis-regression) | [`analysis-regression`](#dialect-analysis-regression) | [`analysis-regression`](#implementation-analysis-regression) |
| `LINEST` | full | optional analysis | [`regression-fit`](#signature-regression-fit) | [`analysis-regression`](#semantics-analysis-regression) | [`analysis-regression`](#dialect-analysis-regression) | [`analysis-regression`](#implementation-analysis-regression) |
| `LOGEST` | full | optional analysis | [`regression-fit`](#signature-regression-fit) | [`analysis-regression`](#semantics-analysis-regression) | [`analysis-regression`](#dialect-analysis-regression) | [`analysis-regression`](#implementation-analysis-regression) |
| `PERCENTILE` | full | optional analysis | [`percentile`](#signature-percentile) | [`analysis-regression`](#semantics-analysis-regression) | [`analysis-regression`](#dialect-analysis-regression) | [`analysis-regression`](#implementation-analysis-regression) |
| `PERCENTRANK` | full | optional analysis | [`percent-rank`](#signature-percent-rank) | [`analysis-regression`](#semantics-analysis-regression) | [`analysis-regression`](#dialect-analysis-regression) | [`analysis-regression`](#implementation-analysis-regression) |
| `PROB` | full | optional analysis | [`probability-range`](#signature-probability-range) | [`analysis-regression`](#semantics-analysis-regression) | [`analysis-regression`](#dialect-analysis-regression) | [`analysis-regression`](#implementation-analysis-regression) |
| `QUARTILE` | full | optional analysis | [`percentile`](#signature-percentile) | [`analysis-regression`](#semantics-analysis-regression) | [`analysis-regression`](#dialect-analysis-regression) | [`analysis-regression`](#implementation-analysis-regression) |
| `RANK` | full | optional analysis | [`rank`](#signature-rank) | [`analysis-regression`](#semantics-analysis-regression) | [`analysis-regression`](#dialect-analysis-regression) | [`analysis-regression`](#implementation-analysis-regression) |
| `TREND` | full | optional analysis | [`regression-predict`](#signature-regression-predict) | [`analysis-regression`](#semantics-analysis-regression) | [`analysis-regression`](#dialect-analysis-regression) | [`analysis-regression`](#implementation-analysis-regression) |

### Text

Taxonomy/source: [Text functions](https://support.microsoft.com/en-us/office/excel-functions-by-category-5f91f4e9-7b42-46d2-9bd1-63f26a86c0eb).

| Function (aliases) | Engine | Contract | Signature | Semantics | Dialect | Implementation |
| --- | --- | --- | --- | --- | --- | --- |
| `ARRAYTOTEXT` | full | optional analysis | [`array-to-text`](#signature-array-to-text) | [`text`](#semantics-text) | [`excel-documented`](#dialect-excel-documented) | [`text-analysis`](#implementation-text-analysis) |
| `DOLLAR` | full | optional analysis | [`text-dollar`](#signature-text-dollar) | [`text`](#semantics-text) | [`excel-documented`](#dialect-excel-documented) | [`text-analysis`](#implementation-text-analysis) |
| `FIXED` | full | optional analysis | [`text-fixed`](#signature-text-fixed) | [`text`](#semantics-text) | [`excel-documented`](#dialect-excel-documented) | [`text-analysis`](#implementation-text-analysis) |
| `REGEXEXTRACT` | full | optional analysis | [`regex-extract`](#signature-regex-extract) | [`text`](#semantics-text) | [`regex-lite-subset`](#dialect-regex-lite-subset) | [`text-analysis`](#implementation-text-analysis) |
| `REGEXREPLACE` | full | optional analysis | [`regex-replace`](#signature-regex-replace) | [`text`](#semantics-text) | [`regex-lite-subset`](#dialect-regex-lite-subset) | [`text-analysis`](#implementation-text-analysis) |
| `REGEXTEST` | full | optional analysis | [`regex-test`](#signature-regex-test) | [`text`](#semantics-text) | [`regex-lite-subset`](#dialect-regex-lite-subset) | [`text-analysis`](#implementation-text-analysis) |
| `TEXTAFTER` | full | optional analysis | [`text-delimiter`](#signature-text-delimiter) | [`text`](#semantics-text) | [`excel-documented`](#dialect-excel-documented) | [`text-analysis`](#implementation-text-analysis) |
| `TEXTBEFORE` | full | optional analysis | [`text-delimiter`](#signature-text-delimiter) | [`text`](#semantics-text) | [`excel-documented`](#dialect-excel-documented) | [`text-analysis`](#implementation-text-analysis) |
| `TEXTSPLIT` | full | optional analysis | [`text-split`](#signature-text-split) | [`text`](#semantics-text) | [`excel-documented`](#dialect-excel-documented) | [`text-analysis`](#implementation-text-analysis) |
| `VALUETOTEXT` | full | optional analysis | [`value-to-text`](#signature-value-to-text) | [`text`](#semantics-text) | [`excel-documented`](#dialect-excel-documented) | [`text-analysis`](#implementation-text-analysis) |
| `LEN` | default, full | incumbent | [`unary-value`](#signature-unary-value) | [`text`](#semantics-text) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `LEFT` | default, full | incumbent | [`left-right`](#signature-left-right) | [`text`](#semantics-text) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `RIGHT` | default, full | incumbent | [`left-right`](#signature-left-right) | [`text`](#semantics-text) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `MID` | default, full | incumbent | [`mid`](#signature-mid) | [`text`](#semantics-text) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `CONCAT` (`CONCATENATE`) | default, full | incumbent | [`variadic-values`](#signature-variadic-values) | [`text`](#semantics-text) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `UPPER` | default, full | incumbent | [`unary-value`](#signature-unary-value) | [`text`](#semantics-text) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `LOWER` | default, full | incumbent | [`unary-value`](#signature-unary-value) | [`text`](#semantics-text) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `TRIM` | default, full | incumbent | [`unary-value`](#signature-unary-value) | [`text`](#semantics-text) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `TEXT` | default, full | incumbent | [`text-format`](#signature-text-format) | [`text`](#semantics-text) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `EXACT` | default, full | incumbent | [`binary-number`](#signature-binary-number) | [`text-sensitive`](#semantics-text-sensitive) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `TEXTJOIN` | default, full | required target | [`text-join`](#signature-text-join) | [`text`](#semantics-text) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `SUBSTITUTE` | default, full | required target | [`substitute`](#signature-substitute) | [`text-sensitive`](#semantics-text-sensitive) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `REPLACE` | default, full | required target | [`replace`](#signature-replace) | [`text-sensitive`](#semantics-text-sensitive) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `FIND` | default, full | required target | [`find-search`](#signature-find-search) | [`text-sensitive`](#semantics-text-sensitive) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `SEARCH` | default, full | required target | [`find-search`](#signature-find-search) | [`text-search`](#semantics-text-search) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `VALUE` | default, full | required target | [`unary-value`](#signature-unary-value) | [`text`](#semantics-text) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `CLEAN` | default, full | required target | [`unary-value`](#signature-unary-value) | [`text`](#semantics-text) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `REPT` | default, full | required target | [`repeat-text`](#signature-repeat-text) | [`text`](#semantics-text) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `CHAR` | default, full | required target | [`unary-number`](#signature-unary-number) | [`text`](#semantics-text) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `CODE` | default, full | required target | [`unary-value`](#signature-unary-value) | [`text`](#semantics-text) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `UNICHAR` | default, full | required target | [`unary-number`](#signature-unary-number) | [`text`](#semantics-text) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `UNICODE` | default, full | required target | [`unary-value`](#signature-unary-value) | [`text`](#semantics-text) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `PROPER` | default, full | required target | [`unary-value`](#signature-unary-value) | [`text`](#semantics-text) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |
| `NUMBERVALUE` | default, full | required target | [`number-value`](#signature-number-value) | [`text`](#semantics-text) | [`excel-documented`](#dialect-excel-documented) | [`implemented-assisted`](#implementation-implemented-assisted) |

### Formula operators

Taxonomy/source: [Types of operators](https://support.microsoft.com/en-us/office/calculation-operators-and-precedence-in-excel-48be406d-4975-4d31-b2b8-7af9e0e2878a).

| Function (aliases) | Engine | Contract | Signature | Semantics | Dialect | Implementation |
| --- | --- | --- | --- | --- | --- | --- |

### Database

Taxonomy/source: [Database functions](https://support.microsoft.com/en-us/office/excel-functions-by-category-5f91f4e9-7b42-46d2-9bd1-63f26a86c0eb).

| Function (aliases) | Engine | Contract | Signature | Semantics | Dialect | Implementation |
| --- | --- | --- | --- | --- | --- | --- |
| `DAVERAGE` | full | optional analysis | [`database`](#signature-database) | [`analysis-database`](#semantics-analysis-database) | [`analysis-database`](#dialect-analysis-database) | [`analysis-database`](#implementation-analysis-database) |
| `DCOUNT` | full | optional analysis | [`database`](#signature-database) | [`analysis-database`](#semantics-analysis-database) | [`analysis-database`](#dialect-analysis-database) | [`analysis-database`](#implementation-analysis-database) |
| `DCOUNTA` | full | optional analysis | [`database`](#signature-database) | [`analysis-database`](#semantics-analysis-database) | [`analysis-database`](#dialect-analysis-database) | [`analysis-database`](#implementation-analysis-database) |
| `DGET` | full | optional analysis | [`database`](#signature-database) | [`analysis-database`](#semantics-analysis-database) | [`analysis-database`](#dialect-analysis-database) | [`analysis-database`](#implementation-analysis-database) |
| `DMAX` | full | optional analysis | [`database`](#signature-database) | [`analysis-database`](#semantics-analysis-database) | [`analysis-database`](#dialect-analysis-database) | [`analysis-database`](#implementation-analysis-database) |
| `DMIN` | full | optional analysis | [`database`](#signature-database) | [`analysis-database`](#semantics-analysis-database) | [`analysis-database`](#dialect-analysis-database) | [`analysis-database`](#implementation-analysis-database) |
| `DPRODUCT` | full | optional analysis | [`database`](#signature-database) | [`analysis-database`](#semantics-analysis-database) | [`analysis-database`](#dialect-analysis-database) | [`analysis-database`](#implementation-analysis-database) |
| `DSTDEV` | full | optional analysis | [`database`](#signature-database) | [`analysis-database`](#semantics-analysis-database) | [`analysis-database`](#dialect-analysis-database) | [`analysis-database`](#implementation-analysis-database) |
| `DSTDEVP` | full | optional analysis | [`database`](#signature-database) | [`analysis-database`](#semantics-analysis-database) | [`analysis-database`](#dialect-analysis-database) | [`analysis-database`](#implementation-analysis-database) |
| `DSUM` | full | optional analysis | [`database`](#signature-database) | [`analysis-database`](#semantics-analysis-database) | [`analysis-database`](#dialect-analysis-database) | [`analysis-database`](#implementation-analysis-database) |
| `DVAR` | full | optional analysis | [`database`](#signature-database) | [`analysis-database`](#semantics-analysis-database) | [`analysis-database`](#dialect-analysis-database) | [`analysis-database`](#implementation-analysis-database) |
| `DVARP` | full | optional analysis | [`database`](#signature-database) | [`analysis-database`](#semantics-analysis-database) | [`analysis-database`](#dialect-analysis-database) | [`analysis-database`](#implementation-analysis-database) |

## Signature profiles

Argument order, required/default state, accepted shapes, repetition, and return shape come directly from the inventory.

### Signature: text-delimiter

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `text` | yes | none | `scalar`, `reference` | `once` |
| `delimiter` | yes | none | `scalar`, `reference` | `once` |
| `instanceNum` | no | 1 | `scalar`, `reference` | `once` |
| `matchMode` | no | 0 | `scalar`, `reference` | `once` |
| `matchEnd` | no | 0 | `scalar`, `reference` | `once` |
| `ifNotFound` | no | #N/A | `scalar`, `reference` | `once` |

### Signature: text-split

Return shape: `array`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `text` | yes | none | `scalar`, `reference` | `once` |
| `colDelimiter` | no | none | `scalar`, `range`, `array`, `reference` | `once` |
| `rowDelimiter` | no | none | `scalar`, `range`, `array`, `reference` | `once` |
| `ignoreEmpty` | no | false | `scalar`, `reference` | `once` |
| `matchMode` | no | 0 | `scalar`, `reference` | `once` |
| `padWith` | no | #N/A | `scalar`, `reference` | `once` |

### Signature: text-fixed

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `number` | yes | none | `scalar`, `reference` | `once` |
| `decimals` | no | 2 | `scalar`, `reference` | `once` |
| `noCommas` | no | false | `scalar`, `reference` | `once` |

### Signature: text-dollar

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `number` | yes | none | `scalar`, `reference` | `once` |
| `decimals` | no | 2 | `scalar`, `reference` | `once` |

### Signature: value-to-text

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `value` | yes | none | `scalar`, `reference` | `once` |
| `format` | no | 0 | `scalar`, `reference` | `once` |

### Signature: array-to-text

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `array` | yes | none | `scalar`, `range`, `array`, `reference` | `once` |
| `format` | no | 0 | `scalar`, `reference` | `once` |

### Signature: regex-test

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `text` | yes | none | `scalar`, `reference` | `once` |
| `pattern` | yes | none | `scalar`, `reference` | `once` |
| `caseSensitivity` | no | 0 | `scalar`, `reference` | `once` |

### Signature: regex-extract

Return shape: `contextual`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `text` | yes | none | `scalar`, `reference` | `once` |
| `pattern` | yes | none | `scalar`, `reference` | `once` |
| `returnMode` | no | 0 | `scalar`, `reference` | `once` |
| `caseSensitivity` | no | 0 | `scalar`, `reference` | `once` |

### Signature: regex-replace

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `text` | yes | none | `scalar`, `reference` | `once` |
| `pattern` | yes | none | `scalar`, `reference` | `once` |
| `replacement` | yes | none | `scalar`, `reference` | `once` |
| `occurrence` | no | 0 | `scalar`, `reference` | `once` |
| `caseSensitivity` | no | 0 | `scalar`, `reference` | `once` |

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

### Signature: variadic-values-array

Return shape: `array`.

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

### Signature: sort-by

Return shape: `array`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `array` | yes | none | `range`, `array`, `reference` | `once` |
| `byArrayAndOrder` | yes | none | `scalar`, `range`, `array`, `reference` | `paired` |

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

### Signature: trim-mean

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `array` | yes | none | `range`, `array`, `reference` | `once` |
| `percent` | yes | none | `scalar`, `reference` | `once` |

### Signature: percent-rank

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `array` | yes | none | `range`, `array`, `reference` | `once` |
| `x` | yes | none | `scalar`, `reference` | `once` |
| `significance` | no | 3 | `scalar`, `reference` | `once` |

### Signature: known-y-x

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `knownYs` | yes | none | `range`, `array`, `reference` | `once` |
| `knownXs` | yes | none | `range`, `array`, `reference` | `once` |

### Signature: forecast

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `x` | yes | none | `scalar`, `reference` | `once` |
| `knownYs` | yes | none | `range`, `array`, `reference` | `once` |
| `knownXs` | yes | none | `range`, `array`, `reference` | `once` |

### Signature: datedif

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `startDate` | yes | none | `scalar`, `reference` | `once` |
| `endDate` | yes | none | `scalar`, `reference` | `once` |
| `unit` | yes | none | `scalar`, `reference` | `once` |

### Signature: calendar-intl

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `startDate` | yes | none | `scalar`, `reference` | `once` |
| `endDateOrDays` | yes | none | `scalar`, `reference` | `once` |
| `weekend` | no | 1 | `scalar`, `reference` | `once` |
| `holidays` | no | none | `scalar`, `range`, `array`, `reference` | `once` |

### Signature: nper

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `rate` | yes | none | `scalar`, `reference` | `once` |
| `payment` | yes | none | `scalar`, `reference` | `once` |
| `presentValue` | yes | none | `scalar`, `reference` | `once` |
| `futureValue` | no | 0 | `scalar`, `reference` | `once` |
| `type` | no | 0 | `scalar`, `reference` | `once` |

### Signature: xnpv

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `rate` | yes | none | `scalar`, `reference` | `once` |
| `values` | yes | none | `scalar`, `range`, `array`, `reference` | `once` |
| `dates` | yes | none | `scalar`, `range`, `array`, `reference` | `once` |

### Signature: xirr

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `values` | yes | none | `scalar`, `range`, `array`, `reference` | `once` |
| `dates` | yes | none | `scalar`, `range`, `array`, `reference` | `once` |
| `guess` | no | 0.1 | `scalar`, `reference` | `once` |

### Signature: mirr

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `values` | yes | none | `scalar`, `range`, `array`, `reference` | `once` |
| `financeRate` | yes | none | `scalar`, `reference` | `once` |
| `reinvestRate` | yes | none | `scalar`, `reference` | `once` |

### Signature: cumulative-payment

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `rate` | yes | none | `scalar`, `reference` | `once` |
| `nper` | yes | none | `scalar`, `reference` | `once` |
| `presentValue` | yes | none | `scalar`, `reference` | `once` |
| `startPeriod` | yes | none | `scalar`, `reference` | `once` |
| `endPeriod` | yes | none | `scalar`, `reference` | `once` |
| `type` | yes | none | `scalar`, `reference` | `once` |

### Signature: sln

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `cost` | yes | none | `scalar`, `reference` | `once` |
| `salvage` | yes | none | `scalar`, `reference` | `once` |
| `life` | yes | none | `scalar`, `reference` | `once` |

### Signature: syd

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `cost` | yes | none | `scalar`, `reference` | `once` |
| `salvage` | yes | none | `scalar`, `reference` | `once` |
| `life` | yes | none | `scalar`, `reference` | `once` |
| `period` | yes | none | `scalar`, `reference` | `once` |

### Signature: db

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `cost` | yes | none | `scalar`, `reference` | `once` |
| `salvage` | yes | none | `scalar`, `reference` | `once` |
| `life` | yes | none | `scalar`, `reference` | `once` |
| `period` | yes | none | `scalar`, `reference` | `once` |
| `month` | no | 12 | `scalar`, `reference` | `once` |

### Signature: ddb

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `cost` | yes | none | `scalar`, `reference` | `once` |
| `salvage` | yes | none | `scalar`, `reference` | `once` |
| `life` | yes | none | `scalar`, `reference` | `once` |
| `period` | yes | none | `scalar`, `reference` | `once` |
| `factor` | no | 2 | `scalar`, `reference` | `once` |

### Signature: rri

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `nper` | yes | none | `scalar`, `reference` | `once` |
| `presentValue` | yes | none | `scalar`, `reference` | `once` |
| `futureValue` | yes | none | `scalar`, `reference` | `once` |

### Signature: pduration

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `rate` | yes | none | `scalar`, `reference` | `once` |
| `presentValue` | yes | none | `scalar`, `reference` | `once` |
| `futureValue` | yes | none | `scalar`, `reference` | `once` |

### Signature: fvschedule

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `principal` | yes | none | `scalar`, `reference` | `once` |
| `schedule` | yes | none | `scalar`, `range`, `array`, `reference` | `once` |

### Signature: regression-fit

Return shape: `array`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `knownY` | yes | none | `range`, `array`, `reference` | `once` |
| `knownX` | no | 1,2,3,... | `range`, `array`, `reference` | `once` |
| `const` | no | true | `scalar`, `reference` | `once` |
| `stats` | no | false | `scalar`, `reference` | `once` |

### Signature: regression-predict

Return shape: `array`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `knownY` | yes | none | `range`, `array`, `reference` | `once` |
| `knownX` | no | 1,2,3,... | `range`, `array`, `reference` | `once` |
| `newX` | no | knownX | `range`, `array`, `reference` | `once` |
| `const` | no | true | `scalar`, `reference` | `once` |

### Signature: frequency

Return shape: `array`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `data` | yes | none | `range`, `array`, `reference` | `once` |
| `bins` | yes | none | `range`, `array`, `reference` | `once` |

### Signature: probability-range

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `xRange` | yes | none | `range`, `array`, `reference` | `once` |
| `probRange` | yes | none | `range`, `array`, `reference` | `once` |
| `lowerLimit` | no | 0 | `scalar`, `reference` | `once` |
| `upperLimit` | no | lowerLimit | `scalar`, `reference` | `once` |

### Signature: database

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `database` | yes | none | `range`, `reference` | `once` |
| `field` | yes | none | `scalar`, `reference` | `once` |
| `criteria` | yes | none | `range`, `reference` | `once` |

### Signature: round-math

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `number` | yes | none | `scalar`, `reference` | `once` |
| `significance` | no | 1 | `scalar`, `reference` | `once` |
| `mode` | no | 0 | `scalar`, `reference` | `once` |

### Signature: series-sum

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `x` | yes | none | `scalar`, `reference` | `once` |
| `n` | yes | none | `scalar`, `reference` | `once` |
| `m` | yes | none | `scalar`, `reference` | `once` |
| `coefficients` | yes | none | `range`, `array`, `reference` | `once` |

### Signature: aggregate

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `functionNumber` | yes | none | `scalar`, `reference` | `once` |
| `options` | yes | none | `scalar`, `reference` | `once` |
| `reference` | yes | none | `range`, `array`, `reference` | `one-or-more` |

### Signature: matrix-pair

Return shape: `array`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `array1` | yes | none | `range`, `array`, `reference` | `once` |
| `array2` | yes | none | `range`, `array`, `reference` | `once` |

### Signature: matrix-unary

Return shape: `array`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `array` | yes | none | `range`, `array`, `reference` | `once` |

### Signature: matrix-unit

Return shape: `array`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `dimension` | yes | none | `scalar`, `reference` | `once` |

### Signature: reshape-flatten

Return shape: `array`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `array` | yes | none | `scalar`, `range`, `array`, `reference` | `once` |
| `ignore` | no | 0 | `scalar`, `reference` | `once` |
| `scanByColumn` | no | FALSE | `scalar`, `reference` | `once` |

### Signature: reshape-wrap

Return shape: `array`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `vector` | yes | none | `scalar`, `range`, `array`, `reference` | `once` |
| `wrapCount` | yes | none | `scalar`, `reference` | `once` |
| `padWith` | no | #N/A | `scalar`, `reference` | `once` |

### Signature: reshape-expand

Return shape: `array`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `array` | yes | none | `scalar`, `range`, `array`, `reference` | `once` |
| `rows` | yes | none | `scalar`, `reference` | `once` |
| `columns` | no | source columns | `scalar`, `reference` | `once` |
| `padWith` | no | #N/A | `scalar`, `reference` | `once` |

### Signature: reshape-stack

Return shape: `array`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `array` | yes | none | `scalar`, `range`, `array`, `reference` | `one-or-more` |

### Signature: lambda-lambda

Return shape: `contextual`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `parameter` | no | none | `scalar`, `range`, `array`, `reference` | `zero-or-more` |
| `calculation` | yes | none | `scalar`, `range`, `array`, `reference` | `once` |

### Signature: lambda-map

Return shape: `array`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `array` | yes | none | `scalar`, `range`, `array`, `reference` | `one-or-more` |
| `lambda` | yes | none | `scalar`, `range`, `array`, `reference` | `once` |

### Signature: lambda-reduce

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `initialValue` | no | none | `scalar`, `range`, `array`, `reference` | `once` |
| `array` | yes | none | `scalar`, `range`, `array`, `reference` | `once` |
| `lambda` | yes | none | `scalar`, `range`, `array`, `reference` | `once` |

### Signature: lambda-scan

Return shape: `array`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `initialValue` | no | none | `scalar`, `range`, `array`, `reference` | `once` |
| `array` | yes | none | `scalar`, `range`, `array`, `reference` | `once` |
| `lambda` | yes | none | `scalar`, `range`, `array`, `reference` | `once` |

### Signature: lambda-byrow

Return shape: `array`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `array` | yes | none | `scalar`, `range`, `array`, `reference` | `once` |
| `lambda` | yes | none | `scalar`, `range`, `array`, `reference` | `once` |

### Signature: lambda-bycol

Return shape: `array`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `array` | yes | none | `scalar`, `range`, `array`, `reference` | `once` |
| `lambda` | yes | none | `scalar`, `range`, `array`, `reference` | `once` |

### Signature: lambda-makearray

Return shape: `array`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `rows` | yes | none | `scalar`, `range`, `array`, `reference` | `once` |
| `columns` | yes | none | `scalar`, `range`, `array`, `reference` | `once` |
| `lambda` | yes | none | `scalar`, `range`, `array`, `reference` | `once` |

### Signature: lambda-isomitted

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `value` | yes | none | `scalar`, `range`, `array`, `reference` | `once` |

### Signature: groupby-groupby

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

### Signature: groupby-pivotby

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

### Signature: groupby-percentof

Return shape: `scalar`.

| Argument | Required | Default | Accepts | Repetition |
| --- | --- | --- | --- | --- |
| `dataSubset` | yes | none | `scalar`, `range`, `array`, `reference` | `once` |
| `dataAll` | yes | none | `scalar`, `range`, `array`, `reference` | `once` |

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

### Semantics: analysis-descriptive

| Dimension | Contract |
| --- | --- |
| shape | scalar: accepted<br />range: accepted<br />array: accepted<br />broadcast: none<br />result: scalar |
| coercion | blank: ignored<br />text: ignored-in-ranges<br />boolean: ignored-in-ranges<br />error: propagate |
| text | case: not-applicable<br />wildcard: not-applicable |
| environment | locale: invariant<br />dateSystem: not-applicable |
| numeric | tolerance: binary64<br />domain: function-defined<br />iteration: kind: none<br />maximum: none |
| calculation | dependencies: tracked<br />lazy: eager<br />spill: scalar<br />fill: relative-reference-rewrite<br />copy: relative-reference-rewrite<br />structuralRewrite: ast-reference-rewrite |
| persistence | snapshot: formula-source<br />history: formula-source<br />collaboration: formula-source<br />xlsxSource: rewrite-on-structural-edit |

### Semantics: analysis-regression

| Dimension | Contract |
| --- | --- |
| shape | scalar: accepted<br />range: accepted<br />array: accepted<br />broadcast: none<br />result: contextual |
| coercion | blank: function-defined<br />text: function-defined<br />boolean: function-defined<br />error: propagate |
| text | case: not-applicable<br />wildcard: not-applicable |
| environment | locale: invariant<br />dateSystem: not-applicable |
| numeric | tolerance: binary64<br />domain: function-defined<br />iteration: kind: none<br />maximum: none |
| calculation | dependencies: tracked<br />lazy: eager<br />spill: contextual<br />fill: relative-reference-rewrite<br />copy: relative-reference-rewrite<br />structuralRewrite: ast-reference-rewrite |
| persistence | snapshot: formula-source<br />history: formula-source<br />collaboration: formula-source<br />xlsxSource: rewrite-on-structural-edit |

### Semantics: analysis-math

| Dimension | Contract |
| --- | --- |
| shape | scalar: accepted<br />range: accepted<br />array: accepted<br />broadcast: none<br />result: contextual |
| coercion | blank: function-defined<br />text: function-defined<br />boolean: function-defined<br />error: function-defined |
| text | case: not-applicable<br />wildcard: not-applicable |
| environment | locale: invariant<br />dateSystem: not-applicable |
| numeric | tolerance: binary64<br />domain: function-defined<br />iteration: kind: none<br />maximum: none |
| calculation | dependencies: tracked<br />lazy: eager<br />spill: contextual<br />fill: relative-reference-rewrite<br />copy: relative-reference-rewrite<br />structuralRewrite: ast-reference-rewrite |
| persistence | snapshot: formula-source<br />history: formula-source<br />collaboration: formula-source<br />xlsxSource: rewrite-on-structural-edit |

### Semantics: analysis-database

| Dimension | Contract |
| --- | --- |
| shape | scalar: accepted<br />range: accepted<br />array: accepted<br />broadcast: none<br />result: scalar |
| coercion | blank: function-defined<br />text: function-defined<br />boolean: function-defined<br />error: function-defined |
| text | case: insensitive<br />wildcard: supported |
| environment | locale: invariant<br />dateSystem: not-applicable |
| numeric | tolerance: binary64<br />domain: function-defined<br />iteration: kind: none<br />maximum: none |
| calculation | dependencies: tracked<br />lazy: eager<br />spill: scalar<br />fill: relative-reference-rewrite<br />copy: relative-reference-rewrite<br />structuralRewrite: ast-reference-rewrite |
| persistence | snapshot: formula-source<br />history: formula-source<br />collaboration: formula-source<br />xlsxSource: rewrite-on-structural-edit |

### Semantics: analysis-lambda

| Dimension | Contract |
| --- | --- |
| shape | scalar: accepted<br />range: accepted<br />array: accepted<br />broadcast: none<br />result: contextual |
| coercion | blank: function-defined<br />text: function-defined<br />boolean: function-defined<br />error: propagate |
| text | case: not-applicable<br />wildcard: not-applicable |
| environment | locale: invariant<br />dateSystem: not-applicable |
| numeric | tolerance: binary64<br />domain: function-defined<br />iteration: kind: bounded<br />maximum: 2000000 |
| calculation | dependencies: tracked<br />lazy: function-defined<br />spill: contextual<br />fill: relative-reference-rewrite<br />copy: relative-reference-rewrite<br />structuralRewrite: ast-reference-rewrite |
| persistence | snapshot: formula-source<br />history: formula-source<br />collaboration: formula-source<br />xlsxSource: rewrite-on-structural-edit |

### Semantics: analysis-groupby

| Dimension | Contract |
| --- | --- |
| shape | scalar: accepted<br />range: accepted<br />array: accepted<br />broadcast: none<br />result: contextual |
| coercion | blank: function-defined<br />text: function-defined<br />boolean: function-defined<br />error: propagate |
| text | case: insensitive<br />wildcard: not-applicable |
| environment | locale: invariant<br />dateSystem: not-applicable |
| numeric | tolerance: binary64<br />domain: function-defined<br />iteration: kind: bounded<br />maximum: 2000000 |
| calculation | dependencies: tracked<br />lazy: function-defined<br />spill: contextual<br />fill: relative-reference-rewrite<br />copy: relative-reference-rewrite<br />structuralRewrite: ast-reference-rewrite |
| persistence | snapshot: formula-source<br />history: formula-source<br />collaboration: formula-source<br />xlsxSource: rewrite-on-structural-edit |

## Dialect profiles

### Dialect: regex-lite-subset

| Dialect | Status |
| --- | --- |
| Microsoft Excel | divergent |
| Google Sheets | unverified |
| OpenFormula | unverified |

Limitations: REGEXTEST, REGEXEXTRACT, and REGEXREPLACE use the regex-lite syntax, not full PCRE2. Lookaround, backreferences, Unicode classes such as \p{L}, and other patterns the engine cannot compile return #VALUE!. \d, \s, and \w use ASCII character classes. \b uses ASCII word boundaries. As in Excel, caseSensitivity is 0 (case-sensitive, the default) or 1 (case-insensitive). Case-insensitive matching and the (?i) flag fold ASCII letters only. If caseSensitivity is 1 or the pattern enables an inline i flag, a pattern with a non-ASCII cased letter or a \x, \u, or \U escape returns #VALUE!. Regex programs are limited to 2 MiB. Text inputs and outputs are limited to 32,767 characters.

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

### Dialect: analysis-descriptive

| Dialect | Status |
| --- | --- |
| Microsoft Excel | documented |
| Google Sheets | unverified |
| OpenFormula | unverified |

Limitations: Available only in the optional @sheetwrite/formulas analysis build; default @sheetwrite/wasm returns #NAME?. Regression functions skip pairs where either value is not a number. PERCENTRANK results are truncated, not rounded, to the requested significant digits.

### Dialect: analysis-regression

| Dialect | Status |
| --- | --- |
| Microsoft Excel | documented |
| Google Sheets | unverified |
| OpenFormula | unverified |

Limitations: Available only in the optional @sheetwrite/formulas analysis build; default @sheetwrite/wasm returns #NAME?.

### Dialect: analysis-math

| Dialect | Status |
| --- | --- |
| Microsoft Excel | documented |
| Google Sheets | unverified |
| OpenFormula | unverified |

Limitations: Available only in the optional @sheetwrite/formulas analysis build; default @sheetwrite/wasm returns #NAME?. Hidden rows are not part of the engine model. AGGREGATE row visibility options therefore have no effect. Matrix functions use engine resource limits.

### Dialect: analysis-database

| Dialect | Status |
| --- | --- |
| Microsoft Excel | documented |
| Google Sheets | unverified |
| OpenFormula | unverified |

Limitations: Available only in the optional @sheetwrite/formulas analysis build; default @sheetwrite/wasm returns #NAME?. Database criteria use header names, AND across columns, and OR across rows. Custom formula predicates under headers that are not database fields are not supported.

### Dialect: analysis-lambda

| Dialect | Status |
| --- | --- |
| Microsoft Excel | documented |
| Google Sheets | unverified |
| OpenFormula | unverified |

Limitations: Available only in @sheetwrite/formulas. Named ranges are supported, but workbook-defined named formulas are not available. LAMBDA uses lexical parameters and LET bindings. Calls are limited to depth 64 and 2000000 work units. Helpers reject nested arrays.

### Dialect: analysis-groupby

| Dialect | Status |
| --- | --- |
| Microsoft Excel | documented |
| Google Sheets | unverified |
| OpenFormula | unverified |

Limitations: Available only in @sheetwrite/formulas. Aggregators must be a single eta-reduced built-in or a LAMBDA with one or two parameters. Vectors of functions are not supported. Grouping and output use the engine spill and work limits.

## Implementation profiles

### Implementation: text-analysis

| Layer | Status and source/evidence |
| --- | --- |
| Parser | implemented<br />[`packages/wasm/src/eval/analysis/mod.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/eval/analysis/mod.rs) |
| Evaluator | implemented<br />[`packages/wasm/src/eval/analysis/text.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/eval/analysis/text.rs) |
| Formula assist | implemented<br />[`packages/wasm/src/eval/analysis/mod.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/eval/analysis/mod.rs) |
| Evidence | behavior-tested<br />[`packages/wasm/src/eval/analysis/text.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/eval/analysis/text.rs) |

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

### Implementation: analysis-descriptive

| Layer | Status and source/evidence |
| --- | --- |
| Parser | implemented<br />[`packages/wasm/src/calc.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/calc.rs) |
| Evaluator | implemented<br />[`packages/wasm/src/eval/analysis/descriptive.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/eval/analysis/descriptive.rs) |
| Formula assist | implemented<br />[`packages/core/src/formula-assist.ts`](https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/formula-assist.ts) |
| Evidence | source-linked<br />[`scripts/formula-contract.test.ts`](https://github.com/chh-ay/sheetwrite/blob/main/scripts/formula-contract.test.ts) |

### Implementation: analysis-dates

| Layer | Status and source/evidence |
| --- | --- |
| Parser | implemented<br />[`packages/wasm/src/calc.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/calc.rs) |
| Evaluator | implemented<br />[`packages/wasm/src/eval/analysis/dates.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/eval/analysis/dates.rs) |
| Formula assist | implemented<br />[`packages/core/src/formula-assist.ts`](https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/formula-assist.ts) |
| Evidence | source-linked<br />[`scripts/formula-contract.test.ts`](https://github.com/chh-ay/sheetwrite/blob/main/scripts/formula-contract.test.ts) |

### Implementation: analysis-finance

| Layer | Status and source/evidence |
| --- | --- |
| Parser | implemented<br />[`packages/wasm/src/calc.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/calc.rs) |
| Evaluator | implemented<br />[`packages/wasm/src/eval/analysis/finance.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/eval/analysis/finance.rs) |
| Formula assist | implemented<br />[`packages/core/src/formula-assist.ts`](https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/formula-assist.ts) |
| Evidence | source-linked<br />[`scripts/formula-contract.test.ts`](https://github.com/chh-ay/sheetwrite/blob/main/scripts/formula-contract.test.ts) |

### Implementation: analysis-regression

| Layer | Status and source/evidence |
| --- | --- |
| Parser | implemented<br />[`packages/wasm/src/calc.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/calc.rs) |
| Evaluator | implemented<br />[`packages/wasm/src/eval/analysis/regression.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/eval/analysis/regression.rs) |
| Formula assist | implemented<br />[`packages/core/src/formula-assist.ts`](https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/formula-assist.ts) |
| Evidence | source-linked<br />[`packages/wasm/src/eval/analysis/regression.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/eval/analysis/regression.rs)<br />[`scripts/formula-contract.test.ts`](https://github.com/chh-ay/sheetwrite/blob/main/scripts/formula-contract.test.ts) |

### Implementation: analysis-math

| Layer | Status and source/evidence |
| --- | --- |
| Parser | implemented<br />[`packages/wasm/src/calc.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/calc.rs) |
| Evaluator | implemented<br />[`packages/wasm/src/eval/analysis/math.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/eval/analysis/math.rs)<br />[`packages/wasm/src/eval/analysis/aggregate.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/eval/analysis/aggregate.rs)<br />[`packages/wasm/src/eval/analysis/matrices.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/eval/analysis/matrices.rs) |
| Formula assist | implemented<br />[`packages/core/src/formula-assist.ts`](https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/formula-assist.ts) |
| Evidence | source-linked<br />[`scripts/formula-contract.test.ts`](https://github.com/chh-ay/sheetwrite/blob/main/scripts/formula-contract.test.ts) |

### Implementation: analysis-database

| Layer | Status and source/evidence |
| --- | --- |
| Parser | implemented<br />[`packages/wasm/src/calc.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/calc.rs) |
| Evaluator | implemented<br />[`packages/wasm/src/eval/analysis/database.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/eval/analysis/database.rs) |
| Formula assist | implemented<br />[`packages/core/src/formula-assist.ts`](https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/formula-assist.ts) |
| Evidence | source-linked<br />[`scripts/formula-contract.test.ts`](https://github.com/chh-ay/sheetwrite/blob/main/scripts/formula-contract.test.ts) |

### Implementation: analysis-reshape

| Layer | Status and source/evidence |
| --- | --- |
| Parser | implemented<br />[`packages/wasm/src/calc.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/calc.rs) |
| Evaluator | implemented<br />[`packages/wasm/src/eval/analysis/reshape.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/eval/analysis/reshape.rs) |
| Formula assist | implemented<br />[`packages/core/src/formula-assist.ts`](https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/formula-assist.ts) |
| Evidence | source-linked<br />[`packages/wasm/src/eval/analysis/reshape.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/eval/analysis/reshape.rs) |

### Implementation: analysis-lambda

| Layer | Status and source/evidence |
| --- | --- |
| Parser | implemented<br />[`packages/wasm/src/calc.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/calc.rs) |
| Evaluator | implemented<br />[`packages/wasm/src/eval/analysis/lambda.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/eval/analysis/lambda.rs) |
| Formula assist | implemented<br />[`packages/core/src/formula-assist.ts`](https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/formula-assist.ts) |
| Evidence | source-linked<br />[`packages/wasm/src/eval/analysis/lambda.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/eval/analysis/lambda.rs) |

### Implementation: analysis-groupby

| Layer | Status and source/evidence |
| --- | --- |
| Parser | implemented<br />[`packages/wasm/src/calc.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/calc.rs) |
| Evaluator | implemented<br />[`packages/wasm/src/eval/analysis/groupby.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/eval/analysis/groupby.rs) |
| Formula assist | implemented<br />[`packages/core/src/formula-assist.ts`](https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/formula-assist.ts) |
| Evidence | source-linked<br />[`packages/wasm/src/eval/analysis/groupby.rs`](https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/src/eval/analysis/groupby.rs) |

## Unsupported categories

Unknown functions retain their source and evaluate to `#NAME?`; Sheetwrite does not silently execute a network, custom-code, or compatibility fallback.

| Category | Scope | Examples | Source | Evidence |
| --- | --- | --- | --- | --- |
| **Volatile recalculation** (`volatile`) | Automatic volatility semantics beyond the existing clock functions are outside the supported contract. | `INDIRECT`, `OFFSET`, `RAND`, `RANDBETWEEN`, `RANDARRAY` | [Math and trigonometry functions](https://support.microsoft.com/en-us/office/excel-functions-by-category-5f91f4e9-7b42-46d2-9bd1-63f26a86c0eb) | [`scripts/formula-contract.test.ts`](https://github.com/chh-ay/sheetwrite/blob/main/scripts/formula-contract.test.ts) |
| **Network functions** (`network`) | Formula evaluation never performs network requests. | `ENCODEURL`, `FILTERXML`, `IMAGE`, `WEBSERVICE` | [Web functions](https://support.microsoft.com/en-us/office/excel-functions-by-category-5f91f4e9-7b42-46d2-9bd1-63f26a86c0eb) | [`scripts/formula-contract.test.ts`](https://github.com/chh-ay/sheetwrite/blob/main/scripts/formula-contract.test.ts) |
| **External data functions** (`external`) | Functions that query external providers or live data connections are not evaluated. | `GOOGLEFINANCE`, `IMPORTDATA`, `IMPORTHTML`, `IMPORTXML`, `RTD` | [Add-in and Automation functions](https://support.microsoft.com/en-us/office/excel-functions-by-category-5f91f4e9-7b42-46d2-9bd1-63f26a86c0eb) | [`scripts/formula-contract.test.ts`](https://github.com/chh-ay/sheetwrite/blob/main/scripts/formula-contract.test.ts) |
| **Cube functions** (`cube`) | OLAP cube members, sets, and values are not resolved. | `CUBEMEMBER`, `CUBESET`, `CUBEVALUE` | [Cube functions](https://support.microsoft.com/en-us/office/excel-functions-by-category-5f91f4e9-7b42-46d2-9bd1-63f26a86c0eb) | [`scripts/formula-contract.test.ts`](https://github.com/chh-ay/sheetwrite/blob/main/scripts/formula-contract.test.ts) |
| **Arbitrary external workbook references** (`external-workbook`) | References to arbitrary workbook files are not loaded or dereferenced. | `'[Book.xlsx]Sheet1'!A1` | [Lookup and reference functions](https://support.microsoft.com/en-us/office/excel-functions-by-category-5f91f4e9-7b42-46d2-9bd1-63f26a86c0eb) | [`scripts/formula-contract.test.ts`](https://github.com/chh-ay/sheetwrite/blob/main/scripts/formula-contract.test.ts) |

In particular, automatic volatile functions beyond the explicit host-clock barrier, network/external-data functions, arbitrary external workbook links, database functions, cube/OLAP functions, and `LAMBDA`/higher-order execution are unsupported. `TODAY` and `NOW` are the documented clock-function exception; `LET` is supported and is not a `LAMBDA` fallback.
