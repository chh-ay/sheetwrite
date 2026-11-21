---
title: Keep app rows in your store
description: Keep application row objects in your store while Sheetwrite projects edits through stable row IDs.
---

Use the row bridge when your app owns the row objects and Sheetwrite owns editing, history, sorting, and filtering. The bridge is optional. Without `getRowId`, `defaultRows` keeps its existing one-time, uncontrolled behavior.

```ts prelude="core" partial="requires the entities map, nextId, and adapter mount from Full setup" title="Bridge the host entity store"
import { createRowBridge } from "@sheetwrite/core";

type InvoiceRow = { id: string; customer: string; total: number };
declare const entities: Map<string, InvoiceRow>;
declare let nextId: number;

const bridge = createRowBridge<InvoiceRow, string>({
  columns: [{ key: "customer" }, { key: "total" }],
  defaultRows: [...entities.values()],
  getRowId: (row) => row.id,
  createRowId: () => `invoice-${nextId++}`,
});
// Pass it to an adapter: <SheetwriteGrid workbook={workbook} data={data} rowBridge={bridge} onRowDelta={applyProjection} />
// (workbook and data hold the same rows as the bridge.)
```

<div class="sw-grid-result" data-row-ids="invoice-1 invoice-2">

| Ada | 120 |
| --- | ---: |
| Lin | 75 |

<figcaption>Result: one grid row per <code>InvoiceRow</code> in <code>entities</code>, with its <code>getRowId</code> ID beside the row number. Column A is <code>customer</code> and B is <code>total</code>. Editing Lin's total projects a cell delta with <code>rowId</code> <code>"invoice-2"</code> and <code>columnKey</code> <code>"total"</code>, which <code>applyProjection</code> writes back to the map. An inserted row gets <code>invoice-3</code> from <code>createRowId</code>.</figcaption>

</div>

[Try it live → Host-owned rows showcase](/showcases/host-rows/). Sort and filter host-owned accounts and watch each delta name the same record ID.

<details>
<summary>Full setup</summary>

```ts prelude="core" partial="requires surrounding host state" title="Host entity store"
import { createRowBridge, type RowBridgeProjection } from "@sheetwrite/core";

type InvoiceRow = {
  id: string;
  customer: string;
  total: number;
};

const entities = new Map<string, InvoiceRow>([
  ["invoice-1", { id: "invoice-1", customer: "Ada", total: 120 }],
  ["invoice-2", { id: "invoice-2", customer: "Lin", total: 75 }],
]);
const rows = [...entities.values()];
let nextId = 3;

const bridge = createRowBridge<InvoiceRow, string>({
  columns: [{ key: "customer" }, { key: "total" }],
  defaultRows: rows,
  getRowId: (row) => row.id,
  createRowId: () => `invoice-${nextId++}`,
});

function applyProjection(projection: RowBridgeProjection<string>) {
  if (projection.status === "rejected" || projection.status === "duplicate") return;
  for (const delta of projection.deltas) {
    if (delta.kind === "cell") {
      const { rowId, columnKey, next } = delta.cell;
      if (rowId === null || columnKey === null || next?.kind !== "literal") continue;
      const row = entities.get(rowId);
      if (row) entities.set(rowId, { ...row, [columnKey]: next.value });
    }
    if (delta.kind === "row-structure" && delta.action === "delete") {
      for (const rowId of delta.removed) if (rowId !== null) entities.delete(rowId);
    }
    if (delta.kind === "row-structure" && delta.action === "insert") {
      for (const rowId of delta.inserted) {
        if (rowId !== null) entities.set(rowId, { id: rowId, customer: "", total: 0 });
      }
    }
  }
}
```

In a framework adapter, the `Sheetwrite` component makes the same bridge from `getRowId` and `createRowId`. Pass the same callback:

```tsx prelude="react" partial="requires surrounding component state" title="React adapter"
import { Sheetwrite, type RowBridgeProjection, type SimpleColumn } from "@sheetwrite/react";

type InvoiceRow = {
  id: string;
  customer: string;
  total: number;
};

declare const columns: readonly SimpleColumn<InvoiceRow>[];
declare const rows: readonly InvoiceRow[];
declare let nextId: number;
declare const applyProjection: (projection: RowBridgeProjection<string>) => void;
<Sheetwrite
  columns={columns}
  defaultRows={rows}
  getRowId={(row) => row.id}
  createRowId={() => `invoice-${nextId++}`}
  onRowDelta={applyProjection}
  height={420}
/>
```

</details>

Vue emits `row-delta`; Svelte and the imperative controller use `onRowDelta`. All adapters call the same core bridge. View sorts, filters and hidden rows change only the displayed order, so emitted row IDs still refer to data rows. An in-place sort (`sortBy`, `sortRange`) moves the cells between rows.

Remote changes should enter through `grid.applyRemoteOperations(...)`. Their projections have `status: "remote"` and `source: "remote"`. An echoed local transaction is returned as `duplicate` with no deltas. For a server rejection or transformed acceptance, call `bridge.reconcile(...)` with the server result and the canonical applied operations. The bridge does not update your store automatically; your callback remains the only place that changes host rows.

By default, the bridge retains at most 8,192 recent transaction IDs and 8,192 recent local operation fingerprints. If your host applies its own echoes directly through `applyRemoteOperations`, deliver each echo before its identity leaves this window. An echo outside this window is no longer recognized and projects as a remote change. `SyncCoordinator` removes acknowledged local echoes before they become Grid change events, so its separate 4,096 acknowledgement window does not set the bridge limit.

Set `maxRecentTransactions` in `createRowBridge` to change the limit for each identity window. The value must be a positive safe integer; other values throw a `SheetwriteError` with code `invalid-argument`. Raise the limit if your host can project more than 8,192 transactions before an echo arrives. A larger limit retains more identity strings and uses more memory.

```ts compile prelude="core" title="Allow more delayed direct echoes"
import { createRowBridge } from "@sheetwrite/core";

const bridge = createRowBridge({
  columns: [{ key: "total" }],
  defaultRows: [{ id: "invoice-1", total: 120 }],
  getRowId: (row) => row.id,
  maxRecentTransactions: 16384,
});
```
