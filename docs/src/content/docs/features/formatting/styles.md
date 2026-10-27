---
title: Styles and themes
description: Style the canvas with a theme, CSS custom properties, cell styles, and borders.
---

Sheetwrite paints cells on a canvas, so it has two style layers: the **`Theme`** (colors, fonts, and geometry for the renderer) and **`CellStyle`** (formatting for one cell or one column). A small stylesheet styles the host container and declares CSS custom properties.

```ts prelude="theming" partial="requires the initialized grid from Full setup" title="Theme and cell style"
grid.setTheme({ headerBg: "#e8eef7", headerFg: "#1f3a5f" });
grid.applyTransaction({
  patches: [{
    op: "set",
    addr: { sheet: "sheet1", row: 0, col: 0 },
    value: { kind: "literal", value: "Total" },
    style: {
      bold: true,
      backgroundColor: "#eef1f5",
      border: { bottom: { color: "#111111", width: 2, style: "solid" } },
    },
  }],
});
```

<div class="sw-grid-result" data-caption="Result: A1 is bold with a light #eef1f5 fill and a 2 px solid #111111 bottom border. The grid headers use #e8eef7 and #1f3a5f; Item is bold, and Qty cells are right-aligned.">

| <strong>Total</strong> | |
| --- | ---: |
| | |
| | |
| | |
| | |

</div>

<details>
<summary>Full setup</summary>

```ts compile title="Theme and cell style"
import { createGrid, initSheetwrite, type Workbook } from "@sheetwrite/core";
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
      rowCount: 5,
      columns: [
        { key: "item", header: "Item", width: 160, type: "text", headerStyle: { bold: true } },
        { key: "qty", header: "Qty", width: 100, type: "number", cellStyle: { align: "right" } },
      ],
    },
  ],
};

await initSheetwrite();
const grid = createGrid(host, {
  workbook,
  theme: { headerBg: "#e8eef7", headerFg: "#1f3a5f" },
});

grid.applyTransaction({
  patches: [
    {
      op: "set",
      addr: { sheet: "sheet1", row: 0, col: 0 },
      value: { kind: "literal", value: "Total" },
      style: {
        bold: true,
        backgroundColor: "#eef1f5",
        border: { bottom: { color: "#111111", width: 2, style: "solid" } },
      },
    },
  ],
});
```

The header row paints with the theme's `headerBg` and `headerFg`, and the "Item" header is bold. Cell A1 shows a bold "Total" on a light fill with a thick bottom border. The "Qty" column is right-aligned.

</details>

## Theme

The `Theme` controls the canvas paint. Pass a `Partial<Theme>` as the `theme` option, or call `grid.setTheme(partial)` at runtime. Sheetwrite merges either one over the defaults.

```ts prelude="theming" partial="requires surrounding host state" title="Theme fields"
interface Theme {
  font: string;
  bg: string;
  fg: string;
  gridLine: string;
  headerBg: string;
  headerFg: string;
  selection: string;
  selectionBorder: string;
  rowHeight: number;
  headerHeight: number;
  rowHeaderWidth: number; // 0 hides the left row-number gutter
  searchMatch: string;       // fill behind a search match
  searchActiveMatch: string; // fill/outline for the active (current) match
  highlight: string;         // fill for cells highlighted via Grid.highlightCells
}
```

`DEFAULT_THEME` (exported from `@sheetwrite/core`):

| Field | Default |
| --- | --- |
| `font` | `"13px system-ui, -apple-system, Segoe UI, Roboto, sans-serif"` |
| `bg` | `"#ffffff"` |
| `fg` | `"#111111"` |
| `gridLine` | `"#eeeeee"` |
| `headerBg` | `"#f4ede1"` |
| `headerFg` | `"#6b4a1f"` |
| `selection` | `"#2563eb22"` |
| `selectionBorder` | `"#2563eb"` |
| `rowHeight` | `28` |
| `headerHeight` | `32` |
| `rowHeaderWidth` | `48` |
| `searchMatch` | `"#ffd54f80"` |
| `searchActiveMatch` | `"#f59e0b"` |
| `highlight` | `"#a7f3d080"` |

The shipped `styles.css` declares different values for the search and highlight CSS custom properties (`#fff47580`, `#fbbc04`, `#e8f0fe99`). On a host that imports the stylesheet, those values win over `DEFAULT_THEME`, because of the [resolution order](#resolution-order).

Override the search-match colors at runtime with `setTheme`:

```ts prelude="theming" partial="requires surrounding host state" title="Search-match colors"
grid.setTheme({ searchMatch: "#fff47580", searchActiveMatch: "#fbbc04" });
```

### Resolution order

Sheetwrite computes the effective theme once at construction, and again on `setTheme`:

```text partial="illustrative output or schema" title="Illustrative excerpt"
DEFAULT_THEME  <  --sheetwrite-* CSS custom properties (resolveThemeFromCss)  <  opts.theme / setTheme
```

`resolveThemeFromCss(host)` reads CSS custom properties from the host's computed style into a partial theme. `opts.theme` wins last.

| Method | Semantics |
| --- | --- |
| `grid.setTheme(partial)` | **Imperative patch.** Merges into the accumulated base theme and repaints. Use it for incremental changes. |
| `grid.replaceTheme(partial \| undefined)` | **Option-level replacement.** Runs the construction-time resolution again with the new value. `undefined` restores the CSS-variable and default resolution. The framework adapters call it for their `theme` prop, so **the prop is authoritative**: when you remove the prop (or drop a field), the defaults come back; no stale merged values stay. |
| `grid.getEffectiveTheme()` | Returns the effective (post-zoom) theme that paints now. |
| `grid.getTheme()` | Returns a copy of the base theme, before zoom scaling. |

After `setTheme` or `replaceTheme` changes the base theme, the Grid emits `theme-change` with a copy of the new theme. Use it to keep host controls in step with the canvas. The built-in toolbar uses it: its text and fill color swatches show the theme's `fg` and `bg` until the user picks a color.

```ts prelude="theming" partial="requires surrounding host state" title="Follow theme changes"
const swatch = document.querySelector<HTMLElement>("#fill-swatch")!;
swatch.style.background = grid.getTheme().bg;
grid.on("theme-change", ({ theme }) => {
  swatch.style.background = theme.bg;
});
```

Tailwind uses the same seam. Set `--sheetwrite-*` custom properties on the host with arbitrary-property utilities (for example `class="[--sheetwrite-bg:#0b0b0c] [--sheetwrite-fg:#e7e7e7]"`) or with a `@layer` rule. Construction and `replaceTheme(undefined)` both read them from the computed style.

```ts prelude="theming" partial="requires surrounding host state" title="Dark theme"
const DARK: Partial<Theme> = {
  bg: "#0b0b0c",
  fg: "#e7e7e7",
  gridLine: "#26262a",
  headerBg: "#1a160f",
  headerFg: "#e8c98a",
  selection: "#e8c98a22",
  selectionBorder: "#e8c98a",
};

grid.setTheme(DARK);
```

## CSS custom properties and the stylesheet

Import the stylesheet once. It styles the host container (the grid adds the `.sheetwrite` class to your host element) and declares the `--sheetwrite-*` defaults. It also ships a dark variant under `[data-theme="dark"]` or a `.dark` ancestor class (the Tailwind convention).

```ts prelude="theming" partial="requires surrounding host state" title="Import the stylesheet"
import "@sheetwrite/core/styles.css";
```

`resolveThemeFromCss` maps these custom properties onto `Theme` fields:

| CSS custom property | Theme field |
| --- | --- |
| `--sheetwrite-bg` | `bg` |
| `--sheetwrite-fg` | `fg` |
| `--sheetwrite-grid-line` | `gridLine` |
| `--sheetwrite-header-bg` | `headerBg` |
| `--sheetwrite-header-fg` | `headerFg` |
| `--sheetwrite-selection` | `selection` |
| `--sheetwrite-selection-border` | `selectionBorder` |
| `--sheetwrite-row-height` | `rowHeight` (parsed as a number) |
| `--sheetwrite-search-match` | `searchMatch` |
| `--sheetwrite-search-active` | `searchActiveMatch` |
| `--sheetwrite-highlight` | `highlight` |
| `--sheetwrite-font` | `font` (a `/ line-height` segment is removed for the canvas) |

`headerHeight` and `rowHeaderWidth` have no CSS variable. Set them with the `theme` option. An explicit `--sheetwrite-*` value on the `.sheetwrite` element itself wins over both dark selectors (the same element wins over an ancestor).

### Widget and context-menu styling

The stylesheet also exposes widget variables, in addition to the canvas theme mapping:

| CSS custom property | Widget use | Fallback |
| --- | --- | --- |
| `--sheetwrite-widget-border` | Borders and separators for toolbar, find and menu chrome | `--sheetwrite-grid-line` |
| `--sheetwrite-menu-hover` | Context-menu item hover background | `--sheetwrite-grid-line` |
| `--sheetwrite-menu-disabled-opacity` | Disabled context-menu row opacity | `0.5` |

The bundled menu uses these public classes:

| Class | Element |
| --- | --- |
| `.sheetwrite-context-menu` | Container |
| `.sheetwrite-context-menu-item` | Row |
| `.sheetwrite-context-menu-item-disabled` | Disabled state |
| `.sheetwrite-context-menu-shortcut` | Shortcut hint |
| `.sheetwrite-context-menu-sep` | Separator |

Scope overrides below the grid host. Do not replace positioning, visibility, or disabled behavior:

```css partial="host-scoped visual override" title="Context menu theme hooks"
.sheetwrite {
  --sheetwrite-widget-border: #334155;
  --sheetwrite-menu-hover: #1e293b;
  --sheetwrite-menu-disabled-opacity: 0.45;
}

.sheetwrite .sheetwrite-context-menu-item {
  font-weight: 500;
}
```

The recommended runtime-theming pattern changes both layers together. Toggle `data-theme` on a wrapper so the CSS-variable chrome around the grid changes, and call `setTheme` so the canvas repaints.

```ts prelude="theming" partial="requires surrounding host state" title="Toggle dark mode"
darkBtn.addEventListener("click", () => {
  grid.setTheme(DARK);
  stage.setAttribute("data-theme", "dark");
});
```

## CellStyle

`CellStyle` formats individual cells. It appears in three places:

| Place | Effect |
| --- | --- |
| `style` on a `set` patch | Formatting for that one cell. |
| `Column.cellStyle` | A column-wide default that the renderer paints under every body cell of the column. |
| `Column.headerStyle` | The style of that column's header cell. |

`Column.cellStyle` is a default, not a lock. A per-cell `set` style overrides the column default for that cell. A cell paints with its column's `cellStyle` until its own patch supplies styling.

```ts prelude="theming" partial="requires surrounding host state" title="CellStyle fields"
interface CellStyle {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  fontSize?: number;
  fontFamily?: string;       // e.g. "Calibri"; the theme font is the fallback
  color?: string;            // hex text color, e.g. "#111111"
  backgroundColor?: string;  // hex fill, e.g. "#ffffff"
  align?: "left" | "center" | "right";
  verticalAlign?: "top" | "middle" | "bottom"; // omitted = centered
  numberFormat?: string;     // overrides the column's numberFormat
  wrap?: boolean;
  border?: CellBorders;
}
```

The font, alignment and wrap fields are on [Fonts and alignment](/docs/features/formatting/fonts-and-alignment/). `numberFormat` is on [Number formats](/docs/features/formatting/number-formats/).

Apply a style to a cell with a transaction. A `set` replaces the value and the style, so pass the current value back when you only change the style:

```ts prelude="theming" partial="requires surrounding host state" title="Style one cell"
grid.store.applyTransaction({
  patches: [
    {
      op: "set",
      addr: { sheet: "sheet1", row: 0, col: 0 },
      value: { kind: "literal", value: "Total" },
      style: { bold: true, align: "center", backgroundColor: "#eef1f5" },
    },
  ],
});
```

### Borders

Borders are per side. `CellBorders.all` applies to each side that has no border of its own:

```ts prelude="theming" partial="requires surrounding host state" title="Border types"
interface CellBorders {
  all?: CellBorder;
  top?: CellBorder;
  right?: CellBorder;
  bottom?: CellBorder;
  left?: CellBorder;
}

interface CellBorder {
  color?: string;                          // hex, e.g. "#111111"
  width?: number;
  style?: "solid" | "dashed" | "dotted";
}
```

```ts prelude="theming" partial="requires surrounding host state" title="Thin border with a thick bottom"
const style: CellStyle = {
  border: {
    all: { color: "#cccccc", width: 1, style: "solid" },
    bottom: { color: "#111111", width: 2, style: "solid" },
  },
};
```

## Edge cases and limits

- On a host that imports `styles.css`, the stylesheet's search and highlight colors win over `DEFAULT_THEME`.
- `headerHeight` and `rowHeaderWidth` have no CSS variable.
- A `set` patch replaces the value and the style. Pass the current value back to change only the style.

## See also

- [Fonts and alignment](/docs/features/formatting/fonts-and-alignment/)
- [Number formats](/docs/features/formatting/number-formats/)
- [Conditional formats](/docs/features/formatting/conditional-formats/)
- [Configuration](/docs/features/grid/options-and-presentation/) for `theme`, `renderers`, and the toolbar color controls.
- [Concepts](/docs/concepts/runtime-ownership/#headers-letters-vs-field-names) for the styled row-0 field-header pattern.
- [`Theme`](/docs/api/core/theme/) and [`CellStyle`](/docs/api/core/cell-style/) API reference.
