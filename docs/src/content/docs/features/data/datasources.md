---
title: Datasources
description: Load rows on demand from an async, cancellable datasource instead of eager data.
---

```ts prelude="core" partial="requires a workbook and host-provided datasource" title="Mount a paged datasource"
createGrid(host, {
  workbook,
  datasource,
  datasourceStorage: { mode: "paged" },
});
```

<div class="sw-grid-result" data-caption="Result: A1:D2 after the host returns the two product rows">

| Notebook | 3 | 8 | **$24.00** |
| --- | --- | --- | --- |
| Pen | 5 | 2 | **$10.00** |

</div>

For this result, the workbook columns are `label`, `quantity`, `price`, and `total`, in that order. The host endpoint returns `[{ "label": "Notebook", "quantity": 3, "price": 8 }, { "label": "Pen", "quantity": 5, "price": 2 }]`. The adapter below supplies the formula and bold currency style for each total; D1 evaluates `=B1*C1`.

**Try it live:** [Engine showcase](/showcases/engine/) — jump between rows and inspect the datasource request and arrival events. Its datasource is local to the page, not a remote server.

Start with the host and initialization in [Your first grid](/docs/start/first-grid/), replacing eager `data` with `datasource`. A `DataSource` loads cancellable pages for the visible window, so the grid does not need the whole sheet in memory. The HTTP endpoint and its backing data remain your responsibility.

<details>
<summary>Datasource adapter setup — requires your server endpoint</summary>

```ts prelude="core" partial="requires a server endpoint and workbook" title="Paged datasource with formulas and styles"
import type { RowData } from "@sheetwrite/core";

interface ApiRow {
  label: string;
  quantity: number;
  price: number;
}

const datasource: DataSource = {
  capabilities: { protocol: 2, columns: "windowed" },
  async getRows({ sheet, start, end, columns, signal, revision }) {
    const response = await fetch(
      `/sheets/${encodeURIComponent(sheet)}?start=${start}&end=${end}`,
      { signal },
    );
    if (!response.ok) throw new Error(`Datasource request failed: ${response.status}`);
    const records = (await response.json()) as ApiRow[];
    return {
      protocol: 2,
      start,
      columns,
      revision: response.headers.get("etag") ?? revision,
      rows: records.map((record, index) => {
        const row = start + index + 1;
        const cells: RowData = {
          label: record.label,
          quantity: record.quantity,
          price: record.price,
          total: {
            value: { kind: "formula", src: `=B${row}*C${row}` },
            style: { numberFormat: "$#,##0.00", bold: true },
          },
        };
        // Return exactly the column runs the grid asked for.
        return Object.fromEntries(
          columns.flatMap((band) => band.keys.map((key) => [key, cells[key] ?? null])),
        );
      }),
    };
  },
};

createGrid(host, {
  workbook,
  datasource,
  datasourceStorage: { mode: "paged" },
});
```

</details>

The grid requests rows only for the visible window. The endpoint must return records for the requested row interval; this example selects the requested column runs before returning each page to the grid.

## Requests and pages

The cancellable request API owns one visible-window generation. Pages can carry authoritative formula source and style, not only resolved scalars.

| Field | Where | Meaning |
| --- | --- | --- |
| `capabilities.columns` | `DataSource` | `"windowed"` loads only the requested column runs. `"full-width"` loads every column; it does not scale horizontally. |
| `start` / `end` | request | Inclusive first row and exclusive end row. |
| `columns` | request and page | Exact visible, frozen, or prefetched column runs. Each run has `start`, exclusive `end`, and the stable column `keys`. |
| `signal` | request | Aborted when the request is no longer needed. Stop work when it aborts. |
| `revision` | request and page | The request carries a number; a page may return a string or number revision. |
| `rows` | page | Each value is a scalar, a `CellValue` object, or a `{ value: CellValue, style?: CellStyle }` wrapper. |

## Storage

| `datasourceStorage` field | Default | Effect |
| --- | --- | --- |
| `mode` | `"dense"` | `"paged"` allocates power-of-two row chunks only for loaded or locally edited areas. |
| `chunkRows` | 4,096 | Paged row chunk size, normalized to a power of two. |
| `cacheBytes` | 32 MiB | Per-sheet budget for clean cached chunks. Dirty chunks remain pinned until acknowledgement. |
| `dirtyCellLimit` | 1,000,000 | Maximum sparse local edits retained outside the clean page cache. |

Full-sheet queries and exports report incomplete data until all required pages are loaded. `Store.queryCapability(sheet)` and `getCellLoadState(addr)` expose that state. Default chunk and cache values and eviction behavior are also listed in [Compatibility and limits](/docs/reference/compatibility-limits/#rendering-interaction-and-paged-data).

## Cells that visible formulas read

A visible formula can read cells outside the visible window. For example, a variance column can read a plan column far to the right. The grid asks the engine which same-sheet cells the painted formulas read, also through other formulas, and requests those cells with the window. This includes frozen bands, overscan, and merge anchors reached by the paint plan. The formula then resolves instead of staying `#LOADING!`.

- One shared 32,768-cell budget bounds dependency loading across these roots. A whole-column read does not load the full column in one window.
- The painted cells and their bounded dependency closure stay protected from clean-cache eviction while visible.
- Bulk reads such as exports and search use separate, transient protection. They do not replace the viewport's pins.
- Reads from other sheets are not loaded this way. Return those values from the datasource, or keep that sheet dense.

## Edge cases and limits

- Hydrated formulas, references, and styles do not emit user change events.
- A short page marks only the returned rows loaded.
- A malformed range emits `datasource-error` and stays retryable.
- Resetting or destroying the grid aborts outstanding requests.
- A late page never overwrites a cell edited after that request began.

## See also

- [Grid options and presentation](/docs/features/grid/options-and-presentation/)
- [Events](/docs/reference/events/)
- [Compatibility and limits](/docs/reference/compatibility-limits/#rendering-interaction-and-paged-data)
- Generated [`DataSource`](/docs/api/core/data-source/), [`DataSourceRequest`](/docs/api/core/data-source-request/), [`DataSourcePage`](/docs/api/core/data-source-page/) and [`DataSourceStorageOptions`](/docs/api/core/data-source-storage-options/) contracts
