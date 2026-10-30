import { describe, expect, it } from "bun:test";

import { createRowBridge, type CommitReason, type DocumentOp } from "@sheetwrite/core";

import { applyHostProjection, type HostEntity } from "../src/showcases/host-rows-store.js";

const COLUMNS = [
  { key: "name" as const, title: "Account" },
  { key: "amount" as const, title: "ARR", type: "number" as const },
  { key: "region" as const, title: "Region" },
  { key: "owner" as const, title: "Owner" },
  { key: "stage" as const, title: "Stage" },
];

const ROWS: HostEntity[] = [
  {
    id: "account-001",
    name: "Alder Quay",
    amount: 120_000,
    region: "North",
    owner: "Ada Chen",
    stage: "Renewal",
  },
  {
    id: "account-002",
    name: "Beacon Ridge",
    amount: 75_000,
    region: "South",
    owner: "Lin Patel",
    stage: "Proposal",
  },
];

const ARR_CELLS = {
  sheet: "sheet1",
  start: { row: 0, col: 1 },
  end: { row: 1, col: 1 },
};

function project(operations: DocumentOp[], commitReason: CommitReason): Map<string, HostEntity> {
  const bridge = createRowBridge({
    columns: COLUMNS,
    defaultRows: ROWS,
    getRowId: (row) => row.id,
  });
  const projection = bridge.reconcile({ status: "accepted", operations, commitReason });
  const store = applyHostProjection(new Map(ROWS.map((row) => [row.id, row])), projection);
  return store;
}

describe("host account store", () => {
  it.each([
    ["paste", "paste"],
    ["fill", "fill"],
    ["range", "api"],
  ] as const)("applies a %s write to every account it covers", (_kind, commitReason) => {
    const store = project(
      [
        {
          op: "setRange",
          range: ARR_CELLS,
          cells: [
            { rowOffset: 0, colOffset: 0, value: { kind: "literal", value: 90_000 } },
            { rowOffset: 1, colOffset: 0, value: { kind: "literal", value: 60_000 } },
          ],
        },
      ],
      commitReason,
    );

    expect(store.get("account-001")?.amount).toBe(90_000);
    expect(store.get("account-002")?.amount).toBe(60_000);
  });

  it("clears the cleared values of each account", () => {
    const store = project(
      [
        {
          op: "clearRange",
          range: { sheet: "sheet1", start: { row: 1, col: 0 }, end: { row: 1, col: 1 } },
        },
      ],
      "api",
    );

    expect(store.get("account-002")).toMatchObject({ name: "", amount: 0 });
    expect(store.get("account-001")?.amount).toBe(120_000);
  });

  it("keeps a numeric ARR when a text value or a formula arrives", () => {
    const store = project(
      [
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
      "api",
    );

    expect(store.get("account-001")?.amount).toBe(120_000);
    expect(store.get("account-002")?.amount).toBe(75_000);
  });
});
