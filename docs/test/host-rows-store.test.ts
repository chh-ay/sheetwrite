import { expect, it } from "bun:test";

import { createRowBridge } from "@sheetwrite/core";

import { applyHostProjection, type HostEntity } from "../src/showcases/host-rows-store.js";

// test/browser/host-owned-rows.spec.ts owns pasted and cleared ARR cells.

it("keeps a numeric ARR when a text value or a formula arrives", () => {
  const rows: HostEntity[] = [
    { id: "a", name: "Alder Quay", amount: 120_000, region: "", owner: "", stage: "" },
    { id: "b", name: "Beacon Ridge", amount: 75_000, region: "", owner: "", stage: "" },
  ];
  const columns = [
    { key: "name" as const, title: "Account" },
    { key: "amount" as const, title: "ARR", type: "number" as const },
  ];
  const bridge = createRowBridge({
    columns,
    defaultRows: rows,
    getRowId: (row: HostEntity) => row.id,
  });
  const projection = bridge.reconcile({
    status: "accepted",
    commitReason: "api",
    operations: [
      {
        op: "set",
        addr: { sheet: "sheet1", row: 0, col: 1 },
        value: { kind: "literal", value: "n/a" },
      },
      {
        op: "set",
        addr: { sheet: "sheet1", row: 1, col: 1 },
        value: { kind: "formula", src: "=1+1" },
      },
    ],
  });
  const store = applyHostProjection(new Map(rows.map((row) => [row.id, row])), projection);

  expect([store.get("a")?.amount, store.get("b")?.amount]).toEqual([120_000, 75_000]);
});
