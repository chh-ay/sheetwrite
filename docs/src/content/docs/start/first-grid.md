---
title: Your first grid
description: Initialize Sheetwrite, create a workbook, and observe committed changes.
---

This complete TypeScript example uses the imperative core. [Install Sheetwrite](/docs/start/installation/) first; the framework adapters expose the same `Grid` after their client-only initialization completes.

```ts compile title="Complete first grid"
import {
  createGrid,
  initSheetwrite,
  type ColumnarData,
  type Workbook,
} from "@sheetwrite/core";
import "@sheetwrite/core/styles.css";

const host = document.querySelector<HTMLElement>("#grid");
if (host === null) throw new Error("Missing #grid host");
host.style.height = "420px";

const workbook: Workbook = {
  activeSheet: "sales",
  sheets: [
    {
      id: "sales",
      name: "Sales",
      rowCount: 3,
      columns: [
        { key: "product", header: "Product", width: 180, type: "text" },
        { key: "amount", header: "Amount", width: 100, type: "number" },
      ],
    },
  ],
};
const data: ColumnarData = {
  rowCount: 3,
  columns: {
    product: ["Notebook", "Pen", "Folder"],
    amount: new Float64Array([12, 4, 9]),
  },
};

await initSheetwrite();
const grid = createGrid(host, { workbook, data });
grid.on("change", ({ transaction }) => {
  console.log(transaction.patches);
});
```

`initSheetwrite()` is re-entrant. Call it before `createGrid`; concurrent calls share initialization and a failed call can be retried. Destroy the returned grid when its host is permanently removed.

## Add a formula

A formula is a cell value with `kind: "formula"`. The engine calculates it at once, and dependent cells follow every later edit.

```ts prelude="core" partial="continues the complete example above" title="Add a total"
grid.applyTransaction({
  patches: [
    {
      op: "set",
      addr: { sheet: "sales", row: 2, col: 1 },
      value: { kind: "formula", src: "=SUM(B1:B2)" },
    },
  ],
});

console.log(grid.store.getCell({ sheet: "sales", row: 2, col: 1 }).resolved); // 16
```

Users can type the same formula in the cell. To use `GROUPBY`, `LAMBDA`, regression, and the other analysis functions, select the [full formula engine](/docs/guides/analysis-formulas/) before you create the grid.

## Save and open the document

`exportSnapshot()` returns the complete document: values, formulas, styles, and sheet settings. Store it as JSON, and open it later with `createGridFromSnapshot`. Selection, scroll position, and zoom are session state; they are not in the snapshot.

```ts prelude="core" partial="continues the complete example above" title="Save and open"
const saved = JSON.stringify(grid.exportSnapshot());
grid.destroy();

const reopened = createGridFromSnapshot(host, JSON.parse(saved));
console.log(reopened.store.getCell({ sheet: "sales", row: 2, col: 1 }).resolved); // 16
```

For a server, save each change as an ordered operation instead of whole snapshots. The [persistence guide](/docs/guides/persistence/) explains the adapter and the offline queue.

## Next steps

- Open the [Vanilla example](/vanilla/) to exercise the same lifecycle in a production build.
- Choose a [framework integration](/docs/frameworks/lifecycle/).
- Learn when the [`Grid` and `Store` own state](/docs/concepts/runtime-ownership/).
- Read [what is new in 0.5.0](/docs/start/whats-new/).
- Browse the generated [`@sheetwrite/core` API](/docs/api/core/).
