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

```ts compile runnable title="Column and cell number formats"
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

A number with no format, `General` or the Text format `@` shows as Excel's General format shows it: no thousands separators, up to 11 characters (the minus sign not counted), and scientific notation when its whole part does not fit or it is below 0.0001. So `2026` shows as `2026`, `0.0001234` as `0.0001234` and `123456789012` as `1.23457E+11`. In a narrow cell the number takes fewer decimals, then scientific notation, before it shows `####`.

XLSX import keeps each cell's own format, so a column that mixes formats round-trips cell by cell. XLSX export writes a `text` column in the Text format `@`, and import reads a column in `@` as `text`, so typed numbers there stay text after a round trip.

### What typing stores

A column's `type` decides how a typed entry is read. The columns Sheetwrite makes itself are `general`: new sheets from +, Insert and Shift+F11, `addSheet` without `columns`, the empty columns right of a sheet's own, and XLSX imports without one number format per column. A `general` column reads an entry as Excel's General format does, and gives an unformatted cell the format that shows it as typed:

| You type | The cell holds | Format |
| --- | --- | --- |
| `42`, `007`, `-3.5`, `(42)` | 42, 7, -3.5, -42 | none |
| `1,234.5` | 1234.5 | `#,##0.00` |
| `15%` | 0.15 | `0%` |
| `$1,234.50` | 1234.5 | `$#,##0.00` |
| `1e5` | 100000 | `0.00E+00` |
| `1 1/2` | 1.5 | `# ?/?` |
| `1/15/2026`, `2026-01-15` | the date serial 46037 | `m/d/yyyy` |
| `15-Jan-2026`, `Jan 15, 2026` | 46037 | `d-mmm-yy` |
| `Jan-26`, `1/26` | 26 January of this year | `d-mmm` |
| `Feb-30`, `1/99` | 1 February 1930, 1 January 1999 | `mmm-yy` |
| `9:30`, `9:30 PM` | 0.3958…, 0.8958… | `h:mm`, `h:mm AM/PM` |
| `25:00`, `36:15:30` | 1.0416…, 1.5107… days | `[h]:mm:ss` |
| `'007` | the text `007` | none |

The grouping and decimal separators follow the column's `numberLocale`, so `1.234,5` is 1234.5 in `de-DE`. A date in numbers reads in the order of that locale's short date: `15.01.2026` is 15 January in `de-DE`, and `1/15/2026` is 15 January in `en-US`. The cell gets that short date with a four-digit year, such as `dd.mm.yyyy` or `m/d/yyyy`. A month with one number is a day of this year when that day exists, else the first day of the month in that year, as in Excel. A cell that already has a number format keeps it.

Imported and pasted-in cells keep their stored type. Text pasted from another application is read as typed. Cells that Excel's copy marks as text (its Text format) paste as text, as in Excel. A `text` column keeps what is typed as text. A `number`, `currency` or `date` column reads numbers and its own kind. The Text format `@` keeps any entry as text.

The grid actions `setNumberFormat(code: string | null)` and `stepDecimals(direction: 1 | -1)` change the format of the selection. `setNumberFormat(null)` returns the cells to the column's format. `stepDecimals` shows one more (`1`) or one fewer (`-1`) decimal place than the focus cell does.

### Keys and the Format Cells dialog

As in Excel ([Keyboard shortcuts in Excel](https://support.microsoft.com/en-us/office/keyboard-shortcuts-in-excel-1798d9d5-842a-42b8-9c99-9b7213f0040f)), Ctrl/Cmd + Shift with the keys `~ ! @ # $ % ^` applies a format to the selection:

| Key | Format | Code |
| --- | --- | --- |
| Ctrl/Cmd + Shift + ~ | General | `General` |
| Ctrl/Cmd + Shift + ! | Number, two decimals and a thousands separator | `#,##0.00` |
| Ctrl/Cmd + Shift + @ | Time with hours, minutes and AM or PM | `h:mm AM/PM` |
| Ctrl/Cmd + Shift + # | Date with day, month and year | `d-mmm-yy` |
| Ctrl/Cmd + Shift + $ | Currency, two decimals, negatives in parentheses | `$#,##0.00_);($#,##0.00)` |
| Ctrl/Cmd + Shift + % | Percentage, no decimals | `0%` |
| Ctrl/Cmd + Shift + ^ | Scientific, two decimals | `0.00E+00` |

The ribbon's Number Format box then names the format as Excel does: a preset's name such as Short Date, or else the Format Cells category that makes the code, so the keys above show General, Number, Time, Date, Currency, Percentage and Scientific. Only a code no category makes shows Custom.

Ctrl/Cmd + 1, the context menu's Format cells… or `grid.actions.formatCells()` opens the **Format Cells** dialog over the selection. It shows the active cell's format on five tabs:

- **Number**: General, Number (decimal places, 1000 separator, negative numbers), Currency (decimal places, negative numbers), Accounting, Date and Time (a list of types), Percentage, Fraction (up to one, two or three digits, or as halves, quarters, eighths, sixteenths, tenths or hundredths), Scientific (decimal places), Text and Custom (any format code), with a sample of the active cell's value.
- **Alignment**: horizontal and vertical alignment, and wrap text.
- **Font**: font, size, bold, italic, underline, strikethrough and color.
- **Border**: None, Outline, All borders, Thick outline, Top, Bottom, Left or Right.
- **Fill**: no fill or a color.

OK applies only what you changed, to every selected cell, as one undoable step; the cells keep their other formatting. Cancel and Escape change nothing. Arrow keys move between the tabs, Tab moves into the shown tab, and Enter chooses OK. The dialog is in its own chunk, loaded on first use; keys pressed meanwhile reach it.

While the dialog is open, the selected cells show the format it would apply, as you change each setting: negative numbers, zeros, `####` in a narrow column and borders show on the whole selection, not only on the dialog's one sample. The preview changes only what the grid draws: nothing reaches the document, the undo history or collaborators before OK, and Cancel or Escape puts the cells back as they were.

From code, `grid.actions.formatCells({ style, border })` applies a format to the selection without the dialog, as OK does: `style` merges into each cell's style and `border` is a border preset such as `"all"` or `"outside"`, as one undoable step that is in place when the call returns.

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
| `# ?/?` | `5.25` → <sw-format value="5.25" code="# ?/?" locale="en-US"></sw-format> |
| `# ??/100` | `5.3` → <sw-format value="5.3" code="# ??/100" locale="en-US"></sw-format> |
| `@` | `1234.5` → <sw-format value="1234.5" code="@" locale="en-US"></sw-format> (shown as General) |
| `yyyy-mm-dd` | serial `45351` → <sw-format value="45351" code="yyyy-mm-dd" locale="en-US"></sw-format> |
| `mmm d, yyyy h:mm:ss AM/PM` | UTC serial `45477.62924768519` (2024-07-04 15:06:07 UTC) → <sw-format value="45477.62924768519" code="mmm d, yyyy h:mm:ss AM/PM" locale="en-US"></sw-format> |
| `0.00;[Red](0.00);"none";"value: "@` | Positive `2.5` → <sw-format value="2.5" code="0.00;&#91;Red&#93;(0.00);&quot;none&quot;;&quot;value: &quot;@" locale="en-US"></sw-format>; negative `-2.5` → <sw-format value="-2.5" code="0.00;&#91;Red&#93;(0.00);&quot;none&quot;;&quot;value: &quot;@" locale="en-US"></sw-format>; zero `0` → <sw-format value="0" code="0.00;&#91;Red&#93;(0.00);&quot;none&quot;;&quot;value: &quot;@" locale="en-US"></sw-format>; text `"draft"` → <sw-format value="draft" code="0.00;&#91;Red&#93;(0.00);&quot;none&quot;;&quot;value: &quot;@" locale="en-US"></sw-format> |

### Numeric codes

Numeric formats support fixed decimals, optional grouping, percent scaling, scientific exponents with an explicit width, quoted and escaped literals, and currency prefixes and suffixes.

Up to four semicolon sections select the positive, negative, zero and text output. A section's color paints the number in that color, as in Excel, and it takes priority over the cell's font color: one of the eight names `[Black]`, `[Blue]`, `[Cyan]`, `[Green]`, `[Magenta]`, `[Red]`, `[White]` and `[Yellow]`, or `[Color1]` to `[Color56]` from Excel's default palette. So `#,##0;[Red]-#,##0` shows -1200 as a red `-1,200`.

A condition in brackets chooses a section instead of the sign: `[Red][<=100]0;[Blue][>100]0` shows 50 in red and 150 in blue. A number goes to the first section whose condition it meets. When the first two sections both have conditions, the third section takes the other numbers. When only the first section has one, the second section takes the other numbers. A section that only negative numbers meet, such as `[<0]`, shows the number without its minus sign, as the negative section does.

### Fractions and Text

A fraction code such as `# ?/?`, `# ??/??` or `# ???/???` shows the closest fraction whose denominator has at most that many digits; a fixed denominator such as `# ?/4`, `# ??/16` or `# ??/100` rounds to that many parts and is not reduced. The `#` part is the whole number; without it the fraction is improper (`?/?` shows `1.25` as `5/4`). The numerator is right-aligned and the denominator left-aligned in their `?` places, and a fraction that rounds to zero leaves spaces, so a column of fractions lines up. `TEXT()` in formulas follows the same rules.

The Text format `@` shows a number as General would. What you type into a cell formatted as Text stays text exactly as typed, as in Excel: `0123` keeps its zero, and `=A1` is not a formula.

### Date and time codes

Date and time formats support numeric and named month and day fields, 12-hour and 24-hour time, minutes, seconds, and AM/PM. Neighboring time tokens decide whether `m` means month or minute. Elapsed time in brackets counts past one day or one hour, as in Excel: `[h]:mm:ss` shows 1.5 days as `36:00:00`, `[mm]:ss` shows 1.5 hours as `90:00`, and `[ss]` shows 1.5 minutes as `90`.

UTC fields make date rendering the same in every host timezone. Locale-specific separators come from `numberLocale`, not from the browser's locale.

## Edge cases and limits

- Fractional seconds, such as `ss.00`, are not supported.
- A color in the text section, such as `[Red]@`, does not color text.
- Formula errors are explicit values such as `#DIV/0!` and `#CYCLE!`. They are not non-finite numbers that the formatter hides. See [Formulas](/docs/features/formulas/authoring-and-references/#scalars-coercion-and-errors).
- Native boolean values use the normal cell style model and render as uppercase `TRUE` or `FALSE`. They are centered unless `CellStyle.align` overrides it.

## See also

- [Styles and themes](/docs/features/formatting/styles/#cellstyle)
- [Fonts and alignment](/docs/features/formatting/fonts-and-alignment/)
- [Conditional formats](/docs/features/formatting/conditional-formats/)
- [`formatNumber`](/docs/api/core/format-number/) API reference.
- [Live formatting showcase](/showcases/formatting/) — try the number-format controls; column G shows seven mixed formats.
