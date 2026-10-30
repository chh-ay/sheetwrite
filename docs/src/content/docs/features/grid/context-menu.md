---
title: Context menu
description: Configure the built-in right-click menu, build your own menu, and draw temporary highlights.
---

`GridConfig.contextMenu` turns the built-in right-click menu on or off, or replaces its rows with a static list or a context-aware factory.

```ts prelude="core" partial="requires an initialized grid and the config from the partial setup below" title="Install a context-aware menu"
declare const config: GridConfig;
grid.setConfig(config);
// Right-click a cell, then choose Inspect cell to log its stored value.
```

<div class="sw-grid-result" data-selected="A1">

| Ada |
| --- |

<div class="sw-mini-menu" aria-label="Context menu preview">
  <div><span>Copy value</span><kbd>Ctrl+C</kbd></div>
  <hr />
  <div><span>Inspect cell</span></div>
  <div><span>Download CSV</span></div>
</div>

<figcaption>Result: right-clicking Ada opens these three menu rows, with a separator after Copy value. The cell value is unchanged. Static preview; the copy shortcut is shown for Windows/Linux.</figcaption>

</div>

<details>
<summary>Configuration example (requires an initialized grid)</summary>

This configuration excerpt needs an initialized grid. For the result above, use a sheet with `"Ada"` in A1, then pass `config` to `createGrid` or call `grid.setConfig(config)`.

```ts prelude="core" partial="requires an initialized Grid host" title="Context-aware bundled menu"
const config = {
  contextMenu: (context) => [
    { id: "copy", action: "copy", label: "Copy value", shortcut: "copy" },
    { action: "separator" },
    {
      id: "inspect",
      label: "Inspect cell",
      visible: context.cell !== null,
      disabled: ({ cell }) => cell === null,
      onClick(grid, cell) {
        if (cell !== null) console.log(grid.store.getCell(cell));
      },
    },
    { action: "exportCsv", label: "Download CSV" },
  ],
} satisfies GridConfig;
```

</details>

A right-click on a cell shows three rows: **Copy value**, **Inspect cell** and **Download CSV**. When the pointer resolves no cell, **Inspect cell** is hidden.

## How the bundled menu works

On a right-click, Sheetwrite prevents the browser menu, hit-tests the pointer, and selects the resolved cell. Then it evaluates each item's `visible` and `disabled` policy.

## Menu items

`ContextMenuItems` is either a `readonly ContextMenuItem[]` or a factory evaluated for each `ContextMenuContext`.

| `contextMenu` value | Result |
| --- | --- |
| `true` (default) | The default menu. |
| `false` | No bundled menu. |
| `readonly ContextMenuItem[]` | Static readonly rows. |
| `(context) => ContextMenuItem[]` | Rows built for each right-click context. |

| Item field | Meaning |
| --- | --- |
| `id` | Stable row id. |
| `action` | A built-in action name (below). |
| `label` | Visible text. |
| `shortcut` | Shortcut hint. |
| `visible` / `disabled` | A boolean, or a predicate that receives the lean `ContextMenuContext`. |
| `onClick(grid, cell)` | Host callback. It overrides `action`. |

The lean `ContextMenuContext` carries only `cell`, `clientX`, and `clientY`.

The built-in action names are:

| Clipboard/content | Rows | Columns | View/export |
| --- | --- | --- | --- |
| `cut`, `copy`, `paste`, `clearContents` | `insertRowAbove`, `insertRowBelow`, `deleteRow`, `hideRow`, `showAllRows`, `autoFitRow` | `insertColumnLeft`, `insertColumnRight`, `deleteColumn`, `hideColumn`, `showAllColumns`, `autoFitColumn` | `clearFilter`, `merge`, `unmerge`, `exportCsv`, `exportXlsx` |

The default menu contains copy, cut, paste, clear contents, row insert/delete/hide/show/auto-fit, column insert/delete/hide/show/auto-fit, clear column filter, merge, and unmerge actions, with separators between groups. `exportCsv` and `exportXlsx` are not in the default menu, but you can use them in a custom list. XLSX still requires `@sheetwrite/xlsx/register`.

## Host-owned menu

For fully host-owned UI, set `contextMenu: false` and bind the DOM `contextmenu` event on the host. `grid.getCellAtPoint(event.clientX, event.clientY)` resolves the pointer without exposing renderer internals. The host then owns `preventDefault`, selection, positioning, dismissal, and calls to `grid.actions`. Sheetwrite does not prescribe the host's event lifecycle:

```ts prelude="core" partial="requires host menu state" title="Host-owned context menu"
host.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  const cell = grid.getCellAtPoint(event.clientX, event.clientY);
  if (cell !== null) grid.setSelection({ kind: "cell", addr: cell });
  host.dispatchEvent(
    new CustomEvent("sheetwrite:context-menu", {
      detail: { cell, x: event.clientX, y: event.clientY, actions: grid.actions },
    }),
  );
});
```

## Temporary highlights

`grid.highlightCells(ranges, color?)` draws an overlay, not a document edit. Pass `null` to clear all temporary highlights. `color` overrides the theme highlight color; a range can also carry its own `color`.

```ts prelude="core" partial="requires surrounding host state" title="Highlight, then clear"
const sheet = grid.getActiveSheet();
grid.highlightCells(
  [{ sheet, start: { row: 0, col: 0 }, end: { row: 2, col: 1 } }],
  "#ffe08a",
);
// later
grid.highlightCells(null);
```

- Undo does not clear a highlight.
- Choose a distinct overlay color, so users can tell it from selection and cell formatting.
- Use `grid.styleRange` when a fill must be saved and undoable.

The Vanilla workbench offers **Clear highlight** in its context menu. Right-click the highlighted cell to toggle it off, or right-click another cell and choose **Clear highlight**. Both actions write to the host event log.

## Edge cases and limits

- Hidden separators are normalized.
- Disabled rows cannot invoke actions.
- Built-in export actions show an alert and emit one `export-error` event on failure.

## See also

- [Toolbar and ribbon → Feature flags](/docs/features/grid/toolbar-and-ribbon/#feature-flags)
- [Styling → Widget and context-menu styling](/docs/features/formatting/styles/#widget-and-context-menu-styling) for the bundled menu CSS hooks
- Generated [`ContextMenuContext`](/docs/api/core/context-menu-context/), [`ContextMenuItems`](/docs/api/core/context-menu-items/), [`ContextMenuItem`](/docs/api/core/context-menu-item/), and [`Grid.getCellAtPoint`](/docs/api/core/grid/#grid-get-cell-at-point) contracts
