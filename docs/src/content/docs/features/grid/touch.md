---
title: Touch
description: How the grid handles taps and drags from touch, pen, and mouse input.
---

The grid reads all input through Pointer Events, so mouse, touch, and pen share one code path, and a plain drag on touch scrolls the page natively.

```ts prelude="core" partial="requires the grid from Full setup" title="Follow taps and double-taps"
grid.on("selection", (e) => console.log("tap selected", e.selection));
grid.on("edit-begin", (e) => console.log("double-tap edits", e));
// On a touch screen, tap A1 to select it; double-tap to edit.
```

<div class="sw-grid-result" data-selected="A1" data-caption="Result: tapping A1 selects its value, 10, and logs tap selected. This static figure does not accept taps or drags.">

| 10 | 30 |
| --- | --- |
| 20 | 40 |

</div>

<details>
<summary>Full setup</summary>

```ts compile title="Follow taps and double-taps"
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
grid.on("selection", (e) => console.log("tap selected", e.selection));
grid.on("edit-begin", (e) => console.log("double-tap edits", e));
```

</details>

On a touch screen, a tap on a cell logs `tap selected`. A double-tap on a cell logs `double-tap edits`. A drag across plain cells logs nothing, because it scrolls.

## Touch gestures

For `pointerType: "touch"` the policy is:

| Gesture | Behavior |
| --- | --- |
| Tap on a cell | Select the cell (same as a click). |
| Tap on a column header | Select the column. |
| Drag starting on a plain cell | **Native scroll**. The grid neither captures the pointer nor calls `preventDefault`. |
| Drag starting on the fill handle | Drag-to-fill (pointer captured). |
| Drag starting on a row/column resize boundary | Resize (pointer captured). |
| Drag starting on the border of a multi-cell selection (±6px band) | Extend the selection (pointer captured). |
| Double-tap on a cell | Begin editing (the browser's synthesized `dblclick`). |

## Mouse and pen

Mouse and pen behave classically: any drag from a cell extends the selection, and hovering a resize boundary shows the resize cursor.

## Options

Touch has no options of its own. The gestures above follow the same settings as the mouse: for example, `readOnly: true` turns off drag-to-fill, and an active sort or filter view hides the fill handle.

## Edge cases and limits

- A `pointercancel` (for example, when the browser reclaims the gesture) abandons the drag without committing.
- The scroller sets `touch-action: pan-x pan-y`. This keeps native panning, but disables double-tap zoom so that captured drags keep receiving `pointermove`.
- Long-press to open the context menu on touch is deferred. When it is added, it must cancel on move to respect the native-scroll rule.

## See also

- [Selection and keyboard](/docs/features/grid/selection-and-keyboard/#selection-model)
- [Resize, merge and fill](/docs/features/grid/resize-merge-and-fill/)
- [Accessibility](/docs/features/accessibility/)
