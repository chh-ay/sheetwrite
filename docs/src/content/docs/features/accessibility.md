---
title: Accessibility
description: Understand the ARIA grid mirror, keyboard behavior, focus, and visible-window accessibility limits.
---

The grid paints to a `<canvas>`, which assistive technology can not read. To make
it navigable, Sheetwrite keeps a **screen-reader mirror**, also called the
SR-only mirror because only screen readers (SR) perceive it: a visually hidden
DOM copy of the visible window that carries the grid semantics. The canvas itself
is hidden from the accessibility tree.

```ts prelude="core" partial="requires the grid and host from Full setup" title="Focus a cell, then read the mirror"
grid.setSelection({ kind: "cell", addr: { sheet: "sheet1", row: 0, col: 0 } });

// The mirror updates with the next painted frame.
requestAnimationFrame(() => {
  const mirror = host.querySelector(".sheetwrite-aria");
  console.log(host.getAttribute("aria-activedescendant")); // "sheetwrite-grid-1-0-0"
  console.log(mirror?.querySelectorAll('[role="gridcell"]').length); // 4
});
```

| Element | role | ARIA attributes | Text |
| --- | --- | --- | --- |
| Host `#grid` | `group` | `aria-label="Spreadsheet grid"` `aria-activedescendant="sheetwrite-grid-1-0-0"` | |
| Canvas, scroller, overlay | | `aria-hidden="true"` | |
| Mirror `div.sheetwrite-aria#sheetwrite-grid-1` | `grid` | `aria-multiselectable="true"` `aria-rowcount="3"` `aria-colcount="2"` | |
| Header row | `row` | `aria-rowindex="1"` | |
| Header cells | `columnheader` | `aria-colindex="1"`, `"2"` | A, B |
| Data row 1 | `row` | `aria-rowindex="2"` | |
| `#sheetwrite-grid-1-0-0` | `gridcell` | `aria-colindex="1"` `aria-selected="true"` | Widget |
| `#sheetwrite-grid-1-0-1` | `gridcell` | `aria-colindex="2"` | 12 |
| Data row 2 | `row` | `aria-rowindex="3"` | |
| `#sheetwrite-grid-1-1-0`, `-1-1` | `gridcell` | `aria-colindex="1"`, `"2"` | Gadget, 7 |

Result: the hidden mirror for the first grid on the page, with A1 focused. The two data rows plus the column-letter header make `aria-rowcount` 3.

[Try it live → Spreadsheet showcase](/showcases/spreadsheet/). Open your browser's accessibility inspector on the grid to read its mirror while you move the selection.

<details>
<summary>Full setup</summary>

```ts compile title="A small grid with its ARIA mirror"
import { createGrid, initSheetwrite } from "@sheetwrite/core";
import "@sheetwrite/core/styles.css";

const host = document.querySelector<HTMLElement>("#grid");
if (host === null) throw new Error("Missing #grid host");
host.style.height = "240px";

await initSheetwrite();
const grid = createGrid(host, {
  workbook: {
    activeSheet: "sheet1",
    sheets: [{
      id: "sheet1", name: "Sheet1", rowCount: 2,
      columns: [
        { key: "product", header: "Product", type: "text", width: 140 },
        { key: "qty", header: "Qty", type: "number", width: 100 },
      ],
    }],
  },
  data: { rowCount: 2, columns: { product: ["Widget", "Gadget"], qty: [12, 7] } },
});

grid.setSelection({ kind: "cell", addr: { sheet: "sheet1", row: 0, col: 0 } });

// The mirror updates with the next painted frame.
requestAnimationFrame(() => {
  const mirror = host.querySelector(".sheetwrite-aria");
  console.log(host.getAttribute("aria-activedescendant")); // "sheetwrite-grid-1-0-0"
  console.log(mirror?.querySelectorAll('[role="gridcell"]').length); // 4
});
```

</details>

## The host

The host holds the grid's chrome as well as its cells: the toolbar or ribbon,
the sheet tabs, the find bar and the side panels. A `grid` may own only rows,
so the host is a labelled `group` that keeps the keyboard focus, and the mirror
inside it is the `grid`. `createGrid` annotates the host element:

| Attribute | Value |
| --- | --- |
| `role` | `"group"` |
| `aria-label` | `"Spreadsheet grid"` (default; not overwritten if you set your own) |
| `aria-activedescendant` | the id of the focused cell in the mirror; absent while the focused cell is outside the mirrored window |

The visual layers — the scroller, the overlay, and the `<canvas>` — are all marked
`aria-hidden="true"`, so screen readers ignore the pixels and read the mirror.

## Leaving the grid with the keyboard

Inside the grid, Tab and Shift + Tab move the active cell, as in Excel. Two
keys take the focus out of the grid, so the keyboard is never trapped:

- **F6 and Shift + F6** move to the next or previous part of the window, as
  Excel's F6 does. In the [spreadsheet shell](/docs/features/grid/toolbar-and-ribbon/)
  the parts are the ribbon or toolbar, the formula bar, the sheet, the sheet
  tabs and the status bar. A grid on its own moves to the page's next or
  previous control.
- **Escape, then Tab or Shift + Tab**, when no cell is being edited, moves to
  the page's next or previous control.

The host's `aria-description` says this once, when the focus enters the grid. A host that sets its own `aria-description` keeps it.

## The SR-only mirror

Alongside the host the grid appends a visually-hidden `<div class="sheetwrite-aria">`
with a unique id (`sheetwrite-grid-<n>`) and `role="grid"`. It carries the grid's attributes:

| Attribute | Value |
| --- | --- |
| `aria-multiselectable` | `"true"` |
| `aria-rowcount` | total rows **+ 1** (the column-letter header counts as a row) |
| `aria-colcount` | number of visible columns |
| `aria-readonly` | `"true"` when the grid is `readOnly` (omitted otherwise) |

It contains:

- A **header row** — `role="row"`, `aria-rowindex="1"` — whose cells are
  `role="columnheader"` with a 1-based `aria-colindex`. Spreadsheet presentation
  uses the positional column letter (`A`, `B`, …); data-grid presentation uses
  the semantic `Column.header`.
- One **data row** per visible row — `role="row"` with `aria-rowindex` set to the
  true row position (data row + 2, leaving index 1 for the header). Its cells are
  `role="gridcell"` with a 1-based `aria-colindex`, a stable id
  (`<gridId>-<row>-<col>`), and the cell's value as text.
- Every visible cell covered by the current cell/range/multi selection carries
  `aria-selected="true"`. A row selection marks its visible row; a column
  selection marks both its header and visible cells. The focused cell's id is
  mirrored into the host's `aria-activedescendant`.

Each paint writes the mirror and `aria-activedescendant` as its last step, after
it has read the scroll position and placed the cell editor, so the page never
lays out the mirror in the middle of a paint. The write happens in the same task
as the paint: in the frame that shows a scroll, a key or an edit, and before
`grid.refresh()` or `createGrid` returns.

Sketch of the emitted structure:

```html partial="illustrative output or schema" title="Illustrative excerpt"
<div role="group" aria-label="Spreadsheet grid"
     aria-activedescendant="sheetwrite-grid-1-0-0" tabindex="0">
  <!-- canvas / scroller / overlay, all aria-hidden -->
  <div class="sheetwrite-aria" id="sheetwrite-grid-1" role="grid"
       aria-multiselectable="true" aria-rowcount="100001" aria-colcount="5">
    <div role="row" aria-rowindex="1">
      <div role="columnheader" aria-colindex="1">A</div>
      <div role="columnheader" aria-colindex="2">B</div>
    </div>
    <div role="row" aria-rowindex="2">
      <div role="gridcell" aria-colindex="1" id="sheetwrite-grid-1-0-0"
           aria-selected="true">Widget</div>
      <div role="gridcell" aria-colindex="2" id="sheetwrite-grid-1-0-1">12</div>
    </div>
    <!-- … one row per visible row … -->
  </div>
</div>
```

As keyboard or pointer input changes the selection, `aria-selected` and the
host's `aria-activedescendant` update. Scrolling rebuilds the visible mirror.
Horizontal virtualization does not renumber the mirror: if the visible window
starts at sheet column G, its header and cells use `aria-colindex="7"`. Frozen
and scrolling columns likewise keep their absolute one-based sheet positions.
A focused cell note is connected through `aria-describedby` to hidden plain text.
Validation list and checkbox editors use real `listbox` / `option` and `checkbox`
semantics, with the rule help text as their accessible label.
Host-supplied editors receive a `context.label` composed from that same
semantic/positional header and row number. Core applies it to the retained editor
wrapper and to the first focusable control when the editor did not provide its
own name. Commit, cancel, reset, and unmount return focus to the grid; teardown
aborts the editor signal before removing its DOM.

Custom DOM renderer output uses the same mirror for its default cell value.
Non-semantic renderer elements are hidden from assistive technology to avoid a
duplicate announcement. A renderer can expose an explicitly interactive,
labelled control; its keyboard events remain with that control, its element is
retained across scroll and geometry updates, and focus returns to the grid if
virtualization or renderer replacement removes it.

## Limitation: the mirror reflects the visible window

The mirror contains **only the rows and columns currently rendered** (the same
virtualized window the canvas paints, plus overscan) — not the entire sheet. This
is deliberate: materializing 100k+ rows of DOM would defeat the point of canvas
rendering.

The consequences to be aware of:

- `aria-rowindex` / `aria-colindex` carry the **true** positions, so assistive
  technology can announce "row N of `aria-rowcount`" correctly even though only a
  window is present.
- A screen reader's own virtual cursor can only walk the cells in the rendered
  window. Use the grid's keyboard navigation (arrows, Page Up/Down, Home/End — see
  [Interaction](/docs/features/grid/selection-and-keyboard/#keyboard-navigation)) to move focus; that scrolls
  new rows into view and into the mirror, and updates `aria-activedescendant`.
