---
title: Authoring and references
description: Store formula sources, use references and local names, and handle scalar values and errors.
---

```ts prelude="core" partial="requires an initialized grid with the inputs shown below" title="Add a range"
grid.store.applyTransaction({
  patches: [
    { op: "set", addr: { sheet: "sheet1", row: 0, col: 1 },
      value: { kind: "formula", src: "=SUM(A1:A3)" } },
  ],
});
```

<div class="sw-grid-result" data-caption="Result: inputs in A1:A3, sum in B1">

| 2 | **12** |
| --- | --- |
| 4 | |
| 6 | |

</div>

[Try it live — formula showcase](/showcases/formulas/). Edit a formula to try this example.

<details>
<summary>Full setup</summary>

```ts compile title="Add a range in a grid"
import { createGrid, initSheetwrite } from "@sheetwrite/core";
import "@sheetwrite/core/styles.css";

const host = document.querySelector<HTMLElement>("#grid");
if (host === null) throw new Error("Missing #grid host");
host.style.height = "320px";

await initSheetwrite();
const grid = createGrid(host, {
  workbook: {
    activeSheet: "sheet1",
    sheets: [{
      id: "sheet1", name: "Sheet1", rowCount: 3,
      columns: [
        { key: "a", header: "A", type: "number", width: 120 },
        { key: "result", header: "Result", type: "number", width: 120 },
      ],
    }],
  },
  data: { rowCount: 3, columns: { a: [2, 4, 6], result: [null, null, null] } },
});

grid.store.applyTransaction({
  patches: [
    { op: "set", addr: { sheet: "sheet1", row: 0, col: 1 },
      value: { kind: "formula", src: "=SUM(A1:A3)" } },
  ],
});
```

</details>

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
| `#CYCLE!` | Direct or transitive formula/reference cycle, unless [iterative calculation](/docs/features/formulas/iterative-calculation/) is on. |
| `#LOADING!` | A formula depends on datasource cells that have not loaded yet. |

Errors are values for display and dependency propagation, not `NaN` or blank rendering. `IFERROR` can replace them. Unsupported or malformed source remains stored even when the result is an error.

Coercion follows these documented rules:

- Arithmetic converts numeric text and booleans (`TRUE = 1`, `FALSE = 0`); nonnumeric text returns `#VALUE!`.
- Direct scalar boolean/text arguments may be coerced by numeric functions. Text/booleans reached through a range are ignored by numeric aggregates, matching common spreadsheet behavior.
- Empty scalar arithmetic behaves as zero. Empty range cells are skipped.
- Comparisons are case-insensitive for text and use spreadsheet type ordering.
- A number that becomes text, as in `=(0.1+0.2)&""`, keeps 15 significant digits, as in Excel: the result is `0.3`. Exponents from -9 to 14 give plain digits, and other numbers use scientific notation, such as `1E+15`.
- `AND`, `OR`, `NOT`, and `IF` accept booleans, numbers, and the text `TRUE`/`FALSE`.

## LET bindings

`LET(name1, value1, [name2, value2, …], calculation)` supports lexical, case-insensitive local names. A name starts with an ASCII letter or `_`; subsequent characters may also contain ASCII digits or `.`. Inner `LET` bindings shadow outer bindings, and each value expression can see only earlier bindings.

Bindings are lazy. Only names reachable from `calculation` are expanded and evaluated, so an unused cell read, error, or `NOW()` does not become a dependency, error, or volatile marker. A used binding preserves ordinary formula dependency, spill, copy/fill, and structural-reference behavior. `LET(x,1/0,7)` therefore returns `7`, while `LET(x,A1,x+1)` tracks `A1`.

One `LET` admits at most 126 bindings. Expansion admits at most 16,384 AST nodes across reachable bindings. Invalid name/arity/binding structure returns `#VALUE!`; expansion beyond the node ceiling returns `#NUM!`. In the full engine, a `LET` value can be a `LAMBDA`; see [Full formula engine](/docs/features/formulas/analysis-formulas/#full-formula-engine).

## References, ranges, and named ranges

A1 cells (`A1`, `$B12`, `AA$3`), rectangular ranges (`A1:B3`), whole columns and rows (`A:C`, `$2:$5`), and cross-sheet references (`Sales!E2`, `'Sales 2026'!E2:E10`, `Sales!E:E`) are supported. A reference must be inside column `XFD` and row 1048576; a token past them, such as `XYZ1`, is a name. A whole column or row reads only the cells that the sheet has, and a row or column edit keeps it whole. Numbers can have an exponent, such as `1E3` or `1.5E-3`. Absolute markers affect fill/structural rewriting; they do not change evaluation.

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

## Date/time semantics

Dates are numbers: whole days since the spreadsheet epoch, with a fractional day for time. Sheetwrite uses only the Excel 1900 date system on this path:

- serial `0` maps to `1899-12-31`
- `DATE(1900,1,1) = 1`
- serial `60` is retained as the compatibility-only, non-Gregorian date `1900-02-29`
- `DATE(1900,3,1) = 61`
- `DATE` treats 1900 as a leap year for this serial boundary and normalizes month/day overflow; `DATE(2024,13,1)` is 2025-01-01
- `DATEVALUE` is locale-neutral: it accepts the documented ISO `yyyy-mm-dd` form and fixed slash-delimited numeric forms; it never consults the host locale

Basic `TEXT` date patterns are `yyyy-mm-dd`, `yyyy/mm/dd`, `mm/dd/yyyy`, `dd/mm/yyyy`, `m/d/yyyy`, `yyyy-mm-dd hh:mm`, `yyyy-mm-dd hh:mm:ss`, `hh:mm`, and `hh:mm:ss`.

Text evaluation is host-locale neutral. Function argument separators stay commas; `VALUE` uses `.` decimal and `,` grouping, and `NUMBERVALUE(text, [decimal_separator], [group_separator])` uses those same defaults unless the separators are supplied explicitly. Case conversion uses Unicode mappings, not browser locale. `LEN`, `LEFT`, `RIGHT`, and `MID` count Unicode scalar values rather than UTF-16 code units. Generated text is capped at 16 MiB and bounded searches at 4,000,000 steps; excess work returns `#NUM!`.

## Cell information functions

- `FORMULATEXT(reference)` returns the formula source of the top-left cell of `reference`. It returns `#N/A` when that cell holds no formula, and `#VALUE!` when the argument is not a reference.
- `ISFORMULA(reference)` returns `TRUE` when the top-left cell of `reference` holds a formula, and `FALSE` otherwise.
- `HYPERLINK(link, [friendly_name])` returns `friendly_name`, or `link` when there is no friendly name. The grid does not open the link; use [`Grid.setHyperlink`](/docs/api/core/grid/#grid-set-hyperlink) for links that open.
- `CELL(info_type, [reference])` supports the info types `address`, `col`, `contents`, `row` and `type`. Other info types, such as `format` or `width`, return `#VALUE!`, because number formats and column widths live in the host. Without `reference`, `CELL` describes the cell of the formula, as in LibreOffice.

Cells inside a spilled range and host-linked reference cells hold no formula. A formula that reads its own cell with these functions returns `#CYCLE!`.

## Unsupported categories

Formula evaluation performs no network request and runs no custom JavaScript. `RANDARRAY`, network functions, external/live-data providers, arbitrary external workbook references, and cube/OLAP functions are unsupported. Examples include `WEBSERVICE`, `GOOGLEFINANCE`, `IMPORT*`, `RTD`, and `CUBEVALUE`. Database functions such as `DSUM` and `LAMBDA` helpers such as `MAP` are in the full engine only.

Unsupported names evaluate to `#NAME?` while preserving source for snapshots and interchange. There is no compatibility shim or side-effecting fallback. The generated [unsupported-category ledger](/docs/reference/formula-functions/#unsupported-categories) is derived from the versioned inventory.

## Performance evidence

The [engine guide](/docs/performance/formula-engine/#choose-a-formula-engine) shows function coverage, download size, and analysis workloads. Shared functions use the same implementation in both builds. Small timing differences do not show that one package is faster. Follow the [performance evidence guide](/docs/performance/) to capture and check measurements; resource ceilings are not benchmark results.

## Point mode and reference rewriting

While editing a formula, clicking a cell inserts its A1 reference and dragging inserts a range. Relative references shift during fill; `$`-absolute axes remain fixed. Structural row/column edits rewrite direct and named references while preserving stable sheet identity.

The same `$`-aware utility is public:

```ts prelude="core" partial="requires surrounding host state" title="Partial example"
import { shiftA1Refs } from "@sheetwrite/core";

shiftA1Refs("A1 + $B$1", 0, 1); // "B1 + $B$1"
```

A1 address helpers are exported as `cellA1`, `colToA1`, `labelToCol`, and `rangeA1`.

