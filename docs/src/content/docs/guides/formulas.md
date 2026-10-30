---
title: Formulas
description: Use Sheetwrite formula syntax, references, functions, errors, and compatibility limits.
---

Sheetwrite evaluates formulas in the Rust/WASM calculation engine. Formula sources are persisted exactly as document values; evaluated results are cached for rendering, queries, export, and dependent formulas.

Sheetwrite intentionally implements a coherent spreadsheet subset. It does **not** claim full Google Sheets or Excel formula parity.

See the generated [formula function contract](/docs/reference/formula-functions/) for the complete inventory-derived function table and the [detailed compatibility results](/docs/reference/compatibility-results/) for checked operator, spill, preservation, and unsupported boundaries.

## Authoring formulas

A formula is a `CellValue` with `kind: "formula"`. The leading `=` is optional at the storage API, although UI input conventionally includes it.

```ts prelude="core" partial="requires surrounding host state" title="Partial example"
grid.store.applyTransaction({
  patches: [
    {
      op: "set",
      addr: { sheet: "sheet1", row: 5, col: 4 },
      value: { kind: "formula", src: "=SUM(E1:E5)" },
    },
  ],
});
```

`store.getFormula(address)` returns the source. `store.getCell(address).resolved` returns the evaluated scalar or error sentinel. An unsupported function evaluates to `#NAME?`, but its source remains retrievable and persists through snapshots/XLSX round-trips so a later engine can evaluate it.

## Supported formulas

The checked, versioned `sheetwrite.formula-capabilities` contract is the source of truth for function registration. Its generated reference lists every function in both engines, grouped by family, with aliases, exact signature and semantic profiles, implementation and evidence paths, source links, and behavior status. Do not infer support from an Excel, Google Sheets, or OpenFormula function with a similar name.

[Browse the generated formula function contract →](/docs/reference/formula-functions/)

## Full formula engine

Sheetwrite has two engine builds with the same API. `@sheetwrite/wasm` is the default engine: it has the standard function set and the smallest download. `@sheetwrite/formulas` is the full engine: the same engine with the analysis families below. An app selects one engine, one time, before it creates a Grid or a store:

```ts prelude="core" partial="requires surrounding host state" title="Select the full engine"
import { initSheetwrite } from "@sheetwrite/core";
import * as formulas from "@sheetwrite/formulas";

await initSheetwrite(undefined, formulas);
```

| Family | Examples |
| --- | --- |
| Distributions | `NORM.DIST`, `T.INV.2T`, `CHISQ.DIST.RT`, `BINOM.DIST`, `GAMMA.INV`, `CONFIDENCE.T` |
| Descriptive statistics | `TRIMMEAN`, `PERCENTILE.EXC`, `RANK.AVG`, `SKEW`, `KURT`, `FORECAST.LINEAR` |
| Regression | `LINEST`, `LOGEST`, `TREND`, `GROWTH`, `FREQUENCY`, `MODE.MULT` |
| Finance | `XIRR`, `XNPV`, `MIRR`, `NPER`, `CUMIPMT`, `DDB` |
| Dates | `NETWORKDAYS.INTL`, `WORKDAY.INTL`, `DATEDIF`, `ISOWEEKNUM` |
| Text and regex | `TEXTSPLIT`, `TEXTBEFORE`, `TEXTAFTER`, `REGEXEXTRACT`, `REGEXREPLACE`, `ARRAYTOTEXT` |
| Database | `DSUM`, `DAVERAGE`, `DCOUNT`, `DGET`, `DMAX`, `DSTDEV` |
| Math and matrices | `AGGREGATE`, `MMULT`, `MINVERSE`, `MDETERM`, `SUMSQ`, `COMBIN` |
| Reshaping | `SORTBY`, `HSTACK`, `VSTACK`, `TOCOL`, `WRAPROWS`, `EXPAND` |
| LAMBDA | `LAMBDA`, `MAP`, `REDUCE`, `SCAN`, `BYROW`, `BYCOL`, `MAKEARRAY`, `ISOMITTED` |
| Grouping | `GROUPBY`, `PIVOTBY`, `PERCENTOF` |

The default engine returns `#NAME?` for these functions, and formula assist does not suggest them. The [formula analysis showcase](/showcases/formulas/) runs thirteen panels of them live over 20,000 orders, and the [analysis formulas guide](/docs/guides/analysis-formulas/) shows each family with examples.

Limits of the full engine:

- `LAMBDA` parameters bind lexically, and `LET` can bind a `LAMBDA`. An uncalled `LAMBDA` returns `#CALC!`. A call with the wrong number of arguments returns `#VALUE!`. Calls are limited to a depth of 64 and 2,000,000 work units per outer helper; more returns `#NUM!`.
- `GROUPBY` and `PIVOTBY` accept one built-in function name, such as `SUM`, or a `LAMBDA` with one or two parameters. A vector of functions, such as `HSTACK(SUM,AVERAGE)`, returns `#VALUE!`.
- Regex functions do not support lookaround, backreferences, or Unicode classes. Such patterns return `#VALUE!`, never a wrong match.
- `AGGREGATE` options that skip hidden rows have no effect, because formulas do not see hidden-row state.

Function names are case-insensitive. Commas are the only documented argument separator. Interior omitted optional arguments are preserved (`XLOOKUP(key, keys, results,, 0)`). Locale-specific separators are not accepted.

## Scalars, coercion, and errors

Persisted literals and evaluated formula results use `string | number | boolean | null`. Boolean literals entered as `TRUE`/`FALSE`, formula comparisons, XLSX boolean cells, snapshots, visible windows, clipboard output, and CSV/TSV output remain booleans end to end. Display and text export use uppercase `TRUE` and `FALSE`.

| Sentinel | Meaning |
| --- | --- |
| `#REF!` | Missing sheet/cell reference or invalid reference structure. |
| `#VALUE!` | Wrong value type, malformed formula, invalid arity, or range-shape mismatch. |
| `#DIV/0!` | Division/modulo by zero or an empty criteria average. |
| `#NAME?` | Unknown function or unresolved named range. |
| `#N/A` | Lookup did not find a compatible value. |
| `#NUM!` | Non-finite numeric result, excessive recursion, or an oversized range. |
| `#SPILL!` | A dynamic result intersects content, another spill, a merge, validation/protection metadata, or a sheet boundary. |
| `#CALC!` | A supported array calculation has no result, such as `FILTER` without matches or an empty fallback. |
| `#CYCLE!` | Direct or transitive formula/reference cycle. |
| `#LOADING!` | A formula depends on datasource cells that have not loaded yet. |

Errors are values for display and dependency propagation, not `NaN` or blank rendering. `IFERROR` can replace them. Unsupported or malformed source remains stored even when the result is an error.

Coercion follows these documented rules:

- Arithmetic converts numeric text and booleans (`TRUE = 1`, `FALSE = 0`); nonnumeric text returns `#VALUE!`.
- Direct scalar boolean/text arguments may be coerced by numeric functions. Text/booleans reached through a range are ignored by numeric aggregates, matching common spreadsheet behavior.
- Empty scalar arithmetic behaves as zero. Empty range cells are skipped.
- Comparisons are case-insensitive for text and use spreadsheet type ordering.
- `AND`, `OR`, `NOT`, and `IF` accept booleans, numbers, and the text `TRUE`/`FALSE`.

## LET bindings

`LET(name1, value1, [name2, value2, …], calculation)` supports lexical, case-insensitive local names. A name starts with an ASCII letter or `_`; subsequent characters may also contain ASCII digits or `.`. Inner `LET` bindings shadow outer bindings, and each value expression can see only earlier bindings.

Bindings are lazy. Only names reachable from `calculation` are expanded and evaluated, so an unused cell read, error, or `NOW()` does not become a dependency, error, or volatile marker. A used binding preserves ordinary formula dependency, spill, copy/fill, and structural-reference behavior. `LET(x,1/0,7)` therefore returns `7`, while `LET(x,A1,x+1)` tracks `A1`.

One `LET` admits at most 126 bindings. Expansion admits at most 16,384 AST nodes across reachable bindings. Invalid name/arity/binding structure returns `#VALUE!`; expansion beyond the node ceiling returns `#NUM!`. In the full engine, a `LET` value can be a `LAMBDA`; see [Full formula engine](#full-formula-engine).

## References, ranges, and named ranges

A1 cells (`A1`, `$B12`, `AA$3`), rectangular ranges (`A1:B3`), and cross-sheet references (`Sales!E2`, `'Sales 2026'!E2:E10`) are supported. Absolute markers affect fill/structural rewriting; they do not change evaluation.

Named ranges are document operations and snapshot metadata:

```ts prelude="core" partial="requires surrounding host state" title="Partial example"
store.applyTransaction({
  patches: [
    {
      op: "setNamedRange",
      namedRange: {
        name: "Revenue",
        range: {
          sheet: "data",
          start: { row: 1, col: 4 },
          end: { row: 100, col: 4 },
        },
      },
    },
    {
      op: "setNamedRange",
      namedRange: {
        name: "Revenue",
        scope: "summary",
        range: {
          sheet: "data",
          start: { row: 1, col: 5 },
          end: { row: 100, col: 5 },
        },
      },
    },
  ],
});
```

A formula on `summary` resolves the sheet-scoped `Revenue`; formulas on other sheets resolve the workbook definition. Names are case-insensitive, must be formula-safe identifiers, and cannot look like A1 cells or boolean literals. Row/column insertions, removals, and moves rebase their rectangles. Deleting the complete target or its scope removes the definition; formulas then fall back to a workbook definition or evaluate to `#NAME?`.

### Intersection

A space between two references is the intersection operator. `=SUM(A1:C3 B2:D4)` adds the shared cells `B2:C3`. A one-cell intersection in a value position is the value of that cell. At the root of a formula, a larger intersection spills like a range. An empty intersection returns `#NULL!`. References on different sheets also return `#NULL!`. An operand that is not a reference returns `#VALUE!`.

Other spaces are not operators. Spaces around other operators, after commas, before `)`, and between a function name and `(` do not change the formula.

### Union

A comma inside parentheses that are not a function call is the union operator. `=SUM((A1:A2,C1:C2))` adds both ranges, and `=COUNT((A1,B2,C3))` counts three cells. A comma that separates function arguments is not a union.

Functions that read their arguments as a list of values accept a union. Examples are `SUM`, `COUNT`, `COUNTA`, `AVERAGE`, `MAX`, `MIN`, `PRODUCT`, `SMALL`, `LARGE`, `MEDIAN`, `STDEV.S`, `STDEV.P`, `VAR.S` and `VAR.P`. `INDEX(reference, row, [column], [area_num])` returns from area `area_num` of a union. The first area is `1`, which is the default. An `area_num` after the last area returns `#REF!`. `AREAS(reference)` returns the number of areas: the number of union members, or `1` for a cell, range or intersection. A union in other positions returns `#VALUE!`. Examples are `=(A1,B1)`, the table of `VLOOKUP`, and `ROWS`.

### 3-D references

A 3-D reference reads the same cell or range on a span of sheets: `=SUM(Jan:Mar!B2)` or `=SUM(Jan:Mar!B2:C5)`. If a sheet name needs quotes, quote the full span: `='Sheet 1:Sheet 3'!A1`. The span is all sheets from the first endpoint to the last endpoint, in workbook tab order.

These functions accept a 3-D reference: `SUM`, `AVERAGE`, `COUNT`, `COUNTA`, `MAX`, `MIN`, `PRODUCT`, `STDEV.S`, `STDEV.P`, `VAR.S` and `VAR.P`. A 3-D reference in other positions returns `#VALUE!`. On a sheet with a smaller grid, cells outside that grid are blank.

Sheet edits change the span as in Excel:

- A sheet that you insert or move between the endpoints joins the span.
- A sheet that you move out of the span leaves it.
- A deleted sheet leaves the span. If it is an endpoint, the endpoint moves to its inner neighbour and the formula text changes.
- If you move an endpoint past the other endpoint, that sheet leaves the span and its inner neighbour becomes the endpoint. For example, `Sheet2:Sheet6` becomes `Sheet3:Sheet6` when `Sheet2` moves after `Sheet6`.
- If you rename an endpoint, the formula text changes.
- If you delete all sheets of the span, the reference returns `#REF!`.

Row and column insertions and deletions on one sheet do not change a 3-D reference.

XLSX import and export keep the Excel formula text of intersections, unions and 3-D references, for example `SUM(Jan:Mar!A1)`, `SUM((A1,B1))` and `SUM(A1:A3 A2:A4)`.

## Array constants

Both engines accept array constants in braces. Commas separate columns and semicolons separate rows: `={1,2;3,4}` spills into two rows and two columns. `={1,2,3}` is one row; `={1;2;3}` is one column. Normal spill limits and collision rules apply.

Elements can be numbers with an optional sign, quoted text, `TRUE`, `FALSE`, or error constants such as `#N/A`. Every row must have the same length. Empty arrays, references, and expressions inside braces are invalid and return `#VALUE!`.

Functions that accept arrays can use these values directly, for example `=SUM({1,2,3})` returns `6` and `=INDEX({1,2;3,4},2,1)` returns `3`. Copy and structural edits preserve constants and their text elements. XLSX import and export preserve the formula source.

## Spill references

Put `#` after a cell reference to refer to the whole spill of the formula in that cell. If `A1` contains `=SEQUENCE(D1)`, then `=SUM(A1#)` adds all the values in the spill, and `=SORT(A1#,1,-1)` spills them in reverse order. When the spill changes size, formulas that use `A1#` use the new range. A sheet name is permitted: `='Report'!B2#`.

`A1#` returns `#REF!` when the cell does not hold a spill: for example, the cell contains a value, or a collision blocks the spill (`#SPILL!`). If you delete the row or column of the anchor cell, the reference becomes `#REF!`. Both engines support spill references. XLSX files store `A1#` as `_xlfn.ANCHORARRAY(A1)`; import and export convert between the two forms.

Arithmetic on a whole spill applies to each element. For example, `=A1#*10` multiplies each value in the spill by 10 and spills the result.

## Array arithmetic

Operators apply to each element of a range, array constant, spill reference, or dynamic-array result. This includes arithmetic (`+`, `-`, `*`, `/`, `^`), text concatenation (`&`), comparisons, unary `+` and `-`, and `%`.

For example, `=A1:A3*10` spills three results. `=FILTER(A1:A5,B1:B5>2)` uses a comparison array to select rows. `=SUMPRODUCT((A1:A5>2)*B1:B5)` multiplies the comparison results by the values in column B.

A scalar applies to every element. Rows and columns expand separately. A size of one expands to match the other operand. For example, `={1,2,3}+{10;20}` returns `{11,12,13;21,22,23}`. If two sizes differ and neither is one, the result uses the larger size. Positions outside the smaller operand return `#N/A`.

Each element uses the scalar rules for values and errors. An error affects its element, not the whole array. Functions that accept arrays use the results directly. For example, `=SUM(A1:A3*B1:B3)` returns one sum. A top-level array result spills into adjacent cells. A blocked spill returns `#SPILL!`. Array size and memory limits still apply.

## Operators

| Precedence, high to low | Operators | Associativity |
| --- | --- | --- |
| Range | `:`, postfix `#` (spill) | — |
| Intersection | space between two references | left |
| Union | `,` inside parentheses that are not a function call | left |
| Unary sign | unary `+`, unary `-` | right |
| Percentage | postfix `%` | left |
| Exponentiation | `^` | left |
| Multiplication | `*`, `/` | left |
| Addition | `+`, `-` | left |
| Concatenation | `&` | left |
| Comparison | `=`, `<>`, `<`, `>`, `<=`, `>=` | one comparison |

This deliberately follows Excel's spreadsheet precedence rather than programming-language
conventions: `=-2^2` is `4`, `=2^3^2` is `64`, and `=2^-2` is `0.25`. Parenthesize formulas
when portability to a non-spreadsheet evaluator matters. Percentage divides its operand by
100 and may repeat (`=50%%` is `0.005`). Concatenation formats numbers, booleans, and blanks
as spreadsheet text; arithmetic and comparison bind before `&`.

The intersection and union operators apply only to references. See
[Intersection](#intersection) and [Union](#union).

Comparisons return native booleans. For example, `=IF(A1 >= 100, A1 * 0.9, A1)`.

## Date/time semantics

Dates are numbers: whole days since the spreadsheet epoch, with a fractional day for time. Sheetwrite uses only the Excel 1900 date system on this path:

- serial `0` maps to `1899-12-31`
- `DATE(1900,1,1) = 1`
- serial `60` is retained as the compatibility-only, non-Gregorian date `1900-02-29`
- `DATE(1900,3,1) = 61`
- `DATE` treats 1900 as a leap year for this serial boundary and normalizes month/day overflow; `DATE(2024,13,1)` is 2025-01-01
- `DATEVALUE` is locale-neutral: it accepts the documented ISO `yyyy-mm-dd` form and fixed slash-delimited numeric forms; it never consults the host locale

`OFFSET`, `INDIRECT`, `RAND`, `RANDBETWEEN`, `TODAY` and `NOW` are volatile. Each edit recalculates them and their dependents, as in Excel. A transaction without source changes recalculates nothing. `TODAY` and `NOW` read the clock once per recalculation, never during paint or a dependency read, so every formula in one recalculation sees the same time. To recalculate without an edit, or to use a fixed time, the host passes one absolute instant to a barrier:

```ts prelude="core" partial="requires surrounding host state" title="Partial example"
store.recalculateVolatile(new Date("2026-07-13T18:00:00.000Z"));
```

The default uses `new Date()`. The instant is converted to a UTC serial, so a fixed `Date` produces identical results in every host timezone. The next edit reads the clock again. `TODAY` returns its whole-day component; `NOW` retains the fraction.

`RAND()` returns a number in `[0, 1)`. `RANDBETWEEN(bottom, top)` returns an integer in `[bottom, top]`. It rounds `bottom` up and `top` down; if the result is an empty interval, it returns `#NUM!`, and a non-numeric bound returns `#VALUE!`. Each engine instance seeds its own generator. The generator is not cryptographic.

Basic `TEXT` date patterns are `yyyy-mm-dd`, `yyyy/mm/dd`, `mm/dd/yyyy`, `dd/mm/yyyy`, `m/d/yyyy`, `yyyy-mm-dd hh:mm`, `yyyy-mm-dd hh:mm:ss`, `hh:mm`, and `hh:mm:ss`.

Text evaluation is host-locale neutral. Function argument separators stay commas; `VALUE` uses `.` decimal and `,` grouping, and `NUMBERVALUE(text, [decimal_separator], [group_separator])` uses those same defaults unless the separators are supplied explicitly. Case conversion uses Unicode mappings, not browser locale. `LEN`, `LEFT`, `RIGHT`, and `MID` count Unicode scalar values rather than UTF-16 code units. Generated text is capped at 16 MiB and bounded searches at 4,000,000 steps; excess work returns `#NUM!`.

## Dynamic references

`OFFSET(reference, rows, cols, [height], [width])` returns a reference shifted from the top-left cell of `reference`. Omitted dimensions inherit the original reference's height and width. For example, `=SUM(OFFSET(A1,0,1,3,1))` sums `B1:B3`; `=OFFSET(A1:A3,0,1)` spills those three cells. Offsets truncate toward zero. A result outside the Excel grid returns `#REF!`. Height and width must be positive; nonpositive dimensions, a non-reference first argument or a nonnumeric offset return `#VALUE!`.

`INDIRECT(text, [a1])` resolves reference text at calculation time. The default `a1=TRUE` accepts A1 notation, such as `=INDIRECT("B"&A1)`. With `FALSE`, it accepts R1C1 notation: `=INDIRECT("R1C2",FALSE)` reads `B1`, and `=INDIRECT("R[-1]C",FALSE)` reads the cell one row above the formula. Sheet-qualified references, defined names and table references are supported. Invalid text, missing targets and external workbook references return `#REF!`; evaluation never opens another workbook.

Both functions return references, so they can feed reference-taking functions such as `ROW`, `AREAS`, `SUM` and `FORMULATEXT`; multi-cell formula results spill. They recalculate after each edit, even when the target is chosen at runtime. Runtime dependency cycles return `#CYCLE!`. Existing range and spill limits apply, and reading beyond the loaded sheet returns `#REF!`.

Fill, copy and structural edits rewrite ordinary reference arguments to `OFFSET`. They do not rewrite text inside `INDIRECT`: `"A1"` remains `"A1"` after a row insertion.

## Cell information functions

- `FORMULATEXT(reference)` returns the formula source of the top-left cell of `reference`. It returns `#N/A` when that cell holds no formula, and `#VALUE!` when the argument is not a reference.
- `ISFORMULA(reference)` returns `TRUE` when the top-left cell of `reference` holds a formula, and `FALSE` otherwise.
- `HYPERLINK(link, [friendly_name])` returns `friendly_name`, or `link` when there is no friendly name. The grid does not open the link; use [`Grid.setHyperlink`](/docs/api/core/grid/#grid-set-hyperlink) for links that open.
- `CELL(info_type, [reference])` supports the info types `address`, `col`, `contents`, `row` and `type`. Other info types, such as `format` or `width`, return `#VALUE!`, because number formats and column widths live in the host. Without `reference`, `CELL` describes the cell of the formula, as in LibreOffice.

Cells inside a spilled range and host-linked reference cells hold no formula. A formula that reads its own cell with these functions returns `#CYCLE!`.

## Criteria semantics and shapes

Criteria strings may begin with `=`, `<>`, `<`, `<=`, `>`, or `>=`. Numeric and boolean operands are parsed before text comparison. Plain text comparisons are case-insensitive. `*` matches zero or more characters, `?` matches one character, and `~` escapes the next wildcard. Wildcards apply to equality/inequality text criteria. Criteria are parsed once per formula evaluation, not once per cell.

Shapes are exact row-by-column dimensions; equal cell counts with different dimensions do not match:

- `COUNTIF(criteria_range, criterion)` accepts one matrix and one scalar criterion.
- `COUNTIFS(criteria_range1, criterion1, …)` requires one or more range/criterion pairs. Every criteria range must have exactly the shape of the first.
- `SUMIF(criteria_range, criterion, [value_range])` and `AVERAGEIF(...)` use `criteria_range` as the value range when the third argument is omitted. When supplied, `value_range` must have exactly the same shape; Sheetwrite does not implement Excel's top-left range extension.
- `SUMIFS(value_range, criteria_range1, criterion1, …)`, `AVERAGEIFS`, `MAXIFS`, and `MINIFS` require one or more pairs after the value range. Every criteria range must exactly match the value range.

A mismatch or malformed pair list returns `#VALUE!`. Matching result-range errors propagate. Text, booleans, and blanks in a numeric result range are ignored. A criteria sum with no numeric matches is `0`; an average is `#DIV/0!`; `MAXIFS`/`MINIFS` return `0`.

## SUMPRODUCT and SUBTOTAL

`SUMPRODUCT(array1, [array2, …])` requires at least one argument. Every argument must have the same exact row-by-column shape; a scalar is a 1×1 shape, and a dimensional mismatch returns `#VALUE!`. It multiplies corresponding cells and sums the products. Text, booleans, and blanks reached through ranges contribute zero; directly supplied numeric text and booleans use ordinary scalar numeric coercion. Errors propagate, and a non-finite product or total returns `#NUM!`.

`SUBTOTAL(function_number, reference1, [reference2, …])` accepts codes `1`–`11`: `AVERAGE`, `COUNT`, `COUNTA`, `MAX`, `MIN`, `PRODUCT`, `STDEV.S`, `STDEV.P`, `SUM`, `VAR.S`, and `VAR.P`. It accepts up to 253 reference arguments and uses the corresponding aggregate's range coercion/error rules. Codes `101`–`111` are deliberately unsupported and return `#VALUE!` pending hidden-row provenance in formula range values. Nested-subtotal and filtered/hidden-row exclusion must not be inferred.

## Financial functions

`PV`, `FV`, `PMT`, `NPV`, `IRR`, `RATE`, `IPMT`, and `PPMT` use binary64 arithmetic, fixed defaults from the generated signatures, and explicit domain errors. `NPV` discounts its first cash flow at period 1 and uses compensated summation. Range cash flows ignore text and blanks; errors propagate.

`IRR` requires at least one positive and one negative cash flow. `IRR` and `RATE` use the caller's guess (default `0.1`), 14 deterministic bracket steps, at most 100 deterministic solve steps, fixed absolute/relative tolerances of `1e-12`, and a finite transformed search domain. Invalid domains or failure to converge return `#NUM!`; no random seed, host locale, wall clock, or platform-specific iteration budget is used.

## Lookup semantics

- `INDEX(range, row, [column], [area_num])` uses 1-based indices and returns one scalar. Zero/negative indices return `#VALUE!`; array-return row/column projections are not implemented. `area_num` selects an area of a union, such as `=INDEX((A1:B2,D1:E2),1,1,2)`; an `area_num` after the last area returns `#REF!`.
- `MATCH(key, range, 0)` is exact. Match type `1` returns the largest value less than or equal to the key from ascending data. `-1` returns the smallest value greater than or equal to the key from descending data. Invalid ordering returns `#N/A` rather than a plausible wrong row.
- `VLOOKUP`/`HLOOKUP` use exact matching when the final argument is false. The omitted/true mode uses correctly ordered approximate data and returns the largest value less than or equal to the key.
- `XLOOKUP` supports exact, next-smaller (`-1`), next-larger (`1`), and wildcard (`2`) match modes; forward/reverse and ordered binary-search modes are accepted. `if_not_found` is optional. If it is omitted—including via an interior empty argument—the result is `#N/A`.

Lookup errors in the scanned range propagate. Approximate modes validate ordering and do not silently return a result from unsorted input.

## Dynamic arrays and spills

`FILTER`, `SORT`, `UNIQUE`, `TRANSPOSE`, `SEQUENCE`, `TAKE`, `DROP`, `CHOOSECOLS`, and `CHOOSEROWS` return rectangular values. A direct range formula such as `=A1:B4` also spills:

- `FILTER(array, include, [if_empty])` accepts a one-column include range matching the array's rows or a one-row include range matching its columns. Shape mismatches are `#VALUE!`. No selected values returns `if_empty`, or `#CALC!` when omitted.
- `SORT(array, [sort_index], [sort_order], [by_col])` defaults to the first column, ascending. `sort_index` selects the row/column key; `sort_order` is `1` or `-1`; `by_col=TRUE` sorts columns instead of rows. For several keys, use `SORTBY` in the full engine.
- `UNIQUE(array, [by_col], [exactly_once])` preserves first-seen order. `by_col=TRUE` compares columns; `exactly_once=TRUE` keeps only items occurring once. An empty result is `#CALC!`.
- `TRANSPOSE(array)` swaps rows and columns.
- `SEQUENCE(rows, [columns], [start], [step])` requires positive integer dimensions and defaults to one column, start `1`, step `1`; values fill row-major.
- `TAKE`/`DROP(array, rows, [columns])` use positive counts from the start and negative counts from the end. A zero or empty result is `#CALC!`; counts beyond an axis clamp to that axis.
- `CHOOSECOLS`/`CHOOSEROWS(array, index1, …)` use 1-based positive indices and end-relative negative indices. Repeated indices repeat output axes; zero/out-of-range indices return `#VALUE!`.

Errors inside a returned array stay at their corresponding spill children; a mixed result such
as `{1;#N/A;2}` does not collapse to an anchor-only error.

The formula cell is the **anchor** and owns the complete runtime rectangle. Spill children
have no formula source or persisted document identity. `store.getSpillAnchor(address)` returns
the anchor for either the anchor or a child, and returns `null` for an ordinary cell.

Spills publish atomically. Any nonempty destination, another spill, merge, validation or
protected range, unloaded paged cell, or sheet boundary makes the anchor `#SPILL!`; no partial
children remain. Styles, conditional formatting, and hidden rows/columns do not obstruct.
Editing a projected child through canonical core mutations is rejected. Edit or clear the
anchor instead. Structural and metadata changes invalidate ownership and recompute it.

Snapshots and XLSX export serialize only the anchor formula. Children recompute after
hydration. Internal rich copy preserves the anchor formula while treating children as
derived blanks on paste; external TSV receives the displayed spill values. History snapshots
likewise restore the anchor and recompute children, so undo never persists stale projections.
Unsupported OOXML array/data-table formula records remain inert source text with an explicit
warning rather than being silently treated as Sheetwrite spills.

Each array dimension is capped at Excel's row/column limits, one spill is capped at 1,000,000
cells and 64 MiB of bounded value/intermediate storage, and one dynamic recompute pass is
capped at 2,000,000 cell operations. Materialized spill ownership across the complete store is
also capped at 1,000,000 cells and 64 MiB, including per-child error metadata. Installation
checks that cumulative budget atomically; clearing, shrinking, or removing a spill releases its
ownership. Oversized work returns stable `#NUM!` without partial children, while unstable or
colliding shapes return an explicit error rather than truncating.

The admission check happens before materialization when the shape is statically knowable and is repeated before spill ownership is installed. It accounts source/result copies and per-item auxiliary storage; a shape that could exceed a ceiling is rejected rather than optimistically allocated. A recompute either atomically replaces the complete previous spill or leaves no projected children.

## Unsupported categories

Formula evaluation performs no network request and runs no custom JavaScript. `RANDARRAY`, network functions, external/live-data providers, arbitrary external workbook references, and cube/OLAP functions are unsupported. Examples include `WEBSERVICE`, `GOOGLEFINANCE`, `IMPORT*`, `RTD`, and `CUBEVALUE`. Database functions such as `DSUM` and `LAMBDA` helpers such as `MAP` are in the full engine only.

Unsupported names evaluate to `#NAME?` while preserving source for snapshots and interchange. There is no compatibility shim or side-effecting fallback. The generated [unsupported-category ledger](/docs/reference/formula-functions/#unsupported-categories) is derived from the versioned inventory.

## Performance evidence

The [engine guide](/docs/guides/performance-resources/#choose-a-formula-engine) shows function coverage, download size, and analysis workloads. Shared functions use the same implementation in both builds. Small timing differences do not show that one package is faster. Follow the [performance evidence guide](/docs/guides/performance-resources/) to capture and check measurements; resource ceilings are not benchmark results.

## Point mode and reference rewriting

While editing a formula, clicking a cell inserts its A1 reference and dragging inserts a range. Relative references shift during fill; `$`-absolute axes remain fixed. Structural row/column edits rewrite direct and named references while preserving stable sheet identity.

The same `$`-aware utility is public:

```ts prelude="core" partial="requires surrounding host state" title="Partial example"
import { shiftA1Refs } from "@sheetwrite/core";

shiftA1Refs("A1 + $B$1", 0, 1); // "B1 + $B$1"
```

A1 address helpers are exported as `cellA1`, `colToA1`, `labelToCol`, and `rangeA1`.
