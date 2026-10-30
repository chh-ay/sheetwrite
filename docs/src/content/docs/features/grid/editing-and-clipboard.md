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

Editing happens in a single real `<textarea>` on top of the active cell. The grid never recycles it across cells, so **IME composition and focus survive scrolling**. Composing CJK text or other input methods is safe. Begin editing by double-clicking, pressing Enter or F2, or just typing.

Commit and navigation keys:

| Key | Result |
| --- | --- |
| Enter | Commit, move **down**. |
| Tab | Commit, move **right**. |
| Shift + Tab | Commit, move **left**. |
| Shift + Enter | Insert a newline (does not commit). |
| Escape | Cancel the edit. |
| Blur (click away) | Commit in place. |

While the IME is composing, keystrokes belong to the composition. The grid does not treat them as navigation. Editing emits `edit-begin` and `edit-commit` events.

### Event order

`beginEdit` closes the previous editor and selects the requested cell. It emits `selection` when that changes the selection, then emits `edit-begin` before it opens the editor. A synchronous handler can replace or cancel the request without the old editor reopening.

Successful completion emits `change`, then `edit-commit`, then the navigation's `selection` event. Rejected completion does not emit `edit-commit` or navigate. Event addresses remain view coordinates.

To supply your own editor, see [Host-supplied editors](/docs/features/grid/custom-editors/).

## Clipboard interoperability

Copy and cut always produce injection-hardened TSV. Where the browser exposes `ClipboardItem`, they also write sanitized `text/html` and Sheetwrite's private `application/x-sheetwrite+json` payload. The private payload keeps formula source and cell styles for same-app round trips. The HTML contains only escaped table markup, plain cell text, safe `data-sheetwrite-formula` attributes, and a bounded style subset. No pasted HTML goes into the document.

Paste prefers the private Sheetwrite payload, then sanitized HTML tables, then plain TSV:

- HTML parsing uses an inert `DOMParser` document. It accepts only cell text, safe formula attributes, and supported inline styles.
- External formulas that contain control characters become text.
- TSV handles quoted, multi-line fields, the same as Excel and Google Sheets.
- External text that begins with `=`, `+`, `-`, `@`, tab, or CR gets a single-quote prefix, so it cannot become an executable formula.

`paste()` keeps supported formula and style data. `pasteValues()` writes resolved literals and drops formulas and styles on purpose. Cut clears its source only after the system clipboard accepts the payload.

### Report the clipboard outcome

`grid.actions.copy/cut/paste/pasteValues` return `Promise<ClipboardOutcome>` and never reject:

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

`grid.undo()` and `grid.redo()` (and Ctrl/Cmd + Z, Ctrl/Cmd + Shift + Z) step through the recorded transactions. Remote operations from a `SyncCoordinator` do not create undo entries.

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
| `config.keyboard.bindings` | Rebinds `copy`, `cut`, `paste`, `pasteValues`, `undo` and `redo`. See [Rebind an action](/docs/features/grid/selection-and-keyboard/#rebind-an-action). |
| `grid.beginEdit(row, col, initial?, selectAll?)` | Opens the editor at a view cell, optionally with seed text or with all text selected. |
| `grid.actions.paste()` / `pasteValues()` | Paste with formulas and styles, or values only. |
| `grid.undo()` / `grid.redo()` | Step back or forward one transaction. |

## Edge cases and limits

- Stock, validation, and custom editors keep the underlying document cell while sorting or filtering changes its visible position. Completion writes that same cell, not the row that now occupies the old position.
- If the edited cell leaves the view, or the sheet structure changes, the grid cancels the editor.
- Paste does nothing when `readOnly` is on; it resolves `"empty"`.
- An undo that is too large to send changes nothing and leaves the history; see [Undo a large clear](#undo-a-large-clear).

## See also

- [Selection and keyboard](/docs/features/grid/selection-and-keyboard/)
- [Validation, protection and notes](/docs/features/data/validation-protection-and-notes/): rules that every edit and paste passes through
- [Collaboration](/docs/features/collaboration/)
- [`GridActions` API](/docs/api/core/grid-actions/)
