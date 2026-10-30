---
title: Selection and keyboard
description: Read and set the selection, navigate with the keyboard, and rebind or add shortcuts.
---

The grid selects cells with the mouse, the keyboard, or code, and runs Sheets-style keyboard shortcuts when it has focus.

```ts prelude="core" partial="requires the grid from Full setup" title="Select A1 and follow the selection"
grid.on("selection", (e) => console.log(e.selection));
grid.setSelection({ kind: "cell", addr: { sheet: "sheet1", row: 0, col: 0 } });
console.log(grid.getSelection()); // { kind: "cell", addr: { sheet: "sheet1", row: 0, col: 0 } }
```

<div class="sw-grid-result" data-selected="A1" data-caption="Result: A1 is selected, outlined as the active cell.">

| 10 | 30 |
| --- | --- |
| 20 | 40 |

</div>

<details>
<summary>Full setup</summary>

```ts compile title="Select a cell and follow the selection"
import { createGrid, initSheetwrite, type ColumnarData, type Workbook } from "@sheetwrite/core";
import "@sheetwrite/core/styles.css";

const host = document.querySelector<HTMLElement>("#grid");
if (host === null) throw new Error("Missing #grid host");
host.style.height = "320px";

const workbook: Workbook = {
  activeSheet: "sheet1",
  sheets: [{
    id: "sheet1",
    name: "Sheet1",
    rowCount: 2,
    columns: [
      { key: "a", header: "A", type: "number", width: 120 },
      { key: "b", header: "B", type: "number", width: 120 },
    ],
  }],
};
const data: ColumnarData = {
  rowCount: 2,
  columns: { a: new Float64Array([10, 20]), b: new Float64Array([30, 40]) },
};

await initSheetwrite();
const grid = createGrid(host, { workbook, data });
grid.on("selection", (e) => console.log(e.selection));
grid.setSelection({ kind: "cell", addr: { sheet: "sheet1", row: 0, col: 0 } });
console.log(grid.getSelection()); // { kind: "cell", addr: { sheet: "sheet1", row: 0, col: 0 } }

// Later, clear the selection:
grid.setSelection(null);
```

</details>

The `selection` listener runs for each change. `getSelection()` returns the current selection, or `null` when nothing is selected. Call `grid.setSelection(null)` to clear it.

The grid makes its host element focusable (`tabindex="0"`) so that it receives keyboard events.

[Try it live → Spreadsheet showcase](/showcases/spreadsheet/)

## Selection model

A `Selection` is one of five shapes:

```ts prelude="core" partial="type shape only" title="Selection shapes"
type Selection =
  | { kind: "cell"; addr: CellAddress }
  | { kind: "range"; range: Range }
  | { kind: "row"; sheet: SheetId; row: number }
  | { kind: "column"; sheet: SheetId; col: number }
  | { kind: "multi"; ranges: Range[] };
```

How the primary mouse button makes a selection:

| Gesture | Result |
| --- | --- |
| Click a cell | Select that cell. |
| Drag across cells | Extend to a **range**. |
| Shift-click | Extend the range from the current anchor. |
| Ctrl/Cmd-click | Add a region. This makes a **multi** selection. |
| Click a column letter (top header) | Select that **column** (Shift extends; Ctrl/Cmd adds). |

Row and full-column selections are part of the model. The top header selects columns. **Row selection is programmatic only**: there is no row-header click gesture. Set it with `setSelection({ kind: "row", sheet, row })`.

For touch gestures, see [Touch](/docs/features/grid/touch/).

## Keyboard navigation

When the grid has focus and is not editing:

| Key | Action |
| --- | --- |
| Arrow keys | Move the focus one cell. |
| Ctrl/Cmd + Arrow | Jump to the first/last row or column. |
| Page Up / Page Down | Move by a viewport of rows. |
| Home / End | Move to the first / last column of the row. |
| Ctrl/Cmd + Home / End | Move to the sheet's first / last cell. |
| Shift + any of the above | Extend the selection instead of moving. |
| Enter or F2 | Edit the focused cell (F2 selects the existing text). |
| Delete / Backspace | Clear the selected cells. |
| A printable character | Start editing, replacing the cell's content. |
| Ctrl/Cmd + C / X / V | Copy / cut / paste. |
| Ctrl/Cmd + Z | Undo the last edit. |
| Ctrl/Cmd + Shift + Z (or Ctrl/Cmd + Y) | Redo. |
| Ctrl/Cmd + F | Open the find bar (when `config.find` is not `false`). |

The keys inside the inline editor are on [Editing and clipboard](/docs/features/grid/editing-and-clipboard/#inline-editing).

## Rebind an action

Use `config.keyboard.bindings` to replace the keys for one action. Omitted actions keep their defaults. Use `null` to remove an action's keys, or an array for multiple bindings. These bindings apply when the grid has focus and is not editing.

```ts prelude="core" partial="requires surrounding host state" title="Rebind copy and keep its menu label in sync"
grid.setConfig({
  keyboard: {
    bindings: {
      copy: "Mod+Shift+C",
      find: { key: "f", mod: true },
      replace: null,
    },
  },
  contextMenu: [
    { action: "copy", label: "Copy value", shortcut: "copy" },
  ],
});
```

The Copy label is `⌘⇧C` on macOS and `Ctrl+Shift+C` elsewhere. Its original Mod+C binding no longer runs Copy. Menu actions use their bound shortcut by default; `shortcut: "copy"` lets a custom item use the same label. Built-in toolbar titles and `grid.getShortcutLabel("copy")` use the same keymap.

### Write a key combination

Write a key combination as a string or as an object:

- A string lists modifiers and then one key: `"Mod+Shift+K"`, `"Ctrl+Alt+Delete"`. The modifiers are `Mod`, `Ctrl`, `Meta`, `Alt` and `Shift`, in any order.
- An object names the key and its modifiers: `{ key: "k", mod: true, shift: true }`. Use the object form for a key without modifiers, for example `{ key: "F2" }`.

`Mod` shows as Command on macOS and as Control on other systems. It accepts either key, so the same shortcut works with a Mac keyboard and a PC keyboard. `Ctrl` and `Meta` are always exactly the Control and Command (or Windows) keys, so `"Ctrl+J"` is Control+J on a Mac too. Shift and Alt must match exactly.

Name the key as printed without Shift: `"Mod+Shift+1"` and `"Mod+Shift+/"` run when the user presses Shift with the 1 or / key, although the browser reports `!` and `?` for those presses. Letters and digits keep their meaning on other keyboard layouts.

## Add a shortcut for your own command

Give a context-menu item a `shortcut` and an `onClick`. The grid then runs `onClick` when the grid has focus and the user presses that combination, with the focused cell as the cell argument. A combination with `Mod`, `Ctrl` or `Meta` also works while the inline editor is open. A hidden or disabled item does not run.

```ts prelude="core" partial="requires surrounding host state" title="A custom command with its own shortcut"
grid.setConfig({
  contextMenu: [
    {
      id: "open-record",
      label: "Open record",
      shortcut: "Mod+Shift+O",
      onClick: (_grid, cell) => {
        if (cell) console.log("open record for row", cell.row);
      },
    },
  ],
});
```

Pressing Mod+Shift+O logs the focused cell's row.

## Options

| `config.keyboard` value | Effect |
| --- | --- |
| `true` (default) | The stock bindings in the table above. |
| `{ bindings }` | Replace the keys of the named actions. Omitted actions keep their defaults; `null` removes an action's keys. |
| `false` | Turn off all built-in keys. The host handles every key. |
| `(e, grid) => boolean` | Intercept each keydown before the defaults. Return `true` to consume the key, or `false` to let the built-in handler continue. |

The actions you can rebind are `copy`, `cut`, `paste`, `pasteValues`, `undo`, `redo`, `find`, `replace` and `clearContents`. See [KeyboardOptions](/docs/api/core/keyboard-options/) and [KeyShortcut](/docs/api/core/key-shortcut/).

## Edge cases and limits

- Only the pointer that began a drag can change it. Switching sheets, changing sheet structure or the sorted/filtered view, or losing pointer capture ends the gesture. A later pointer release cannot apply it to a different sheet or view.
- If two commands use the same combination, `createGrid` and `setConfig` throw a `SheetwriteError` with code `shortcut-conflict`, and `setConfig` keeps the previous configuration.
- A malformed combination throws code `invalid-shortcut`.
- `readOnly: true` keeps navigation and selection, but turns off the keys that change cells.

## See also

- [Editing and clipboard](/docs/features/grid/editing-and-clipboard/)
- [Resize, merge and fill](/docs/features/grid/resize-merge-and-fill/)
- [Status bar](/docs/features/grid/status-bar/): totals for the selected cells
- [Context menu](/docs/features/grid/context-menu/)
- [`Grid` API](/docs/api/core/grid/)
