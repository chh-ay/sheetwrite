---
title: Toolbar and ribbon
description: Show the built-in toolbar or the Excel-style ribbon in a full or compact layout, all rendered from one command model, and drive host chrome from command state.
---

Set `config` to show the built-in toolbar, or `config: { ribbon: true }` to show an Excel-style ribbon instead. The toolbar, the full ribbon and the compact ribbon render one command model: the same commands, glyphs, enabled and pressed state, keyboard behavior and accessible names.

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

### Compact ribbon

The compact ribbon shows the selected tab's commands on one row, like Excel's simplified ribbon. It uses the same live controls as the full ribbon, so a value you type in a box and the selected tab stay when you switch.

- The **Compact** button in the tab row switches between the full and the compact layout. It is a toggle button: `aria-pressed` tells screen readers which layout is on.
- `ribbon: { mode: "compact" }` starts compact. `ribbon: { mode: "auto" }` uses compact while the ribbon is narrower than `compactWidth` (default 768 CSS pixels) and full otherwise. When the user picks a layout with the button, the ribbon keeps that layout at every width.
- Groups that do not fit on the row fold into dropdown buttons, as in the full ribbon.

```ts prelude="core" partial="requires a host and the Budget workbook shown in Full setup" title="Compact ribbon on narrow screens"
const grid = createGrid(host, {
  workbook,
  config: { ribbon: { mode: "auto", compactWidth: 900 } },
});
```

`compactWidth` must be a positive finite number; other values throw a `RangeError` when the grid is created or reconfigured.

### Keyboard

| Key | Effect |
| --- | --- |
| Tab | Reaches the tab row. The ribbon is first in the host, so keyboard users reach it before the grid. |
| Arrow keys | Move between tabs, and through menus and lists. |
| Enter | Picks a menu or list item. |
| Escape | Returns focus to the grid. |
| Ctrl/Cmd shortcuts | Still reach the grid, for example undo. Plain keys stay in the ribbon. |

### Loading

The ribbon and the toolbar load with `import()` as their own chunk, only when a grid asks for one. A grid without chrome does not download it.

- The grid reserves the chrome's height while the chunk loads, so nothing moves when it arrives.
- A chunk that arrives after the chrome was rebuilt, or after the grid was destroyed, is dropped.
- If the chunk fails to load, the grid gives the space back and shows no chrome. The load error is still reported as an unhandled promise rejection; the host cannot catch it.

### Ribbon outside the grid

The composable shell mounts the same ribbon. Pass `ribbon: true` (or a `RibbonConfig` object) to `createSpreadsheetShell`, or call [`createRibbon`](/docs/api/core-shell/create-ribbon/) to place it yourself:

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
| `onHeightChange` | Called with the new height after the ribbon is minimized or expanded, or changes layout. |
| `mode`, `compactWidth` | The initial layout, as in `GridConfig.ribbon`. |
| `flags` | The [command flags](#command-flags) that choose commands. By default every command shows except Export. |

The ribbon and the toolbar style themselves from the same `--sheetwrite-widget-*`, `--sheetwrite-toolbar-*` and `--sheetwrite-menu-*` properties, so light, dark and host themes apply.

## Toolbar

The toolbar shows the ribbon's commands on one row, in ribbon order (Home, Insert, Data, View), with a separator between groups. Commands that do not fit move, in order, into a **More commands** button at the end of the row. It opens the remaining commands in a popup group, so every command stays reachable at any width.

```ts prelude="core" partial="requires surrounding host state" title="Toolbar flags"
createGrid(host, { workbook, config: {} });                 // toolbar with the default commands
createGrid(host, { workbook, config: { sort: false } });    // toolbar, no sort commands
createGrid(host, { workbook, config: { export: true } });   // toolbar with Export CSV and Export XLSX
createGrid(host, { workbook, config: { toolbar: false } }); // no toolbar
createGrid(host, { workbook });                             // no toolbar (config omitted)
```

| Key | Effect |
| --- | --- |
| Tab | Reaches the toolbar controls. The toolbar is first in the host. |
| Left / Right, Home / End | Move between controls. A text box keeps these keys for its caret. |
| Arrow Down | Opens a menu or split button's list, as in the ribbon. |
| Escape | Closes a popup, or returns focus to the grid. |
| Ctrl/Cmd shortcuts | Still reach the grid. |

Each command keeps its accessible name, and its tooltip adds the keyboard shortcut when one is bound (for example "Undo (Ctrl+Z)"). Every command element has a `data-command` attribute with the command ID, for host styles and tests.

### Command flags

These `GridConfig` fields ([`CommandFlags`](/docs/api/core/command-flags/)) choose built-in commands in every renderer: the toolbar, the full ribbon and the compact ribbon. When `config` is present, every flag except `export` defaults to `true`.

| Flag | Default | Commands |
| --- | --- | --- |
| `toolbar` | `true`¹ | Master switch. `false` removes the toolbar and the ribbon. An item list replaces the default commands. |
| `undo` | `true` | Undo and Redo (also bound to Ctrl+Z / Ctrl+Shift+Z). |
| `bold` | `true` | Bold. Underline and Strikethrough show while `bold` or `italic` is on. |
| `italic` | `true` | Italic. |
| `align` | `true` | Align Left, Center, Align Right, and Top, Middle and Bottom Align. |
| `textColor` | `true` | Font Color palette. |
| `fillColor` | `true` | Fill Color palette. |
| `border` | `true` | Borders. |
| `clearFormat` | `true` | Clear (Clear All, Clear Formats, Clear Contents). |
| `merge` | `true` | Merge & Center (also Merge Cells and Unmerge Cells). |
| `sort` | `true` | Sort & Filter, Sort A to Z and Sort Z to A. |
| `export` | `false` | Export CSV and Export XLSX, in the Data tab's Export group. |
| `ribbon` | `false` | Show the ribbon instead of the toolbar. See [Compact ribbon](#compact-ribbon). |

¹ "Default `true`" means: when you supply a `config` object at all. With no `config` there is no toolbar.

The shell's `createToolbar` shows Export by default; pass `flags` to change it.

### Custom toolbar items

A custom `toolbar: ToolbarItem[]` list names built-in actions, separators, or `onClick(grid)` callbacks. Every control acts on the current selection; see [Interaction → Selection model](/docs/features/grid/selection-and-keyboard/#selection-model).

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

Built-in action names: `bold`, `italic`, `underline`, `strikethrough`, `alignLeft`, `alignCenter`, `alignRight`, `alignTop`, `alignMiddle`, `alignBottom`, `wrap`, `textColor`, `fillColor`, `border`, `clearFormat`, `merge`, `unmerge`, `sortAsc`, `sortDesc`, `exportCsv`, `exportXlsx`, `undo`, `redo` and `separator`. A built-in action renders the ribbon's command with that ID; `title` and `icon` replace its name and glyph in that toolbar only.

### Options that changed in 0.7

Every toolbar option keeps working. These parts render differently because the toolbar now uses the ribbon's commands:

| Before 0.7 | Now | Use instead |
| --- | --- | --- |
| `textColor` and `fillColor` were native color inputs. | Font Color and Fill Color are palette split buttons. | The palette, or `grid.actions.setTextColor` / `setFillColor` from host chrome. |
| `border` toggled all borders. | Borders is a split button: the face adds a bottom border and the menu has every preset. | Pick "All Borders" from the menu, or call `grid.actions.setBorders("all")`. |
| `clearFormat` was one button. | The default toolbar shows the Clear menu. A custom item `{ action: "clearFormat" }` is still one Clear Formats button. | Pick "Clear Formats", or name the action in a custom list. |
| `merge` and `unmerge` were two buttons. | The default toolbar shows one Merge & Center menu. Custom items `merge` and `unmerge` are still one-click buttons. | Pick "Merge Cells" or "Unmerge Cells", or name the actions in a custom list. |
| Controls had `.sheetwrite-tb-<action>` classes. | Controls use the ribbon's classes. | Select `[data-command="<id>"]`. |
| The toolbar mounted synchronously with the grid and the shell. | The grid's toolbar and the `createSpreadsheetShell` toolbar load with their own chunk, with their height reserved. `createToolbar` still mounts at once. | Wait for the toolbar before you query its elements. |
| A ribbon chunk that failed to load fell back to the flat toolbar. | The toolbar shares that chunk, so the grid shows no chrome. | Handle the reported load error. The shell still falls back to its toolbar. |

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

The built-in toolbar and ribbon use the same contract, including native `disabled` and `aria-pressed="mixed"`.

## Feature flags

These `GridConfig` fields enable behavior outside the toolbar row:

| Field | Type | Default | Effect |
| --- | --- | --- | --- |
| `find` | `boolean` | `true` | Built-in **Ctrl+F** search box, next/previous controls, and live match count. See [Search](/docs/features/grid/search/). |
| `contextMenu` | `boolean \| ContextMenuItems` | `true` | Built-in right-click menu, disabled menu, static readonly rows, or a context-aware row factory. See [Context menu](/docs/features/grid/context-menu/). |
| `icons` | `IconOverrides` | `undefined` | Built-in command glyph overrides, in the toolbar, ribbon, ribbon menus and context menu. Strings render as text; a DOM `Node` or `() => Node` supports SVG/HTML without `innerHTML`. |
| `tabs` | `boolean` | `true` | Bottom sheet-tab bar for multi-sheet workbooks. |
| `keyboard` | `boolean \| KeyboardOptions \| function` | `true` | Built-in key bindings. See [Interaction → Keyboard navigation](/docs/features/grid/selection-and-keyboard/#keyboard-navigation). |

Undo, redo and find are keyboard-driven and work without the toolbar: **Ctrl+Z** undoes the last edit, **Ctrl+Shift+Z** redoes it, and **Ctrl+F** opens the find widget (unless `find: false`).

## Edge cases and limits

- A custom `toolbar: [...]` item list still renders the toolbar, even with `ribbon: true`.
- `toolbar: false` removes both the toolbar and the ribbon.
- Command-state aggregation is bounded. Very large selections conservatively report `mixed` instead of forcing an unbounded cell walk.
- `grid.setConfig(config)` reconfigures the built-in chrome without replacing the grid or clearing selection and history.

## See also

- [Context menu](/docs/features/grid/context-menu/)
- [Search](/docs/features/grid/search/)
- [Grid methods](/docs/features/grid/grid-methods/)
- [Styling → Widget and context-menu styling](/docs/features/formatting/styles/#widget-and-context-menu-styling)
- Generated [`GridConfig`](/docs/api/core/grid-config/), [`GridActions`](/docs/api/core/grid-actions/), [`GridCommandState`](/docs/api/core/grid-command-state/) and [`createRibbon`](/docs/api/core-shell/create-ribbon/) contracts
