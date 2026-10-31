---
title: "Formula function contract"
description: "Generated, source-linked formula names, signatures, semantics, dialect status, and unsupported boundaries."
---

This page is generated from the checked version 1 `sheetwrite.formula-capabilities` inventory. It publishes **100 required-supported target functions**, **63 incumbent functions**, and **145 optional analysis functions** (308 canonical functions total) without maintaining a second name list. Aliases share their canonical function's build availability.

A function's presence means only the signature and semantic profiles linked in its row. Microsoft Excel documentation supplies the naming/family taxonomy; it is not a blanket Excel claim. The [Excel function coverage](/docs/reference/excel-function-coverage/) page lists every Excel catalog name, including names that are not supported. Google Sheets and OpenFormula behavior is unverified unless a dialect profile says otherwise.

## Functions by family

Each family has its own page with the engine build and the contract profiles of every function.

| Family | Functions | Full engine only | Names |
| --- | ---: | ---: | --- |
| [Dynamic array](/docs/reference/formula-functions/array/) | 20 | 11 | `FILTER`, `SORT`, `UNIQUE`, `TRANSPOSE`, `SEQUENCE`, `TAKE`, `DROP`, `CHOOSECOLS`, `CHOOSEROWS`, `EXPAND`, `HSTACK`, `SORTBY`, `TOCOL`, `TOROW`, `VSTACK`, `WRAPCOLS`, `WRAPROWS`, `GROUPBY`, `PIVOTBY`, `PERCENTOF` |
| [Date and time](/docs/reference/formula-functions/date-time/) | 25 | 4 | `DATE`, `DATEVALUE`, `DAY`, `MONTH`, `YEAR`, `TODAY`, `NOW`, `TIME`, `TIMEVALUE`, `HOUR`, `MINUTE`, `SECOND`, `DAYS`, `EDATE`, `EOMONTH`, `WEEKDAY`, `WEEKNUM`, `WORKDAY`, `NETWORKDAYS`, `YEARFRAC`, `DAYS360`, `DATEDIF`, `ISOWEEKNUM`, `NETWORKDAYS.INTL`, `WORKDAY.INTL` |
| [Financial](/docs/reference/formula-functions/financial/) | 23 | 15 | `PV`, `FV`, `PMT`, `NPV`, `IRR`, `RATE`, `IPMT`, `PPMT`, `CUMIPMT`, `CUMPRINC`, `DB`, `DDB`, `EFFECT`, `FVSCHEDULE`, `MIRR`, `NOMINAL`, `NPER`, `PDURATION`, `RRI`, `SLN`, `SYD`, `XIRR`, `XNPV` |
| [Information and error](/docs/reference/formula-functions/information-error/) | 16 | 1 | `IFERROR`, `IFNA`, `ISBLANK`, `ISNUMBER`, `ISTEXT`, `ISLOGICAL`, `ISERROR`, `ISERR`, `ISNA`, `TYPE`, `ISFORMULA`, `N`, `T`, `NA`, `CELL`, `ISOMITTED` |
| [Logical and control flow](/docs/reference/formula-functions/logical-control/) | 17 | 7 | `IF`, `AND`, `OR`, `NOT`, `IFS`, `SWITCH`, `XOR`, `TRUE`, `FALSE`, `LET`, `LAMBDA`, `MAP`, `REDUCE`, `SCAN`, `BYROW`, `BYCOL`, `MAKEARRAY` |
| [Lookup and reference](/docs/reference/formula-functions/lookup-reference/) | 17 | 0 | `INDEX`, `MATCH`, `VLOOKUP`, `HLOOKUP`, `XLOOKUP`, `XMATCH`, `CHOOSE`, `ROW`, `ROWS`, `COLUMN`, `COLUMNS`, `ADDRESS`, `OFFSET`, `INDIRECT`, `AREAS`, `FORMULATEXT`, `HYPERLINK` |
| [Math and trigonometry](/docs/reference/formula-functions/math/) | 52 | 20 | `SUM`, `ABS`, `ROUND`, `SQRT`, `MOD`, `POW`, `FLOOR`, `CEILING`, `INT`, `TRUNC`, `SIGN`, `PI`, `RAND`, `RANDBETWEEN`, `SUMIF`, `SUMIFS`, `PRODUCT`, `SUMPRODUCT`, `POWER`, `EXP`, `LN`, `LOG`, `LOG10`, `ROUNDUP`, `ROUNDDOWN`, `MROUND`, `EVEN`, `ODD`, `QUOTIENT`, `GCD`, `LCM`, `SUBTOTAL`, `AGGREGATE`, `CEILING.MATH`, `COMBIN`, `COMBINA`, `FACT`, `FACTDOUBLE`, `FLOOR.MATH`, `MDETERM`, `MINVERSE`, `MMULT`, `MULTINOMIAL`, `MUNIT`, `PERMUT`, `PERMUTATIONA`, `SERIESSUM`, `SQRTPI`, `SUMSQ`, `SUMX2MY2`, `SUMX2PY2`, `SUMXMY2` |
| [Statistical](/docs/reference/formula-functions/statistical/) | 92 | 65 | `AVERAGE`, `MIN`, `MAX`, `COUNT`, `COUNTA`, `COUNTIF`, `COUNTIFS`, `AVERAGEIF`, `AVERAGEIFS`, `MEDIAN`, `MODE.SNGL`, `LARGE`, `SMALL`, `RANK.EQ`, `PERCENTILE.INC`, `QUARTILE.INC`, `STDEV.S`, `STDEV.P`, `VAR.S`, `VAR.P`, `GEOMEAN`, `CORREL`, `COVARIANCE.S`, `COVARIANCE.P`, `COUNTBLANK`, `MAXIFS`, `MINIFS`, `NORM.DIST`, `NORM.INV`, `NORM.S.DIST`, `NORM.S.INV`, `T.DIST`, `T.DIST.2T`, `T.DIST.RT`, `T.INV`, `T.INV.2T`, `CHISQ.DIST`, `CHISQ.DIST.RT`, `CHISQ.INV`, `CHISQ.INV.RT`, `F.DIST`, `F.DIST.RT`, `F.INV`, `F.INV.RT`, `BINOM.DIST`, `POISSON.DIST`, `EXPON.DIST`, `GAMMA`, `GAMMALN`, `GAMMA.DIST`, `GAMMA.INV`, `BETA.DIST`, `BETA.INV`, `LOGNORM.DIST`, `LOGNORM.INV`, `WEIBULL.DIST`, `CONFIDENCE.NORM`, `CONFIDENCE.T`, `STANDARDIZE`, `FISHER`, `FISHERINV`, `PHI`, `GAUSS`, `AVEDEV`, `DEVSQ`, `HARMEAN`, `KURT`, `SKEW`, `SKEW.P`, `TRIMMEAN`, `PERCENTILE.EXC`, `QUARTILE.EXC`, `PERCENTRANK.INC`, `PERCENTRANK.EXC`, `RANK.AVG`, `PEARSON`, `RSQ`, `SLOPE`, `INTERCEPT`, `STEYX`, `FORECAST.LINEAR`, `FREQUENCY`, `MODE.MULT`, `GROWTH`, `LINEST`, `LOGEST`, `PERCENTILE`, `PERCENTRANK`, `PROB`, `QUARTILE`, `RANK`, `TREND` |
| [Text](/docs/reference/formula-functions/text/) | 34 | 10 | `ARRAYTOTEXT`, `DOLLAR`, `FIXED`, `REGEXEXTRACT`, `REGEXREPLACE`, `REGEXTEST`, `TEXTAFTER`, `TEXTBEFORE`, `TEXTSPLIT`, `VALUETOTEXT`, `LEN`, `LEFT`, `RIGHT`, `MID`, `CONCAT`, `UPPER`, `LOWER`, `TRIM`, `TEXT`, `EXACT`, `TEXTJOIN`, `SUBSTITUTE`, `REPLACE`, `FIND`, `SEARCH`, `VALUE`, `CLEAN`, `REPT`, `CHAR`, `CODE`, `UNICHAR`, `UNICODE`, `PROPER`, `NUMBERVALUE` |
| [Database](/docs/reference/formula-functions/database/) | 12 | 12 | `DAVERAGE`, `DCOUNT`, `DCOUNTA`, `DGET`, `DMAX`, `DMIN`, `DPRODUCT`, `DSTDEV`, `DSTDEVP`, `DSUM`, `DVAR`, `DVARP` |

## Engine builds

- `@sheetwrite/wasm` is the default engine. The Engine column shows `Default + full` for a function in both engines and `Full only` for a function in `@sheetwrite/formulas` only.
- `@sheetwrite/formulas` is the full engine. It adds the analysis families marked on the family pages: distributions and statistics, regression, finance, dates, text and regex, database, math and matrices, reshaping, LAMBDA helpers, and grouping. Select it before creating any stores: `import * as formulas from "@sheetwrite/formulas"; await initSheetwrite(undefined, formulas);`.
- The active engine's registered names drive formula assist. Optional names are not suggested by the default engine and evaluate to `#NAME?` there; merely importing the optional package does not enable them.
- Numeric functions use binary64 arithmetic with function-specific domains and bounded numerical algorithms. The inventory does not claim unlimited tail accuracy or complete Excel/Google Sheets/OpenFormula parity.

## Bounded evaluation contract

- Parsing and dependency evaluation are each capped at 256 recursive levels. Range and matrix work is capped at 1,000,000 cells, 1,048,576 rows, 16,384 columns, and 64 MiB of value/intermediate storage; excess work returns an explicit formula error rather than truncating.
- One dynamic-array recompute pass is capped at 2,000,000 cell operations. Spill installation is atomic and collision-checked; see [Dynamic arrays and spills](/docs/features/formulas/dynamic-arrays-and-spills/) for admission rules.
- `LET` permits at most 126 bindings and 16,384 expanded AST nodes. Bindings are lexical, shadow outer bindings, and are expanded lazily, so unused reads, errors, and volatility do not become dependencies.
- Generated text is capped at 16 MiB and bounded searches at 4,000,000 steps. Text case conversion and parsing are Unicode-aware and host-locale independent; `NUMBERVALUE` defaults to `.` decimal and `,` grouping separators unless supplied explicitly.
- `IRR` and `RATE` use deterministic root solving: 14 bracket steps, at most 100 solve steps, fixed `1e-12` convergence tolerances, and a finite search domain. Non-convergence or an invalid domain returns `#NUM!`.

No formula throughput or latency number is published here. The [formula engine performance](/docs/performance/formula-engine/) page has the measured results, and the [benchmark protocol](/docs/performance/benchmark-protocol/) shows how to capture and validate them; limits above are implementation ceilings, not benchmark results.

## Unsupported categories

Unknown functions retain their source and evaluate to `#NAME?`; Sheetwrite does not silently execute a network, custom-code, or compatibility fallback.

| Category | Scope | Examples | Source | Evidence |
| --- | --- | --- | --- | --- |
| **Volatile arrays** (`volatile`) | RANDARRAY returns a volatile array and is outside the supported contract. | `RANDARRAY` | [Math and trigonometry functions](https://support.microsoft.com/en-us/office/excel-functions-by-category-5f91f4e9-7b42-46d2-9bd1-63f26a86c0eb) | [`scripts/formula-contract.test.ts`](https://github.com/chh-ay/sheetwrite/blob/develop/scripts/formula-contract.test.ts) |
| **Network functions** (`network`) | Formula evaluation never performs network requests. | `ENCODEURL`, `FILTERXML`, `IMAGE`, `WEBSERVICE` | [Web functions](https://support.microsoft.com/en-us/office/excel-functions-by-category-5f91f4e9-7b42-46d2-9bd1-63f26a86c0eb) | [`scripts/formula-contract.test.ts`](https://github.com/chh-ay/sheetwrite/blob/develop/scripts/formula-contract.test.ts) |
| **External data functions** (`external`) | Functions that query external providers or live data connections are not evaluated. | `GOOGLEFINANCE`, `IMPORTDATA`, `IMPORTHTML`, `IMPORTXML`, `RTD` | [Add-in and Automation functions](https://support.microsoft.com/en-us/office/excel-functions-by-category-5f91f4e9-7b42-46d2-9bd1-63f26a86c0eb) | [`scripts/formula-contract.test.ts`](https://github.com/chh-ay/sheetwrite/blob/develop/scripts/formula-contract.test.ts) |
| **Cube functions** (`cube`) | OLAP cube members, sets, and values are not resolved. | `CUBEMEMBER`, `CUBESET`, `CUBEVALUE` | [Cube functions](https://support.microsoft.com/en-us/office/excel-functions-by-category-5f91f4e9-7b42-46d2-9bd1-63f26a86c0eb) | [`scripts/formula-contract.test.ts`](https://github.com/chh-ay/sheetwrite/blob/develop/scripts/formula-contract.test.ts) |
| **Arbitrary external workbook references** (`external-workbook`) | References to arbitrary workbook files are not loaded or dereferenced. | `'[Book.xlsx]Sheet1'!A1` | [Lookup and reference functions](https://support.microsoft.com/en-us/office/excel-functions-by-category-5f91f4e9-7b42-46d2-9bd1-63f26a86c0eb) | [`scripts/formula-contract.test.ts`](https://github.com/chh-ay/sheetwrite/blob/develop/scripts/formula-contract.test.ts) |

`RANDARRAY`, network/external-data functions, arbitrary external workbook links, and cube/OLAP functions are unsupported. `OFFSET`, `INDIRECT`, `RAND`, `RANDBETWEEN`, `TODAY` and `NOW` are volatile and recalculate after each edit. `OFFSET` and `INDIRECT` return references that can feed reference-taking functions or spill their values. `INDIRECT` reference text is not rewritten by fill, copy, or structural edits. Database functions and `LAMBDA` helpers require the full engine; `LET` is available in both engines.
