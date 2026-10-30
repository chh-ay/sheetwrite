---
title: Toolbar and ribbon
description: Show the built-in flat toolbar or the Excel-style ribbon, and drive host chrome from command state.
---

Set `config` to show the built-in toolbar, or `config: { ribbon: true }` to show an Excel-style ribbon instead.

```ts prelude="core" partial="requires a host and the Budget workbook shown in Full setup" title="Show the ribbon"
const grid = createGrid(host, { workbook, config: { ribbon: true } });
console.log(grid.getCommandState("undo").disabled); // true: no history yet
```

<figure class="sw-chrome-result">
  <div class="sw-mini-ribbon" aria-label="Ribbon preview, Home tab selected">
    <div class="sw-mini-ribbon-tabs">
      <span data-active="true"><strong>Home</strong></span>
      <span>Insert</span>
      <span>Data</span>
      <span>View</span>
    </div>
    <div class="sw-mini-ribbon-groups">
      <section aria-label="Undo commands">
        <div>
          <span aria-disabled="true"><span class="sheetwrite-icon" data-icon="undo" aria-hidden="true"></span> Undo</span>
          <span aria-disabled="true"><span class="sheetwrite-icon" data-icon="redo" aria-hidden="true"></span> Redo</span>
        </div>
        <small>Undo</small>
      </section>
      <section aria-label="Clipboard commands">
        <div><span><span class="sheetwrite-icon" data-icon="paste" aria-hidden="true"></span> Paste ▾</span></div>
        <small>Clipboard</small>
      </section>
      <section aria-label="Font commands">
        <div>
          <span><span class="sheetwrite-icon" data-icon="bold" aria-hidden="true"></span> Bold</span>
          <span><span class="sheetwrite-icon" data-icon="italic" aria-hidden="true"></span> Italic</span>
          <span><span class="sheetwrite-icon" data-icon="underline" aria-hidden="true"></span> Underline</span>
        </div>
        <small>Font</small>
      </section>
    </div>
  </div>
  <figcaption>Result: Home is open above the Budget sheet. Three command groups are excerpted here; Undo and Redo are disabled because there is no edit history. This is a static preview.</figcaption>
</figure>

The ribbon appears above the grid with the Home, Insert, Data and View tabs.

[Try it live → Spreadsheet showcase](/showcases/spreadsheet/)

<details>
<summary>Full setup</summary>

```ts compile title="Grid with the Excel-style ribbon"
import { createGrid, initSheetwrite, type Workbook } from "@sheetwrite/core";
import "@sheetwrite/core/styles.css";

const host = document.querySelector<HTMLElement>("#grid");
if (host === null) throw new Error("Missing #grid host");
host.style.height = "480px";

const workbook: Workbook = {
  activeSheet: "budget",
  sheets: [
    {
      id: "budget",
      name: "Budget",
      rowCount: 100,
      columns: [
        { key: "item", header: "Item", width: 200, type: "text" },
        { key: "cost", header: "Cost", width: 120, type: "number" },
      ],
    },
  ],
};

await initSheetwrite();
const grid = createGrid(host, { workbook, config: { ribbon: true } });
console.log(grid.getCommandState("undo").disabled); // true: no history yet
```

</details>

## Ribbon

The ribbon has four tabs with Excel's group names, labels and order:

| Tab | Groups and controls |
| --- | --- |
| Home | **Undo**. **Clipboard**: Paste split button. **Font**: font name and size boxes, grow and shrink, bold, italic, underline, strikethrough, Borders, Fill Color and Font Color palettes. **Alignment**: top, middle, bottom, wrap, left, center, right, Merge & Center. **Number**: format box, currency, percent, comma, more and fewer decimals. **Cells**: Insert, Delete, Format. **Editing**: AutoSum, Clear, Sort & Filter, Find. |
| Insert | **Rows & Columns**: Insert (rows above or below, columns left or right), Delete (rows or columns). **Links**: link form. **Notes**: note form. |
| Data | **Sort & Filter**: Sort A to Z, Sort Z to A, Clear Filter. **Outline**: Group and Ungroup rows. **Show/Hide**: Hide Rows, Unhide Rows, Hide Columns, Unhide Columns. |
| View | **Window**: Freeze Panes, Freeze Top Row, Freeze First Column, Unfreeze Panes. **Zoom**: zoom out, current percent, zoom in. |

Every control reads the same `getCommandState` contract as host chrome. It disables while the grid is read-only.

### Narrow widths

As the grid narrows, the ribbon shrinks the way Excel does:

1. Large buttons become small ones.
2. Labels go.
3. Whole groups fold into one dropdown button that opens the group in a popup.

Groups fold in Excel order. On Home, Editing folds first, then Cells, Number, Alignment, Clipboard, Font and Undo.

Double-click a tab, or use the arrow at the right, to hide the panel and keep only the tab row. The grid takes the space back.

### Keyboard

| Key | Effect |
| --- | --- |
| Tab | Reaches the tab row. The ribbon is first in the host, so keyboard users reach it before the grid. |
| Arrow keys | Move between tabs, and through menus and lists. |
| Enter | Picks a menu or list item. |
| Escape | Returns focus to the grid. |
| Ctrl/Cmd shortcuts | Still reach the grid, for example undo. Plain keys stay in the ribbon. |

### Loading

The ribbon loads with `import()` as its own chunk, only when a grid asks for it. A grid without the ribbon does not download it; that is about 25 KB less minified JavaScript.

- The grid reserves the ribbon's height while the chunk loads, so nothing moves when it arrives.
- A chunk that arrives after the chrome was rebuilt, or after the grid was destroyed, is dropped.
- If the chunk fails to load, the grid shows the flat toolbar. The load error is still reported as an unhandled promise rejection; the host cannot catch it.

### Ribbon outside the grid

The composable shell mounts the same ribbon. Pass `ribbon: true` to `createSpreadsheetShell`, or call [`createRibbon`](/docs/api/core-shell/create-ribbon/) to place it yourself:

```ts prelude="core" partial="requires a mounted grid and a ribbon host element" title="Place the ribbon yourself"
import { createRibbon } from "@sheetwrite/core/shell";

const ribbonHost = document.createElement("div");
host.before(ribbonHost);
const ribbon = createRibbon(ribbonHost, grid, {
  focusGrid: () => host.focus(),
  onHeightChange: (height) => console.log(`ribbon is ${height}px tall`),
});

// During teardown; safe to call twice.
ribbon.destroy();
```

| `RibbonOptions` field | Effect |
| --- | --- |
| `focusGrid` | Returns keyboard focus to the grid after a pick or Escape. By default the host gets focus. |
| `onHeightChange` | Called with the new height after the ribbon is minimized or expanded. |

The ribbon styles itself from the same `--sheetwrite-widget-*`, `--sheetwrite-toolbar-*` and `--sheetwrite-menu-*` properties as the toolbar, so light, dark and host themes apply.

## GridConfig (toolbar)

Each flag toggles one control. When `config` is present, every flag except `export` and `ribbon` defaults to `true`. `toolbar: false` suppresses the toolbar entirely.

```ts prelude="core" partial="requires surrounding host state" title="Toolbar flags"
createGrid(host, { workbook, config: {} });                 // toolbar with the default controls
createGrid(host, { workbook, config: { sort: false } });    // toolbar, no sort controls
createGrid(host, { workbook, config: { export: true } });   // toolbar with CSV and XLSX buttons
createGrid(host, { workbook, config: { toolbar: false } }); // no toolbar
createGrid(host, { workbook });                             // no toolbar (config omitted)
```

| Flag | Type | Default | Control |
| --- | --- | --- | --- |
| `toolbar` | `boolean \| ToolbarItem[]` | `true`¹ | Master switch. `false` removes the toolbar. An item list replaces the default controls. |
| `undo` | `boolean` | `true` | Undo / redo buttons (also bound to Ctrl+Z / Ctrl+Shift+Z). |
| `bold` | `boolean` | `true` | Bold toggle. |
| `italic` | `boolean` | `true` | Italic toggle. |
| `align` | `boolean` | `true` | Left / center / right alignment. |
| `textColor` | `boolean` | `true` | Text color picker. |
| `fillColor` | `boolean` | `true` | Fill (background) color picker. |
| `border` | `boolean` | `true` | Border control. |
| `clearFormat` | `boolean` | `true` | Clear formatting. |
| `merge` | `boolean` | `true` | Merge / unmerge selection. |
| `sort` | `boolean` | `true` | Sort the selected column ascending / descending. |
| `export` | `boolean` | `false` | CSV / XLSX export buttons. |
| `ribbon` | `boolean` | `false` | Show the Excel-style ribbon instead of the flat toolbar. |

¹ "Default `true`" means: when you supply a `config` object at all. With no `config` there is no toolbar.

The underline and strikethrough toggles show when `bold` or `italic` is on.

### Toolbar actions

Every control acts on the current selection; see [Interaction → Selection model](/docs/features/grid/selection-and-keyboard/#selection-model). A custom `toolbar: ToolbarItem[]` list names built-in actions, separators, or `onClick(grid)` callbacks:

```ts prelude="core" partial="requires surrounding host state" title="Custom toolbar items"
createGrid(host, {
  workbook,
  config: {
    toolbar: [
      { action: "undo" },
      { action: "redo" },
      { action: "separator" },
      { action: "bold" },
      { title: "Clear highlights", icon: "Clear", onClick: (grid) => grid.highlightCells(null) },
    ],
  },
});
```

Built-in action names: `bold`, `italic`, `underline`, `strikethrough`, `alignLeft`, `alignCenter`, `alignRight`, `alignTop`, `alignMiddle`, `alignBottom`, `wrap`, `textColor`, `fillColor`, `border`, `clearFormat`, `merge`, `unmerge`, `sortAsc`, `sortDesc`, `exportCsv`, `exportXlsx`, `undo`, `redo` and `separator`.

### Export buttons

- The export flag always enables CSV. The XLSX button requires an explicit optional installation and `import "@sheetwrite/xlsx/register"` before use. The framework packages do not install an XLSX backend.
- Direct `grid.exportXlsx(...)` calls reject on failure.
- Built-in toolbar and context-menu actions show an alert and emit one `export-error` event for CSV or XLSX failures.
- `grid.actions.exportXlsx()` returns a promise that does not reject.
- Built-in buttons show a busy state and ignore repeated starts while their command is pending.

## Host-owned command state

Host chrome can use `grid.actions` without duplicating selection or history logic. Query one command with `grid.getCommandState(name)`, or subscribe to the complete snapshot through `command-state-change` (`onCommandStateChange` in React and Svelte, `@command-state-change` in Vue):

```ts prelude="core" partial="requires host toolbar elements" title="Accessible host toolbar"
const update = (bold: GridCommandState, undo: GridCommandState) => {
  undoButton.disabled = undo.disabled;
  boldButton.disabled = bold.disabled;
  boldButton.setAttribute(
    "aria-pressed",
    bold.activity === "mixed" ? "mixed" : String(bold.activity === "active"),
  );
};

update(grid.getCommandState("bold"), grid.getCommandState("undo"));
const stop = grid.on("command-state-change", ({ states }) => {
  update(states.bold, states.undo);
});

boldButton.addEventListener("click", () => grid.actions.toggleBold());
undoButton.addEventListener("click", () => grid.actions.undo());

// Run during host teardown.
stop();
```

| `GridCommandState` field | Meaning |
| --- | --- |
| `disabled` | Accounts for read-only mode, empty selections, and undo/redo history. |
| `activity` | `"inactive"`, `"active"` or `"mixed"` across the current selection, for formatting commands. |

The built-in toolbar uses the same contract, including native `disabled` and `aria-pressed="mixed"`.

## Feature flags

These `GridConfig` fields enable behavior outside the toolbar row:

| Field | Type | Default | Effect |
| --- | --- | --- | --- |
| `find` | `boolean` | `true` | Built-in **Ctrl+F** search box, next/previous controls, and live match count. See [Search](/docs/features/grid/search/). |
| `contextMenu` | `boolean \| ContextMenuItems` | `true` | Built-in right-click menu, disabled menu, static readonly rows, or a context-aware row factory. See [Context menu](/docs/features/grid/context-menu/). |
| `icons` | `Partial<Record<ToolbarActionName, ToolbarIcon>>` | `undefined` | Built-in toolbar icon overrides. Strings render as text; a DOM `Node` or `() => Node` supports SVG/HTML without `innerHTML`. |
| `tabs` | `boolean` | `true` | Bottom sheet-tab bar for multi-sheet workbooks. |
| `keyboard` | `boolean \| KeyboardOptions \| function` | `true` | Built-in key bindings. See [Interaction → Keyboard navigation](/docs/features/grid/selection-and-keyboard/#keyboard-navigation). |

Undo, redo and find are keyboard-driven and work without the toolbar: **Ctrl+Z** undoes the last edit, **Ctrl+Shift+Z** redoes it, and **Ctrl+F** opens the find widget (unless `find: false`).

## Edge cases and limits

- The per-control flags apply to the flat toolbar only, not to the ribbon.
- A custom `toolbar: [...]` item list still renders the flat toolbar, even with `ribbon: true`.
- `toolbar: false` removes both the toolbar and the ribbon.
- Command-state aggregation is bounded. Very large selections conservatively report `mixed` instead of forcing an unbounded cell walk.
- `grid.setConfig(config)` reconfigures the built-in chrome without replacing the grid or clearing selection and history.

## See also

- [Context menu](/docs/features/grid/context-menu/)
- [Search](/docs/features/grid/search/)
- [Grid methods](/docs/features/grid/grid-methods/)
- [Styling → Widget and context-menu styling](/docs/features/formatting/styles/#widget-and-context-menu-styling)
- Generated [`GridConfig`](/docs/api/core/grid-config/), [`GridActions`](/docs/api/core/grid-actions/), [`GridCommandState`](/docs/api/core/grid-command-state/) and [`createRibbon`](/docs/api/core-shell/create-ribbon/) contracts
