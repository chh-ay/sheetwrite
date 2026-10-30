---
title: Number formats
description: Show numbers and dates with Excel-style format codes and an explicit locale.
---

A column or a cell can carry an Excel-style `numberFormat` code, and a column can carry a BCP 47 `numberLocale`, so numbers and dates paint the same way on every host.

```ts prelude="core" partial="column definitions and an initialized grid" title="Column defaults and a cell override"
import type { Workbook } from "@sheetwrite/core";

const columns: Workbook["sheets"][number]["columns"] = [
  { key: "amount", header: "Amount", width: 140, type: "number", numberFormat: "#,##0.00", numberLocale: "de-DE" },
  { key: "day", header: "Day", width: 120, type: "date", numberFormat: "yyyy-mm-dd" },
  { key: "share", header: "Share", width: 100, type: "number" },
];
grid.styleRange(
  { sheet: "sheet1", start: { row: 0, col: 2 }, end: { row: 1, col: 2 } },
  { numberFormat: "0.0%" },
);
```

<div class="sw-grid-result" data-caption="Result: amount, date and share in A1:C2">

| <sw-format value="1234.5" code="#,##0.00" locale="de-DE"></sw-format> | <sw-format value="45351" code="yyyy-mm-dd" locale="en-US"></sw-format> | <sw-format value="0.125" code="0.0%" locale="en-US"></sw-format> |
| --- | --- | --- |
| <sw-format value="99" code="#,##0.00" locale="de-DE"></sw-format> | <sw-format value="45352" code="yyyy-mm-dd" locale="en-US"></sw-format> | <sw-format value="0.5" code="0.0%" locale="en-US"></sw-format> |

</div>

The inputs are amounts `1234.5` and `99`, UTC date serials `45351` and `45352`, and shares `0.125` and `0.5`. `formatNumber` returns the same text the grid paints.

<details>
<summary>Full setup</summary>

```ts compile title="Column and cell number formats"
import {
  createGrid,
  formatNumber,
  initSheetwrite,
  type ColumnarData,
  type Workbook,
} from "@sheetwrite/core";
import "@sheetwrite/core/styles.css";

const host = document.querySelector<HTMLElement>("#grid");
if (host === null) throw new Error("Missing #grid host");
host.style.height = "320px";

const workbook: Workbook = {
  activeSheet: "sheet1",
  sheets: [
    {
      id: "sheet1",
      name: "Sheet1",
      rowCount: 2,
      columns: [
        {
          key: "amount",
          header: "Amount",
          width: 140,
          type: "number",
          numberFormat: "#,##0.00",
          numberLocale: "de-DE",
        },
        { key: "day", header: "Day", width: 120, type: "date", numberFormat: "yyyy-mm-dd" },
        { key: "share", header: "Share", width: 100, type: "number" },
      ],
    },
  ],
};
const data: ColumnarData = {
  rowCount: 2,
  columns: {
    amount: new Float64Array([1234.5, 99]),
    day: new Float64Array([45351, 45352]),
    share: new Float64Array([0.125, 0.5]),
  },
};

await initSheetwrite();
const grid = createGrid(host, { workbook, data });

// A cell style overrides the column format.
grid.styleRange(
  { sheet: "sheet1", start: { row: 0, col: 2 }, end: { row: 1, col: 2 } },
  { numberFormat: "0.0%" },
);

console.log(formatNumber(1234.5, "#,##0.00", "de-DE")); // "1.234,50"
console.log(formatNumber(45351, "yyyy-mm-dd")); // "2024-02-29"
console.log(formatNumber(0.125, "0.0%")); // "12.5%"
```

</details>

## Column and cell formats

| Place | Field | Effect |
| --- | --- | --- |
| `Column` | `numberFormat` | Format code for every cell of a numeric or date column. |
| `Column` | `numberLocale` | BCP 47 locale for separators, for example `"de-DE"`. |
| `CellStyle` | `numberFormat` | Format code for one cell. It overrides the column's format. |

The canvas renderer, auto-fit measurement and the exported formatter use the same UTC serial value and the same locale.

A cell style overrides the column format. To set a format on a range, use `styleRange`:

```ts prelude="core" partial="requires an initialized grid" title="Percent for one range"
grid.styleRange(
  { sheet: "sheet1", start: { row: 0, col: 2 }, end: { row: 9, col: 2 } },
  { numberFormat: "0.0%" },
);
```

The code `General` takes a cell out of its column's format.

XLSX import keeps each cell's own format, so a column that mixes formats round-trips cell by cell.

The grid actions `setNumberFormat(code: string | null)` and `stepDecimals(direction: 1 | -1)` change the format of the selection. `setNumberFormat(null)` returns the cells to the column's format. `stepDecimals` shows one more (`1`) or one fewer (`-1`) decimal place than the focus cell does.

## Format codes

`formatNumber(value, code?, locale?)` is exported from `@sheetwrite/core`. It is a cached renderer for the supported Excel-style families:

These examples use `"en-US"`, the formatter's default locale. Set `numberLocale` on a column or pass a locale as the third argument to change separators.

| Code | Example output |
| --- | --- |
| _(none)_ or `General` | `1234.5` → <sw-format value="1234.5" code="General" locale="en-US"></sw-format> (locale default) |
| `0` | `1234.5` → <sw-format value="1234.5" code="0" locale="en-US"></sw-format> |
| `0.00` | `1234.5` → <sw-format value="1234.5" code="0.00" locale="en-US"></sw-format> |
| `#,##0.00` | `1234.5` → <sw-format value="1234.5" code="#,##0.00" locale="en-US"></sw-format> |
| `0%` | `0.5` → <sw-format value="0.5" code="0%" locale="en-US"></sw-format> |
| `$#,##0.00` | `1234.5` → <sw-format value="1234.5" code="$#,##0.00" locale="en-US"></sw-format> |
| `0.00E+00` | `12345` → <sw-format value="12345" code="0.00E+00" locale="en-US"></sw-format> |
| `yyyy-mm-dd` | serial `45351` → <sw-format value="45351" code="yyyy-mm-dd" locale="en-US"></sw-format> |
| `mmm d, yyyy h:mm:ss AM/PM` | UTC serial `45477.62924768519` (2024-07-04 15:06:07 UTC) → <sw-format value="45477.62924768519" code="mmm d, yyyy h:mm:ss AM/PM" locale="en-US"></sw-format> |
| `0.00;[Red](0.00);"none";"value: "@` | Positive `2.5` → <sw-format value="2.5" code="0.00;&#91;Red&#93;(0.00);&quot;none&quot;;&quot;value: &quot;@" locale="en-US"></sw-format>; negative `-2.5` → <sw-format value="-2.5" code="0.00;&#91;Red&#93;(0.00);&quot;none&quot;;&quot;value: &quot;@" locale="en-US"></sw-format>; zero `0` → <sw-format value="0" code="0.00;&#91;Red&#93;(0.00);&quot;none&quot;;&quot;value: &quot;@" locale="en-US"></sw-format>; text `"draft"` → <sw-format value="draft" code="0.00;&#91;Red&#93;(0.00);&quot;none&quot;;&quot;value: &quot;@" locale="en-US"></sw-format> |

### Numeric codes

Numeric formats support fixed decimals, optional grouping, percent scaling, scientific exponents with an explicit width, quoted and escaped literals, and currency prefixes and suffixes.

Up to four semicolon sections select the positive, negative, zero and text output. Sheetwrite accepts color directives such as `[Red]` as formatting metadata, but they do not change the canvas text color.

### Date and time codes

Date and time formats support numeric and named month and day fields, 12-hour and 24-hour time, minutes, seconds, and AM/PM. Neighboring time tokens decide whether `m` means month or minute.

UTC fields make date rendering the same in every host timezone. Locale-specific separators come from `numberLocale`, not from the browser's locale.

## Edge cases and limits

- Fractions, elapsed-time bracket tokens and fractional seconds are not supported.
- Formula errors are explicit values such as `#DIV/0!` and `#CYCLE!`. They are not non-finite numbers that the formatter hides. See [Formulas](/docs/features/formulas/authoring-and-references/#scalars-coercion-and-errors).
- Native boolean values use the normal cell style model and render as uppercase `TRUE` or `FALSE`. They are centered unless `CellStyle.align` overrides it.

## See also

- [Styles and themes](/docs/features/formatting/styles/#cellstyle)
- [Fonts and alignment](/docs/features/formatting/fonts-and-alignment/)
- [Conditional formats](/docs/features/formatting/conditional-formats/)
- [`formatNumber`](/docs/api/core/format-number/) API reference.
- [Live formatting showcase](/showcases/formatting/) — try the number-format controls; column G shows seven mixed formats.
