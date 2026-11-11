import { describe, expect, it } from "bun:test";

import { createRowBridge, type CommitReason, type DocumentOp } from "@sheetwrite/core";

import { applyHostProjection, type HostEntity } from "../src/showcases/host-rows-store.js";

// Pasted and cleared ARR cells are owned by test/browser/host-owned-rows.spec.ts.

const COLUMNS = [
  { key: "name" as const, title: "Account" },
  { key: "amount" as const, title: "ARR", type: "number" as const },
  { key: "region" as const, title: "Region" },
  { key: "owner" as const, title: "Owner" },
  { key: "stage" as const, title: "Stage" },
];

const ROWS: HostEntity[] = ["001", "002"].map((suffix, index) => ({
  id: `account-${suffix}`,
  name: `Account ${suffix}`,
  amount: (index + 1) * 100_000,
  region: "North",
  owner: "Ada Chen",
  stage: "Renewal",
}));

function project(operations: DocumentOp[], commitReason: CommitReason): Map<string, HostEntity> {
  const bridge = createRowBridge({
    columns: COLUMNS,
    defaultRows: ROWS,
    getRowId: (row) => row.id,
  });
  const projection = bridge.reconcile({ status: "accepted", operations, commitReason });
  return applyHostProjection(new Map(ROWS.map((row) => [row.id, row])), projection);
}

const literal = (value: string | number) => ({ kind: "literal" as const, value });

describe("host account store", () => {
  it.each(["fill", "api"] as const)(
    "applies a %s range write to every account it covers",
    (reason) => {
      const range = { sheet: "sheet1", start: { row: 0, col: 1 }, end: { row: 1, col: 1 } };
      const store = project(
        [
          {
            op: "setRange",
            range,
            cells: [
              { rowOffset: 0, colOffset: 0, value: literal(90_000) },
              { rowOffset: 1, colOffset: 0, value: literal(60_000) },
            ],
          },
        ],
        reason,
      );

      expect([...store.values()].map((row) => row.amount)).toEqual([90_000, 60_000]);
    },
  );

  it("keeps a numeric ARR when a text value or a formula arrives", () => {
    const store = project(
      [
        { op: "set", addr: { sheet: "sheet1", row: 0, col: 1 }, value: literal("n/a") },
        {
          op: "set",
          addr: { sheet: "sheet1", row: 1, col: 1 },
          value: { kind: "formula", src: "=1+1" },
        },
      ],
      "api",
    );

    expect([...store.values()].map((row) => row.amount)).toEqual([100_000, 200_000]);
  });
});
