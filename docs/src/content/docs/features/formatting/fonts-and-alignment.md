---
title: Fonts and alignment
description: Set the font family, size, emphasis, horizontal and vertical alignment, and text wrap of cells.
---

`CellStyle` sets a cell's font, its alignment, and its text wrap, and the `grid.actions` commands apply the same fields to the selection.

```ts prelude="core" partial="requires the initialized grid and sales data from Full setup" title="Fonts, alignment and wrap"
grid.styleRange(
  { sheet: "sheet1", start: { row: 0, col: 0 }, end: { row: 0, col: 0 } },
  { fontFamily: "Georgia", fontSize: 16, bold: true, wrap: true, verticalAlign: "top" },
);
grid.setSelection({
  kind: "range",
  range: { sheet: "sheet1", start: { row: 1, col: 0 }, end: { row: 3, col: 1 } },
});
grid.actions.setFontFamily("Calibri");
grid.actions.stepFontSize(1);
grid.actions.setVerticalAlign("bottom");
```

<div class="sw-grid-result" data-caption="Result: A1 is bold, 16 px Georgia, wrapped and top-aligned. A2:B4 use Calibri at 11 pt and align to the bottom. Fonts fall back to the theme font when unavailable.">

| <strong>Quarterly sales for the north and east regions</strong> | 0 |
| --- | ---: |
| North | 120 |
| East | 95 |
| West | 80 |

</div>

<details>
<summary>Full setup</summary>

```ts compile title="Fonts, alignment and wrap"
import { createGrid, initSheetwrite, type ColumnarData, type Workbook } from "@sheetwrite/core";
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
      rowCount: 4,
      columns: [
        { key: "region", header: "Region", width: 180, type: "text" },
        { key: "sales", header: "Sales", width: 100, type: "number" },
      ],
    },
  ],
};
const data: ColumnarData = {
  rowCount: 4,
  columns: {
    region: ["Quarterly sales for the north and east regions", "North", "East", "West"],
    sales: new Float64Array([0, 120, 95, 80]),
  },
};

await initSheetwrite();
const grid = createGrid(host, { workbook, data });

// Style one range directly.
grid.styleRange(
  { sheet: "sheet1", start: { row: 0, col: 0 }, end: { row: 0, col: 0 } },
  { fontFamily: "Georgia", fontSize: 16, bold: true, wrap: true, verticalAlign: "top" },
);

// Or select cells and run the same commands as the toolbar and ribbon.
grid.setSelection({
  kind: "range",
  range: { sheet: "sheet1", start: { row: 1, col: 0 }, end: { row: 3, col: 1 } },
});
grid.actions.setFontFamily("Calibri");
grid.actions.stepFontSize(1);
grid.actions.setVerticalAlign("bottom");

console.log(grid.store.getCell({ sheet: "sheet1", row: 1, col: 0 }).style.fontSize);
// 14.666666666666666 (11 pt: the theme's 13px rounds to 10 pt, and the next standard size is 11 pt)
```

A1 shows a bold, 16 px Georgia title that wraps and starts at the top of the cell. A2:B4 paint in Calibri at 11 pt, at the bottom of their rows.

</details>

## Font and alignment fields

These `CellStyle` fields control text. All of them are optional.

| Field | Type | Effect |
| --- | --- | --- |
| `fontFamily` | `string` | One font family, for example `"Calibri"`. The theme font is the fallback. |
| `fontSize` | `number` | Font size in CSS pixels. |
| `bold` | `boolean` | Bold text. |
| `italic` | `boolean` | Italic text. |
| `underline` | `boolean` | Underlined text. |
| `strikethrough` | `boolean` | Struck-through text. |
| `color` | `string` | Hex text color, for example `"#111111"`. |
| `align` | `"left" \| "center" \| "right"` | Horizontal alignment. |
| `verticalAlign` | `"top" \| "middle" \| "bottom"` | Vertical alignment. Omitted means centered. |
| `wrap` | `boolean` | Wrap text onto more lines inside the cell. |

Paint, column auto-fit, snapshots, the clipboard and hyperlink styles all honor `fontFamily`, `verticalAlign` and `numberFormat`.

### Font family names

`fontFamily` names one family. Sheetwrite draws it before the theme font's families, so a font that the browser does not have falls back to the theme font.

A valid name has 1 to 128 characters: letters, digits, spaces, `.`, `_` and `-`. It starts with a letter or a digit and does not end in a space. `isCellFontFamily(value)` from `@sheetwrite/core` applies this rule. The same rule guards snapshots, hyperlinks, the clipboard and XLSX import.

```ts prelude="core" partial="uses the font-name rule export" title="Check a font name"
import { isCellFontFamily } from "@sheetwrite/core";

isCellFontFamily("Segoe UI"); // true
isCellFontFamily("Arial, sans-serif"); // false: a comma is not allowed
```

## Grid actions

`grid.actions` holds the commands behind the toolbar and the ribbon. Each command applies to every cell of the current selection. It does nothing when the grid is read-only or the selection is empty.

| Command | Effect |
| --- | --- |
| `setFontFamily(family: string \| null)` | Sets the font family. `null` returns the cells to the column or theme font. |
| `setFontSize(size: number \| null)` | Sets the font size in CSS pixels. `null` returns the cells to the default. |
| `stepFontSize(direction: 1 \| -1)` | Steps the focus cell's font size to the next larger (`1`) or smaller (`-1`) standard size, and applies it to the selection. |
| `setVerticalAlign(align: CellVerticalAlign)` | Sets `verticalAlign` to `"top"`, `"middle"` or `"bottom"`. |
| `toggleWrap()` | Sets `wrap` to the opposite of the focus cell's `wrap`. |
| `setAlign(align)` | Sets the horizontal alignment. |
| `toggleBold()`, `toggleItalic()`, `toggleUnderline()`, `toggleStrikethrough()` | Turn the field on or off, from the focus cell's current value. |

`stepFontSize` uses Excel's standard sizes, in points: 8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72.

- The start size is the focus cell's `fontSize`. If the cell has none, it is the pixel size in the theme `font` (13 px when the theme font has no pixel size).
- Sheetwrite converts pixels to points at 96/72 pixels per point and rounds to the nearest half point.
- Above 72 pt, a step up goes to the next multiple of 10 points. Below 8 pt, a step down removes 1 point and stops at 1 pt.

The ribbon's font list calls `setFontFamily` (an empty name sends `null`). Its size box calls `setFontSize` with the points converted to pixels. Increase Font Size and Decrease Font Size call `stepFontSize(1)` and `stepFontSize(-1)`. Top Align, Middle Align and Bottom Align call `setVerticalAlign`, and Wrap Text calls `toggleWrap`.

```ts prelude="core" partial="requires a selection in the grid" title="Shrink the font and wrap"
grid.actions.stepFontSize(-1);
grid.actions.toggleWrap();
grid.actions.setFontSize(null); // back to the default size
```

## Vertical alignment in XLSX and LibreOffice

*Updated in 0.6.0.* An XLSX cell with no vertical alignment is bottom-aligned in Excel, but an unset Sheetwrite cell paints centered. Import and export now convert between the two defaults, so imported files look as they do in Excel. LibreOffice reads and writes the same XLSX attributes, and the LibreOffice round trip has no vertical-alignment differences.

Visible change: imported cells with no vertical alignment now sit at the bottom, as in Excel.

Import (cell styles):

| XLSX `<alignment vertical>` | Sheetwrite `verticalAlign` |
| --- | --- |
| No `<alignment>`, or no `vertical` attribute | `"bottom"` |
| `bottom` | `"bottom"` |
| `top` | `"top"` |
| `center` | Unset (the grid default, centered) |
| `center`, in a column whose default is `"bottom"` | `"middle"` (an explicit value overrides the column default) |

A workbook with no styles part imports every cell as `"bottom"`.

Export (cell styles):

| Sheetwrite `verticalAlign` | XLSX `<alignment vertical>` |
| --- | --- |
| Unset | `center` |
| `"middle"` | `center` |
| `"top"` | `top` |
| `"bottom"` | No `vertical` attribute (the XLSX default) |

Export also writes the workbook's normal cell style with `vertical="center"`, so unstyled cells stay centered.

Conditional-format styles are differential: they change only the fields they set. For them, import maps `center` to `"middle"`, `top` and `bottom` to the same names, and a missing attribute to unset. Export writes only a value that the style sets (`"middle"` as `center`).

Fonts on import: only fonts other than the workbook default become a cell `fontFamily`.

## Edge cases and limits

- `wrap` applies to text, not to numbers. A number that does not fit its cell paints as `#` characters.
- A wrapped block that is taller than its cell starts at the top of the cell.
- Text that does not wrap can spill past its cell: left-aligned text to the right, right-aligned text to the left, and centered text to both sides. Numbers never spill.
- Native boolean values are centered unless `CellStyle.align` overrides it.
- A font that the browser does not have falls back to the theme font.

## See also

- [Styles and themes](/docs/features/formatting/styles/#cellstyle) for the full `CellStyle` and borders.
- [Number formats](/docs/features/formatting/number-formats/)
- [Configuration](/docs/features/grid/options-and-presentation/) for the toolbar.
- [XLSX export](/docs/import-export/xlsx-export/)
- [`GridActions`](/docs/api/core/grid-actions/), [`CellStyle`](/docs/api/core/cell-style/) and [`isCellFontFamily`](/docs/api/core/is-cell-font-family/) API reference.
