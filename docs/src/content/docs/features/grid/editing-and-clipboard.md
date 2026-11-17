---
title: Editing and clipboard
description: Edit cells inline, copy and paste with other spreadsheet apps, and undo or redo changes.
---

Users edit cells in place, copy and paste with Excel and Google Sheets, and undo or redo each change.

```ts prelude="core" partial="requires the grid from Full setup" title="Edit A1, then undo and redo"
grid.on("edit-commit", (e) => console.log("committed", e));
grid.beginEdit(0, 0, "42"); // open the editor on A1 with the text "42"
// The user presses Enter: A1 becomes 42 and the selection moves to A2.
// Later, after the commit:
grid.undo(); // A1 is 10 again
grid.redo(); // A1 is 42 again
```

<div class="sw-grid-result" data-selected="A2" data-caption="Result: after Enter commits the edit (or after redo), A1 is 42 and A2 is selected. This is a static illustration, not an editor.">

| 42 | 30 |
| --- | --- |
| 20 | 40 |

</div>

<details>
<summary>Full setup</summary>

```ts compile title="Edit a cell, then undo the edit"
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
grid.on("edit-commit", (e) => console.log("committed", e));
grid.beginEdit(0, 0, "42");
// The user presses Enter: the grid commits A1 and moves down.
// Run these later, after the user commits:
// grid.undo(); // A1 has its old value again
// grid.redo(); // A1 has the committed edit again
```

</details>

`beginEdit(row, col, initial?, selectAll?)` opens the editor at a view cell. Enter commits the edit and emits `edit-commit`. `undo()` and `redo()` step through the history.

[Try it live → Spreadsheet showcase](/showcases/spreadsheet/)

## Inline editing

Editing happens in a single real `<textarea>` on top of the active cell. The grid never recycles it across cells, so **IME composition and focus survive scrolling**. Composing CJK text or other input methods is safe. Begin editing by double-clicking, pressing F2, or just typing. F2 and double-click put the caret at the end of the text; Backspace clears the active cell and opens it.

As in Excel, typing opens the editor in **Enter mode** and F2 or double-click opens it in **Edit mode**. F2 switches between the two.

Commit and navigation keys:

| Key | Result |
| --- | --- |
| Enter / Shift + Enter | Commit, move **down** / **up**. Inside a selected range the active cell moves within the range. After a run of Tab entries, Enter goes to the next row in the column where the run started, so you can type a table row by row. Accepts an [AutoComplete](#autocomplete) completion. |
| Tab / Shift + Tab | Commit, move **right** / **left**, within a selected range. Accepts an AutoComplete completion. |
| Ctrl/Cmd + Enter | Commit and stay. With a range selected, write the entry into every selected cell; relative references shift. |
| Alt + Enter | Insert a line break. |
| Arrow keys | Enter mode: commit and move, or in a formula after an operator, point at a cell (Shift extends the reference). Edit mode: move the caret. |
| F4 | Cycle the reference at the caret through `A1`, `$A$1`, `A$1` and `$A1`. |
| Backspace / Delete | Delete a character, or the text AutoComplete added. |
| Escape | Cancel the edit. |
| Blur (click away) | Commit in place. A formula with a problem stays open (see below). |

While the IME is composing, keystrokes belong to the composition. The grid does not treat them as navigation. Editing emits `edit-begin` and `edit-commit` events.

### A formula with a problem

As in Excel, each of these keys checks a formula before it stores it ([How to avoid broken formulas](https://support.microsoft.com/en-us/excel/how-to-avoid-broken-formulas-in-excel)):

- When only closing parentheses are missing at the end, they are added: `=SUM(A1:A3` stores `=SUM(A1:A3)`.
- Any other syntax error stores nothing. A message says "There's a problem with this formula." and names the problem, for example "This ) has no matching (.". After OK the edit stays open with the problem selected, so you can fix it; Escape cancels the edit as usual. Enter in the formula bar does the same, and the bar keeps the focus.

An unknown function name is not a syntax error: `=SUMM(A1:A3)` is stored and the cell shows `#NAME?`, as in Excel.

### AutoComplete

As in Excel, typing a text entry completes it from the entries in the same column ([Automatically complete or not complete entries in cells](https://support.microsoft.com/en-us/office/turn-automatic-completion-of-cell-entries-on-or-off-0f4aa749-b927-4ff3-a8e0-28d6e2e4d4b4)). The grid reads the distinct text values of the filled cells directly above and below the edited cell, up to the first empty cell each way and at most 100,000 rows each way. The engine reads them once per edit, on the first typed character. When exactly one of them begins with what you typed, ignoring letter case, the editor shows the rest of it selected:

- Enter, Tab, Ctrl/Cmd + Enter, an arrow key in Enter mode or clicking away stores the completed entry, in the entry's own letter case.
- Backspace or Delete removes the added text; typing on replaces it and completes again.
- Nothing is completed when you type a formula, a number, a date or a logical value, or when no entry or more than one entry begins with the typed text. Numbers, dates and logical values in the column are never entries.
- During IME composition nothing is completed; the composed text is completed when the composition ends. Formula help, the function list after `=`, is separate: AutoComplete never acts on a formula.
- The code loads with the first edit, so the grid's first load does not carry it; the edit a key opened is completed as soon as it arrives.

Excel turns AutoComplete off with **Enable AutoComplete for cell values**. In Sheetwrite the host sets `config: { autoComplete: false }`; `setConfig` turns it on or off for the next edit.

### Event order

`beginEdit` closes the previous editor. It selects the requested cell, or keeps the selection when the cell is inside it and makes the cell active. It emits `selection` when that changes the selection, then emits `edit-begin` before it opens the editor. A synchronous handler can replace or cancel the request without the old editor reopening.

Successful completion emits `change`, then `edit-commit`, then the navigation's `selection` event. Rejected completion does not emit `edit-commit` or navigate. Event addresses remain view coordinates.

### Formula bar

During an edit the cell editor and the shell's formula bar ([`createFormulaBar`](/docs/api/core-shell/create-formula-bar/)) share one draft, as in Excel. Every keystroke, paste, IME step, undo or picked reference in the cell editor shows in the bar, and typing in the bar shows in the cell, which opens its editor without taking focus. Escape in either cancels the edit and both show the stored value again; Enter in either commits. Moving focus between the two keeps the edit open.

To supply your own editor, see [Host-supplied editors](/docs/features/grid/custom-editors/).

## Clipboard interoperability

Copy and cut always produce injection-hardened TSV. Where the browser exposes `ClipboardItem`, they also write sanitized `text/html` and Sheetwrite's private `application/x-sheetwrite+json` payload. The private payload keeps formula source and cell styles for same-app round trips. The HTML contains only escaped table markup, plain cell text, safe `data-sheetwrite-formula` attributes, and a bounded style subset. No pasted HTML goes into the document.

Paste prefers the private Sheetwrite payload, then sanitized HTML tables, then plain TSV:

- HTML parsing uses an inert `DOMParser` document. It accepts only cell text, safe formula attributes, and supported inline styles.
- External formulas that contain control characters become text.
- TSV handles quoted, multi-line fields, the same as Excel and Google Sheets.
- External text that begins with `=`, `+`, `-`, `@`, tab, or CR gets a single-quote prefix, so it cannot become an executable formula.

`paste()` keeps supported formula and style data. `pasteValues()` writes resolved literals and drops formulas and styles on purpose.

Paste lands on the top-left cell of the selection. When the selection is a whole multiple of the copied block, the block repeats to fill it and each copy's relative references shift to its own place, as in Excel. A paste of cells copied in the same grid also brings their notes and conditional formats, which replace the target cells' own, as Excel's Paste does.

### Paste Special

Ctrl/Cmd + Alt + V (Ctrl + Cmd + V on a Mac, as in Excel for Mac), Home › Paste › Paste Special… and the context menu open Excel's Paste Special dialog ([Paste options](https://support.microsoft.com/en-us/excel/paste-options)). Each choice has its letter key, as in Excel: press the underlined letter, alone or with Alt.

| Paste | What lands on the target cells |
| --- | --- |
| All (A) | Everything, as Paste does. |
| Formulas (F) | Formulas and constants; the target cells keep their formats. |
| Values (V) | The copied cells' values; the target cells keep their formats. |
| Formats (T) | Formats and conditional formats; the target cells keep their values. |
| Comments and Notes (C) | Only the notes. |
| Validation (N) | Only the data validation rules. |
| All using Source theme (H) | Everything, as All: a workbook has one theme. |
| All except borders (X) | Everything; the target cells keep their borders. |
| Column widths (W) | Only the copied columns' widths. |
| Formulas and number formats (R) | Formulas and constants with their number formats. |
| Values and number formats (U) | Values with their number formats. |
| All merging conditional formats (G) | Everything; the target cells' conditional formats stay beside the copied ones. |

**Operation** (None O, Add D, Subtract S, Multiply M, Divide I) combines each copied number with the target cell's: two numbers give the result, and a formula on either side gives a formula, such as `=(5)+20`. A blank counts as 0, text that reads as a number counts as that number, and a cell with other text is left as it is. **Skip blanks** (B) leaves a target cell as it is where the copied cell is blank. **Transpose** (E) pastes rows as columns; each formula's relative references shift by the move of its own cell. **Paste Link** (L) writes formulas that refer to the copied cells instead of their contents: `=$A$1` for one cell, `=A1` and so on for more, with the sheet's name from another sheet (`=Data!A1`).

Home › Paste and the context menu's Paste Options row also offer the common choices in one click: Paste, Values, Formulas, Formatting, Transpose and Paste Link.

From code, `grid.actions.pasteSpecial(options)` pastes without the dialog, with the names of Excel's `Range.PasteSpecial`:

```ts prelude="core" partial="requires surrounding host state" title="Add the copied numbers to the selected cells"
await grid.actions.pasteSpecial({ paste: "values", operation: "add" });
await grid.actions.pasteSpecial({ transpose: true, skipBlanks: true });
await grid.actions.pasteSpecial({ ask: true }); // the dialog chooses, as Ctrl+Alt+V
```

Cells copied from another application or another grid paste their values and formats: the dialog shows Comments and Notes, Validation, Column widths and Paste Link disabled, as their notes, rules and widths are unknown. The code of Paste Special and its dialog loads the first time it is used, while the clipboard is read. As in Excel, Paste Special is not available while a cut waits for its paste; it resolves `"empty"`. Each paste is one undo step and reaches collaborators as one change.

### Cut and paste moves cells

Cut and paste works as in Excel ([Move or copy cells and cell contents](https://support.microsoft.com/en-us/office/move-or-copy-cells-and-cell-contents-803d65eb-6a3e-4534-8c6f-ff12d1c4139e)):

- Cut changes nothing. It writes the cells to the system clipboard and marks them with a moving dashed border (still dashes when the user asks for reduced motion).
- Paste moves the cells to the top-left cell of the selection, on this sheet or another one: values, formulas, formats, notes, hyperlinks and merged cells. The cells it leaves are emptied, and the cells it lands on are replaced.
- Validation and conditional-format rules whose range lies inside the cut cells move with them. A conditional-format formula follows the moved cells as a moved formula does. A rule whose whole range the paste lands on goes; a rule the paste covers only in part keeps its range.
- Every formula, defined name and chart that refers to a moved cell now refers to its new place. A reference to a cell that the paste replaced becomes `#REF!`.
- A formula inside the moved block keeps pointing at the same cells: its relative references do not shift as they do after a copy.
- A range that the block covers only in part changes only when the block holds a whole edge of it and moves along it, as in Excel: with `=SUM(A1:A10)`, moving A10 to A15 gives `=SUM(A1:A15)`.
- The move is one `moveCells` operation, so it is one undo step and reaches collaborators as one change.

The cut ends without a move when the user presses Esc, starts an edit, makes any other change, copies or cuts again, or when a change moves rows or cells on its sheet. A cut that was pasted or ended does not paste again; `paste()` resolves `"empty"`. When the clipboard holds something else by the time of the paste, for example text copied in another app, the paste is a plain paste and the cut ends. Pasting the cut in another app gives its values and leaves the cells in place.

As in Excel, where Paste Special is not available after a cut, `pasteValues()` and `pasteSpecial()` do nothing while a cut waits; they resolve `"empty"` and the cut stays. A move that would cut through a merged cell, a table, a pivot table or a spill range changes nothing, and so does a paste whose rows a sorted view splits.

### Report the clipboard outcome

`grid.actions.copy/cut/paste/pasteValues/pasteSpecial` return `Promise<ClipboardOutcome>` and never reject:

```ts prelude="core" partial="requires surrounding host state" title="Tell the user when paste is blocked"
const outcome = await grid.actions.paste();
if (outcome === "blocked") console.warn("Allow clipboard access to paste.");
```

| Outcome | Meaning |
| --- | --- |
| `"done"` | The action completed. |
| `"unsupported"` | The Clipboard API, or the method it needs, is missing. Examples: a non-secure context, or Firefox `readText`. |
| `"blocked"` | The browser rejected the request, usually because of a permissions policy or missing user activation. |
| `"empty"` | There is nothing to act on: no focused selection, an empty clipboard, or paste on a read-only grid. |

Custom UI can show the outcome without tripping global error monitoring.

## Undo and redo

`grid.undo()` and `grid.redo()` (and Ctrl/Cmd + Z, Ctrl/Cmd + Shift + Z) step through the recorded transactions. As in Excel, each step selects the cells it changes on the active sheet and scrolls to them; undoing a row, column or object edit keeps the selection. Remote operations from a `SyncCoordinator` do not create undo entries.

History keeps at most 200 entries and 256 MiB of retained range snapshots, about twenty million-cell clears. When it passes either limit, it drops its oldest entries. The newest entry always stays undoable. The 256 MiB limit counts the snapshot bytes that the engine reports. It is not a limit on total process memory: it excludes cloned formula ASTs and JavaScript patch and redo payloads, which only the 200-entry limit bounds.

### Undo a large clear

Undo of a large clear restores every old cell. The grid restores the saved range directly from its packed engine snapshot. When the restore is larger than one transaction allows, the Grid sends one compressed `restoreBlock` operation. If that still needs more than one server version, it uses an atomic batch, which needs `PersistenceAdapter.commitBatch`. See [Large undo and atomic batches](/docs/features/collaboration/#large-undo-and-atomic-batches).

If the restore is above the batch ceilings, cannot be split, or needs a `commitBatch` that the adapter does not have, `grid.undo()` changes nothing. The Grid emits `mutation-rejected` with a `resource-limit` issue and removes that entry from the history, so older edits can still be undone. Show the reason to the user:

```ts prelude="core" partial="requires surrounding host state" title="Report an undo that is too large"
grid.on("mutation-rejected", ({ issues }) => {
  for (const issue of issues) {
    if (issue.kind === "resource-limit") {
      console.warn(`Not undone: ${issue.resource} ${issue.actual} is above ${issue.max}.`);
    }
  }
});
```

## Options

| Option or method | Effect |
| --- | --- |
| `readOnly: true` | Turns off every mutating interaction: editing, clearing, fill, paste, and restyling. Navigation and selection still work. |
| `config.keyboard.bindings` | Rebinds `copy`, `cut`, `paste`, `pasteValues`, `pasteSpecial`, `undo` and `redo`. See [Rebind an action](/docs/features/grid/selection-and-keyboard/#rebind-an-action). |
| `grid.beginEdit(row, col, initial?, selectAll?)` | Opens the editor at a view cell, optionally with seed text or with all text selected. |
| `grid.actions.paste()` / `pasteValues()` | Paste with formulas and styles, or values only. |
| `grid.actions.pasteSpecial(options?)` | Excel's Paste Special: `paste`, `operation`, `skipBlanks`, `transpose`, `link`, or `ask` for the dialog. |
| `grid.undo()` / `grid.redo()` | Step back or forward one transaction. |

## Edge cases and limits

- Stock, validation, and custom editors keep the underlying document cell while sorting or filtering changes its visible position. Completion writes that same cell, not the row that now occupies the old position.
- If the edited cell leaves the view, or the sheet structure changes, the grid cancels the editor.
- Paste does nothing when `readOnly` is on; it resolves `"empty"`.
- Cut on a read-only grid copies: nothing is marked or moved.
- An undo that is too large to send changes nothing and leaves the history; see [Undo a large clear](#undo-a-large-clear).

## See also

- [Selection and keyboard](/docs/features/grid/selection-and-keyboard/)
- [Validation, protection and notes](/docs/features/data/validation-protection-and-notes/): rules that every edit passes through, and how a paste lands the copied cells' rules
- [Collaboration](/docs/features/collaboration/)
- [`GridActions` API](/docs/api/core/grid-actions/)
