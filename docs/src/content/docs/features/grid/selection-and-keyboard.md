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
  | { kind: "range"; range: Range; active?: CellAddress }
  | { kind: "row"; sheet: SheetId; row: number; active?: CellAddress }
  | { kind: "column"; sheet: SheetId; col: number; active?: CellAddress }
  | { kind: "multi"; ranges: Range[]; active?: CellAddress };
```

How the primary mouse button makes a selection:

| Gesture | Result |
| --- | --- |
| Click a cell | Select that cell. |
| Drag across cells | Extend to a **range**. The cell where the drag started stays active. |
| Shift-click | Extend the range from the current anchor. |
| Ctrl/Cmd-click | Add a region. This makes a **multi** selection. |
| Click a column letter (top header) | Select that **column** (Shift extends; Ctrl/Cmd adds; a drag across letters extends). |
| Click a row number (left header) | Select that **row** (Shift extends; Ctrl/Cmd adds; a drag across numbers extends). |

For touch gestures, see [Touch](/docs/features/grid/touch/).

## Keyboard navigation

When the grid has focus and is not editing, the keys follow Excel's defaults. The **active cell** is where typing edits; extending a selection keeps it, and `getSelection()` reports it as `active` when it is not the range's first cell.

| Key | Action |
| --- | --- |
| Arrow keys | Move the active cell one cell. |
| Ctrl/Cmd + Arrow | Jump to the edge of the data region, or to the sheet edge. |
| End, then an arrow key | Jump like Ctrl/Cmd + Arrow (End mode). |
| Page Up / Page Down | Move by a viewport of rows. |
| Home | Move to the first column of the row. |
| Ctrl/Cmd + Home | Move to A1. |
| Ctrl/Cmd + End | Move to the last used cell: the lowest used row of the rightmost used column. |
| Shift + any of the above | Extend the selection from its moving corner; the active cell stays. |
| Enter / Shift + Enter | Move the active cell down / up. Inside a selected range it moves within the range. |
| Tab / Shift + Tab | Move the active cell right / left, within a selected range. |
| Ctrl/Cmd + Space / Shift + Space | Select the active cell's column / row. |
| Ctrl/Cmd + A | Select the current region around the active cell; press again for the whole sheet. |
| F2 | Edit the active cell, with the caret at the end. |
| Alt + Down | Open the filter dropdown of an AutoFilter header cell, or the list of a cell with a list validation rule. |
| Delete | Clear the selected cells. |
| Backspace | Clear the active cell and start editing it; Escape restores it. |
| A printable character | Start editing the active cell, replacing its content. A text entry may be completed from the column ([AutoComplete](/docs/features/grid/editing-and-clipboard/#autocomplete)). |
| Ctrl/Cmd + C / X / V | Copy / cut / paste. |
| Ctrl/Cmd + Z | Undo the last edit. |
| Ctrl/Cmd + Shift + Z (or Ctrl/Cmd + Y) | Redo. |
| Ctrl/Cmd + F | Open the find bar (when `config.find` is not `false`). |
| Ctrl/Cmd + Shift + L | Turn the AutoFilter on for the current range, or off. |
| Ctrl/Cmd + 1 | Open Format Cells: Number, Alignment, Font, Border and Fill. |
| Ctrl/Cmd + Shift + ~ | Apply the General number format. |
| Ctrl/Cmd + Shift + ! | Apply the Number format, `#,##0.00`. |
| Ctrl/Cmd + Shift + @ | Apply the Time format, `h:mm AM/PM`. |
| Ctrl/Cmd + Shift + # | Apply the Date format, `d-mmm-yy`. |
| Ctrl/Cmd + Shift + $ | Apply the Currency format, `$#,##0.00_);($#,##0.00)`. |
| Ctrl/Cmd + Shift + % | Apply the Percentage format, `0%`. |
| Ctrl/Cmd + Shift + ^ | Apply the Scientific format, `0.00E+00`. |
| Ctrl/Cmd + 9 / Ctrl/Cmd + Shift + 9 | Hide the selected rows / show the hidden rows inside the selection. |
| Ctrl/Cmd + 0 / Ctrl/Cmd + Shift + 0 | Hide the selected columns / show the hidden columns inside the selection. |
| Ctrl/Cmd + + (Ctrl/Cmd + Shift + = or the keypad +) / Ctrl/Cmd + - | Insert / delete. Whole selected rows or columns are inserted above or left, or deleted, at once; for any other range a dialog asks for entire rows or entire columns. |

The keys inside the inline editor are on [Editing and clipboard](/docs/features/grid/editing-and-clipboard/#inline-editing).

In a dialog the grid opens, such as the merge warning, Tab and Shift + Tab move between its controls and stay inside it, Enter chooses OK, and Escape cancels. The grid has focus again when the dialog closes.

## Rebind an action

Use `config.keyboard.bindings` to replace the keys for one action. Omitted actions keep their defaults. Use `null` to remove an action's keys, or an array for multiple bindings. These bindings apply when the grid has focus and is not editing.

To let users change the keys themselves, turn on the [Keyboard shortcuts panel](/docs/features/grid/keyboard-shortcuts/) and store the bindings it emits.

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

The actions you can rebind are `copy`, `cut`, `paste`, `pasteValues`, `undo`, `redo`, `find`, `replace`, `clearContents`, `editNote`, `bold` (Ctrl/Cmd + B or 2), `italic` (Ctrl/Cmd + I or 3), `underline` (Ctrl/Cmd + U or 4), `strikethrough` (Ctrl/Cmd + 5), `insertDate` (Ctrl/Cmd + ;), `insertTime` (Ctrl/Cmd + Shift + ;), `selectAll` (Ctrl/Cmd + A), `fillDown` (Ctrl/Cmd + D), `fillRight` (Ctrl/Cmd + R), `toggleFilter` (Ctrl/Cmd + Shift + L), `formatCells` (Ctrl/Cmd + 1), `formatGeneral`, `formatNumber`, `formatTime`, `formatDate`, `formatCurrency`, `formatPercent` and `formatScientific` (Ctrl/Cmd + Shift + ~, 1 to 6), `hideRows` and `unhideRows` (Ctrl/Cmd + 9, with Shift), `hideColumns` and `unhideColumns` (Ctrl/Cmd + 0, with Shift), `insertCells` (Ctrl/Cmd + Shift + = or Ctrl/Cmd and the keypad +) and `deleteCells` (Ctrl/Cmd + -). See [KeyboardOptions](/docs/api/core/keyboard-options/) and [KeyShortcut](/docs/api/core/key-shortcut/).

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
