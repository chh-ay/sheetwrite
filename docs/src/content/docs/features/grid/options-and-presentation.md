---
title: Grid options and presentation
description: Configure a grid with GridOptions and choose spreadsheet or data-grid headers.
---

Everything you pass to `createGrid(host, opts)` is a `GridOptions` field.

```ts prelude="core" partial="requires the host, People workbook and data in Full setup" title="Use semantic headers"
const grid = createGrid(host, {
  workbook,
  data,
  presentation: "data-grid",
  overscan: 4,
});
```

<div class="sw-grid-result" data-caption="Result: Ada and Grace are the first two data rows. The live data-grid header band reads Customer name and Account status instead of A and B.">

| Ada | Active |
| --- | --- |
| Grace | Paused |

</div>

<details>
<summary>Full setup</summary>

```ts compile title="A data grid with semantic headers"
import {
  createGrid,
  initSheetwrite,
  type ColumnarData,
  type Workbook,
} from "@sheetwrite/core";
import "@sheetwrite/core/styles.css";

const host = document.querySelector<HTMLElement>("#grid");
if (host === null) throw new Error("Missing #grid host");
host.style.height = "320px";

const workbook: Workbook = {
  activeSheet: "people",
  sheets: [
    {
      id: "people",
      name: "People",
      rowCount: 2,
      columns: [
        { key: "name", header: "Customer name", width: 220, type: "text" },
        { key: "status", header: "Account status", width: 160, type: "text" },
      ],
    },
  ],
};
const data: ColumnarData = {
  rowCount: 2,
  columns: { name: ["Ada", "Grace"], status: ["Active", "Paused"] },
};

await initSheetwrite();
const grid = createGrid(host, { workbook, data, presentation: "data-grid", overscan: 4 });
console.log(grid.store.getCell({ sheet: "people", row: 0, col: 0 }).resolved); // "Ada"
```

</details>

The header band shows "Customer name" and "Account status" instead of `A` and `B`. Row 0 still holds the first data row.

## GridOptions

```ts prelude="core" partial="requires surrounding host state" title="createGrid signature"
type CreateGrid = (host: HTMLElement, opts: GridOptions) => Grid;
```

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `workbook` | `Workbook` | — (required) | Sheets, columns, row counts, and the `activeSheet` id. |
| `presentation` | `"spreadsheet" \| "data-grid"` | `"spreadsheet"` | Positional A/B/C headers or semantic `Column.header` labels. Addressing and data rows are unchanged. |
| `data` | `ColumnarData` | `undefined` | Eager, in-memory, column-major values. Pass this **or** `datasource`. |
| `datasource` | `DataSource` | `undefined` | Lazy, paged async source; rows fetched per visible window. See [Datasources](/docs/features/data/datasources/). |
| `datasourceStorage` | `DataSourceStorageOptions` | `{ mode: "dense" }` | Use `{ mode: "paged", chunkRows?, cacheBytes? }` for allocation-lazy datasource storage. |
| `renderer` | `"canvas" \| "worker"` | `"canvas"` | `"worker"` paints off-thread via OffscreenCanvas, falling back to canvas. See [Worker rendering](/docs/features/worker-rendering/). |
| `workerUrl` | `string \| URL` | `undefined` | Usually not needed: bundlers such as Vite build the default worker. Without a bundler, pass a browser-fetchable module URL, for example `"/sheetwrite/worker.js"` after you copy the package `dist/`. See [Worker rendering](/docs/features/worker-rendering/). |
| `theme` | `Partial<Theme>` | `undefined` | Overrides merged over `DEFAULT_THEME` and any `--sheetwrite-*` CSS vars. See [Styling](/docs/features/formatting/styles/). |
| `readOnly` | `boolean` | `false` | When `true`, all mutating interactions (edit, clear, fill, paste, restyle) are disabled and the host gets `aria-readonly="true"`. |
| `hyperlinkActivation` | `"event-only" \| "internal-navigation" \| "disabled"` | `"event-only"` | Activation never opens a browser URL. `event-only` emits a safe resolved target; `internal-navigation` also moves to stable internal destinations; `disabled` rejects every activation. |
| `protectionResolver` | `ProtectionResolver` | `undefined` | Host callback for protected local mutations; no resolver means deny. Client-side UX policy only, never server authorization. |
| `mutationPolicy` | `"atomic" \| "partial"` | `"atomic"` | Reject the whole local transaction on a denied protected operation, or apply allowed operations and report denied ones. |
| `transactionResourceLimits` | `Partial<TransactionResourceLimits>` | `undefined` | Overrides the inclusive operation-count and encoded-byte ceilings for every atomic mutation. |
| `renderers` | `Record<string, CellRenderer>` | `{}` | Custom cell renderers registered up front; reference one by name via `Column.renderer`. See [Custom cell renderers](#custom-cell-renderers). |
| `editors` | `Record<string, CellEditor>` | `{}` | Host-owned cell editors registered up front; reference one by name via `Column.editor`. See [Custom editors](/docs/features/grid/custom-editors/). |
| `overscan` | `number` | `6` | Row and visible-column positions painted on each viewport edge; `0` disables the buffer. |
| `minColumns` | `number` | workbook width | Minimum rendered/store column count. A spreadsheet also adds empty columns to fill the host width; a `data-grid` shows only its own columns unless you set `minColumns`. |
| `config` | `GridConfig` | `undefined` | Presence opts into the built-in toolbar. Omit it for no toolbar. See [Toolbar and ribbon](/docs/features/grid/toolbar-and-ribbon/). |

## Spreadsheet and data-grid presentation

`presentation: "spreadsheet"` is the backward-compatible default. It paints and announces positional column headers (`A`, `B`, `C`, …). Use `presentation: "data-grid"` when the columns describe row-object fields:

```ts prelude="core" partial="requires surrounding host state" title="Semantic data-grid headers"
const workbook: Workbook = {
  activeSheet: "people",
  sheets: [{
    id: "people",
    name: "People",
    rowCount: people.length,
    columns: [
      { key: "name", header: "Customer name", width: 220, type: "text" },
      { key: "status", header: "Account status", width: 160, type: "text" },
    ],
  }],
};

const grid = createGrid(host, {
  workbook,
  data,
  presentation: "data-grid",
});
```

The semantic header occupies the same header band as `A/B/C`; it does **not** consume row 0. These keep their zero-based data coordinates:

- cell addresses, formulas, selections and row numbers
- clipboard payloads and CSV/XLSX schema labels
- mutation events and datasource ranges

Table exports use `Column.header` in both presentation modes. The data-first `Sheetwrite` components select `"data-grid"` automatically because every `SimpleColumn` requires a `title`.

## Custom cell renderers

A `CellRenderer` paints or retains a DOM node for each cell in the rendered window. Register it in `renderers` or later with `grid.defineCellRenderer(name, renderer)`. When `dom` is present, it owns the cell content. The canvas still paints the cell background, border, headers, and grid lines.

```ts prelude="core" partial="requires surrounding host state" title="CellRenderer contract"
interface CellRenderer {
  canvas?(ctx: CanvasRenderingContext2D, c: CellPaintContext): void;
  dom?(c: CellPaintContext): HTMLElement;
  update?(element: HTMLElement, c: CellPaintContext): void;
  destroy?(element: HTMLElement): void;
}
```

| Hook | When it runs |
| --- | --- |
| `dom` | Creates an element when a cell enters the bounded rendered window. |
| `update` | Receives that same element after values, styles, theme, zoom, size, or scroll geometry change. Implement it to preserve focus and element-local state. |
| `destroy` | Runs immediately before the element leaves the window, is replaced by a newly registered renderer, or its grid is reset or destroyed. |

A legacy renderer with only `dom` is recreated when its value, style, theme, or size changes, but not for a pure scroll.

DOM cells are clipped to the viewport and frozen pane that owns them. A merged range produces one node for its anchor, not one node per covered cell. Plain renderer output stays hidden from assistive technology because the compact ARIA mirror already exposes its cell value. To make a renderer explicitly interactive:

1. Return a native control, or add a non-negative `tabindex`.
2. Give it an accessible name.
3. Set `element.style.pointerEvents = "auto"`.

Keyboard events from that control stay with the control instead of moving the grid.

With `renderer: "worker"`, `canvas` hooks cannot cross the Worker boundary. `dom`, `update`, and `destroy` still run on the main thread in the retained overlay.

## Framework adapters

Framework adapters classify every `GridOptions` field centrally:

| Fields | Effect of a change |
| --- | --- |
| `workbook`, `data`, `datasource`, `datasourceStorage`, `presentation`, `editors`, `protectionResolver`, `mutationPolicy`, `transactionResourceLimits` | `input-reset`: the adapter replaces the grid. |
| `renderer`, `workerUrl`, `renderers` | `renderer-reset`: the adapter replaces the grid. |
| `theme`, `readOnly`, `config`, `overscan`, `minColumns` | Live update of the existing grid. |

Readiness includes the resulting generation and reset reason.

Framework adapters also accept `wasmSource`. Initialization is process-wide and first-source-wins:

- Concurrent calls that use the same source share one attempt. A different source rejects until that attempt settles.
- If the winning attempt succeeds, every still-mounted adapter becomes ready, even when its prop changed during the attempt.
- A change to `wasmSource` after readiness warns and keeps the live grid, selection, edits, generation, and ready-event count unchanged.
- A true initialization failure remains observable through `onInitializationError`, and a later source can retry it.

## Edge cases and limits

- Presentation is construction-bound. Changing it through a framework adapter replaces the grid with `reason: "input-reset"`; it does not rename columns or move data in place.
- Pass `data` or `datasource`, not both.
- `readOnly` keeps navigation and selection. Only mutating interactions stop.
- `protectionResolver` is client-side UX policy. Your server must still authorize every submitted operation.

## See also

- [Custom editors](/docs/features/grid/custom-editors/)
- [Toolbar and ribbon](/docs/features/grid/toolbar-and-ribbon/)
- [Grid methods](/docs/features/grid/grid-methods/)
- [Framework lifecycle](/docs/frameworks/lifecycle/)
- Generated [`GridOptions`](/docs/api/core/grid-options/) and [`CellRenderer`](/docs/api/core/cell-renderer/) contracts
