---
title: Analysis formulas
description: "Summarize, forecast, and clean data with the full formula engine. Worked examples for every function family in @sheetwrite/formulas."
---

The full formula engine, `@sheetwrite/formulas`, adds analysis functions to the
default engine: grouping and pivot tables, `LAMBDA` helpers, statistics,
regression, distributions, finance, dates, text and regex, reshaping, database
functions, and matrices. This guide shows one task for each family. The
[formula function contract](/docs/reference/formula-functions/) lists every
function, its signature, and its build. The
[formulas guide](/docs/guides/formulas/) explains syntax, references, errors,
and spills. To see these functions recalculate live over 20,000 orders, open the
[formula analysis showcase](/showcases/formulas/).

## Select the engine

Select the full engine one time, before you create a Grid or a store. The rest
of the API does not change.

```ts prelude="core" partial="requires surrounding host state" title="Select the full engine"
import { initSheetwrite } from "@sheetwrite/core";
import * as formulas from "@sheetwrite/formulas";

await initSheetwrite(undefined, formulas);
```

With the default engine, these functions return `#NAME?`, and formula assist
does not suggest them.

## The example data

All examples use this sheet of 12 orders in `A1:G12`. Column E holds
`Units × Price`, and column F holds order dates.

| Row | A Region | B Product | C Units | D Price | E Revenue | F Date | G Note |
| --- | --- | --- | ---: | ---: | ---: | --- | --- |
| 1 | North | Desk | 4 | 250 | 1,000 | 2026-01-05 | Ref INV-1042; ship by Friday |
| 2 | South | Chair | 10 | 80 | 800 | 2026-01-09 | Ref INV-1043; gift wrap |
| 3 | North | Chair | 6 | 80 | 480 | 2026-01-14 | Ref INV-1044 |
| 4 | East | Desk | 2 | 250 | 500 | 2026-01-20 | Ref INV-1045; call 555-0142 |
| 5 | South | Lamp | 15 | 30 | 450 | 2026-02-02 | Ref INV-1046 |
| 6 | East | Lamp | 8 | 30 | 240 | 2026-02-06 | Ref INV-1047; ship by Monday |
| 7 | North | Lamp | 12 | 30 | 360 | 2026-02-11 | Ref INV-1048 |
| 8 | South | Desk | 3 | 250 | 750 | 2026-02-17 | Ref INV-1049 |
| 9 | East | Chair | 7 | 80 | 560 | 2026-02-23 | Ref INV-1050; call 555-0187 |
| 10 | North | Desk | 5 | 250 | 1,250 | 2026-03-03 | Ref INV-1051 |
| 11 | South | Chair | 9 | 80 | 720 | 2026-03-10 | Ref INV-1052 |
| 12 | East | Desk | 1 | 250 | 250 | 2026-03-16 | Ref INV-1053; gift wrap |

Cash flows for the finance examples are in `H1:I4`: −10,000 on 2026-01-01,
2,500 on 2026-04-01, 4,200 on 2026-09-01, and 6,000 on 2026-12-31.

Every result below comes from the full engine. Results that spill are shown as
the cells they fill.

## Summarize: GROUPBY, PIVOTBY, PERCENTOF

`GROUPBY` groups rows by one or more key columns and aggregates the values. It
adds a total row by default.

```text partial="formula examples" title="Revenue by region"
=GROUPBY(A1:A12, E1:E12, SUM)
```

| Region | Revenue |
| --- | ---: |
| East | 1550 |
| North | 3090 |
| South | 2720 |
| Total | 7360 |

`PIVOTBY` adds column keys:

```text partial="formula examples" title="Revenue by region and product"
=PIVOTBY(A1:A12, B1:B12, E1:E12, SUM)
```

| | Chair | Desk | Lamp | Total |
| --- | ---: | ---: | ---: | ---: |
| East | 560 | 750 | 240 | 1550 |
| North | 480 | 2250 | 360 | 3090 |
| South | 1520 | 750 | 450 | 2720 |
| Total | 2560 | 3750 | 1050 | 7360 |

The optional arguments control headers, totals, and sort order. `PERCENTOF` as
the function gives each group's share, and a `LAMBDA` can be the function:

| Formula | Result |
| --- | --- |
| `=GROUPBY(A1:A12, E1:E12, SUM, 0, 0, -2)` | North 3090, South 2720, East 1550 (no total, largest first) |
| `=GROUPBY(A1:A12, E1:E12, PERCENTOF, 0, 0)` | East 0.2106, North 0.4198, South 0.3696 |
| `=GROUPBY(B1:B12, C1:C12, LAMBDA(units, MAX(units)), 0, 0)` | Chair 10, Desk 5, Lamp 15 |

A vector of functions, such as `HSTACK(SUM, AVERAGE)`, returns `#VALUE!`. Use
one function per `GROUPBY`.

## Your own functions: LAMBDA, MAP, REDUCE, SCAN, BYROW

`LAMBDA` makes a function from parameters and a calculation. The helpers call it
for each value, row, or column.

| Formula | Result |
| --- | --- |
| `=MAP(C1:C3, D1:D3, LAMBDA(units, price, units * price))` | 1000; 800; 480 (spills down) |
| `=REDUCE(0, E1:E12, LAMBDA(total, x, IF(x >= 1000, total + x, total)))` | 2250 |
| `=SCAN(0, E1:E4, LAMBDA(running, x, running + x))` | 1000; 1800; 2280; 2780 (running total) |
| `=BYROW(C1:D3, LAMBDA(row, PRODUCT(row)))` | 1000; 800; 480 |
| `=LET(big, LAMBDA(x, x >= 1000), FILTER(B1:B12, MAP(E1:E12, big)))` | Desk; Desk |

`LET` can name a `LAMBDA` and call it later. An uncalled `LAMBDA` returns
`#CALC!`, and a call with the wrong number of arguments returns `#VALUE!`. Calls
nest up to 64 deep.

## Describe: statistics and ranking

| Formula | Result | Meaning |
| --- | --- | --- |
| `=TRIMMEAN(E1:E12, 0.2)` | 587 | Mean revenue without the top and bottom 10% |
| `=PERCENTILE.EXC(E1:E12, 0.9)` | 1175 | 90th percentile order |
| `=RANK.AVG(E2, E1:E12)` | 3 | The South chair order is the third largest |
| `=SKEW(E1:E12)` | 0.784 | Revenue has a tail of large orders |
| `=FREQUENCY(E1:E12, {500, 1000})` | 6; 5; 1 | Orders up to 500, up to 1,000, and above |
| `=MODE.MULT({4, 10, 6, 4, 15, 10, 8})` | 4; 10 | Every most frequent value |

## Forecast: regression

Monthly revenue for six months was 1200, 1350, 1500, 1580, 1700, and 1850.

| Formula | Result |
| --- | --- |
| `=FORECAST.LINEAR(7, {1200,1350,1500,1580,1700,1850}, {1,2,3,4,5,6})` | 1968 |
| `=TREND({1200;1350;1500;1580;1700;1850}, {1;2;3;4;5;6}, {7;8;9})` | 1968; 2093.14; 2218.29 |
| `=LINEST({1200;1350;1500;1580;1700;1850}, {1;2;3;4;5;6})` | 125.14, 1092 (slope, intercept) |

`LINEST` and `LOGEST` accept more than one predictor column, the `const`
argument, and `stats = TRUE` for five rows of fit statistics. `TREND` and
`GROWTH` project new values from the same fit.

## Estimate risk: distributions

| Formula | Result | Meaning |
| --- | --- | --- |
| `=NORM.INV(0.95, 1000, 120)` | 1197.38 | Demand that covers 95% of days, with mean 1000 and deviation 120 |
| `=BINOM.DIST(3, 10, 0.2, FALSE)` | 0.2013 | Chance of exactly 3 returns in 10 orders at a 20% return rate |
| `=CONFIDENCE.T(0.05, STDEV.S(E1:E12), 12)` | 193.05 | Half-width of the 95% interval for mean revenue |

The engine has 36 distribution functions: normal, Student t, chi-squared, F,
binomial, Poisson, exponential, gamma, beta, lognormal, and Weibull, with their
inverses.

## Plan money: finance

| Formula | Result | Meaning |
| --- | --- | --- |
| `=XIRR(H1:H4, I1:I4)` | 0.3897 | Annual return of irregular cash flows (39%) |
| `=XNPV(0.08, H1:H4, I1:I4)` | 1999.96 | Their value today at 8% a year |
| `=PMT(0.06/12, 36, -25000)` | 760.55 | Monthly payment on a 25,000 loan over 3 years at 6% |
| `=CUMIPMT(0.06/12, 36, 25000, 1, 12, 0)` | −1286.73 | Interest paid in the first year of that loan |

The full engine also has `MIRR`, `NPER`, `CUMPRINC`, `EFFECT`, `NOMINAL`, and
depreciation functions (`SLN`, `DB`, `DDB`, `SYD`).

## Schedule: working days and dates

| Formula | Result |
| --- | --- |
| `=NETWORKDAYS.INTL(DATE(2026,1,1), DATE(2026,1,31), 1)` | 22 working days |
| `=WORKDAY.INTL(DATE(2026,1,30), 5, "0000011")` | 46059, that is 2026-02-06 |
| `=DATEDIF(DATE(2024,3,15), DATE(2026,1,5), "m")` | 21 full months |
| `=ISOWEEKNUM(DATE(2026,1,5))` | 2 |

The weekend argument is a number or a seven-character mask that starts on
Monday: `"0000011"` means Saturday and Sunday. A holiday range is the optional
last argument.

## Clean text: split, extract, and regex

| Formula | Result |
| --- | --- |
| `=TEXTSPLIT("North,South,East", ",")` | North, South, East (spills across) |
| `=TEXTBEFORE(G1, ";")` | Ref INV-1042 |
| `=TEXTAFTER(G1, "; ")` | ship by Friday |
| `=REGEXEXTRACT(G1, "INV-[0-9]+")` | INV-1042 |
| `=REGEXREPLACE(G4, "[0-9]{3}-[0-9]{4}", "***-****")` | Ref INV-1045; call \*\*\*-\*\*\*\* |
| `=REGEXTEST(G6, "ship by")` | TRUE |
| `=ARRAYTOTEXT({"North", "South"})` | North, South |

Regex uses the regex-lite syntax. Patterns with lookaround, backreferences, or
Unicode classes return `#VALUE!`, never a wrong match. Case-insensitive matching
folds ASCII letters only.

## Reshape arrays

| Formula | Result |
| --- | --- |
| `=VSTACK({"Region","Units"}, HSTACK(A1:A3, C1:C3))` | A header row on top of North 4, South 10, North 6 |
| `=TAKE(SORTBY(HSTACK(B1:B12, E1:E12), E1:E12, -1), 3)` | Desk 1250, Desk 1000, Chair 800 |
| `=WRAPROWS(SEQUENCE(6), 3)` | 1, 2, 3 / 4, 5, 6 |
| `=TOCOL({1,2;3,4})` | 1; 2; 3; 4 |
| `=EXPAND({1,2;3,4}, 3, 3, 0)` | The 2 × 2 array padded to 3 × 3 with 0 |

`SORTBY` keeps equal items in their order. `TOCOL` and `TOROW` can skip blanks
and errors and read by row or by column.

## Query tables: database functions

Database functions take a table with a header row, a field, and a criteria table
with the same headers. Criteria columns use AND, and criteria rows use OR.

| Formula | Result |
| --- | --- |
| `=DSUM({"Region","Units";"North",4;"South",10;"North",6}, "Units", {"Region";"North"})` | 10 |
| `=DAVERAGE({"Region","Units";"North",4;"South",10;"North",6}, "Units", {"Region";"North"})` | 5 |

In a workbook, the table and the criteria are usually ranges, such as
`=DSUM(A1:E200, "Revenue", H1:H2)`.

## Matrices

| Formula | Result |
| --- | --- |
| `=MMULT({1,2;3,4}, {5;6})` | 17; 39 |
| `=MINVERSE({4,7;2,6})` | 0.6, −0.7 / −0.2, 0.4 |
| `=MDETERM({4,7;2,6})` | 10 |
| `=SUMSQ(C1:C3)` | 152 |

## Limits

- All these functions use the normal spill, shape, memory, and work limits. A
  result that does not fit returns an error, not a partial result.
- `AGGREGATE` options that skip hidden rows have no effect, because formulas do
  not see hidden-row state.
- Each family's exact argument rules are in the
  [formula function contract](/docs/reference/formula-functions/).
