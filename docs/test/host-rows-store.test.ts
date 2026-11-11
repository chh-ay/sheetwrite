import { expect, it } from "bun:test";

import { createRowBridge, type DocumentOp } from "@sheetwrite/core";

import { applyHostProjection, type HostEntity } from "../src/showcases/host-rows-store.js";

it("clears the cleared values of one host account only", () => {
  const rows: HostEntity[] = ["001", "002"].map((suffix, index) => ({
    id: `account-${suffix}`,
    name: `Account ${suffix}`,
    amount: (index + 1) * 100_000,
    region: "North",
    owner: "Ada Chen",
    stage: "Renewal",
  }));
  const bridge = createRowBridge({
    columns: [
      { key: "name" as const, title: "Account" },
      { key: "amount" as const, title: "ARR", type: "number" as const },
      { key: "region" as const, title: "Region" },
      { key: "owner" as const, title: "Owner" },
      { key: "stage" as const, title: "Stage" },
    ],
    defaultRows: rows,
    getRowId: (row) => row.id,
  });
  const clear: DocumentOp = {
    op: "clearRange",
    range: { sheet: "sheet1", start: { row: 1, col: 0 }, end: { row: 1, col: 1 } },
  };
  const projection = bridge.reconcile({
    status: "accepted",
    operations: [clear],
    commitReason: "api",
  });
  const store = applyHostProjection(new Map(rows.map((row) => [row.id, row])), projection);

  expect([...store.values()].map(({ name, amount }) => [name, amount])).toEqual([
    ["Account 001", 100_000],
    ["", 0],
  ]);
});
