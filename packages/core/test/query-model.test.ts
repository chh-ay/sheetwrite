import { describe, expect, it } from "bun:test";

import {
  columnsAfter,
  parseSourceColumns,
  parseStep,
  type StepKind,
  stepText,
} from "../src/panels/query-model.js";
import type { QueryStep, SavedQuery } from "../src/types.js";

const regions: SavedQuery = {
  id: "regions",
  name: "Regions",
  source: {
    kind: "host",
    sourceId: "regions",
    columns: [
      { id: "code", name: "Code", type: "text" },
      { id: "area", name: "Area", type: "text" },
    ],
  },
  steps: [],
};

const sales: SavedQuery = {
  id: "sales",
  name: "Sales",
  source: {
    kind: "csv",
    sourceId: "sales",
    columns: [
      { id: "region", name: "Region", type: "text" },
      { id: "total", name: "Total", type: "number" },
      { id: "q-1", name: "Q 1", type: "number" },
    ],
  },
  steps: [],
};

const queries = [regions, sales];

function step(kind: StepKind, text: string, query: SavedQuery = sales): QueryStep {
  const parsed = parseStep(kind, text, columnsAfter(query, queries), queries, query.id);
  if ("error" in parsed) throw new Error(parsed.error);
  return parsed.value;
}

describe("query step editor text", () => {
  it("maps typed names to stable IDs and prints the same line back", () => {
    const lines: readonly (readonly [StepKind, string])[] = [
      ["filter", "Total >= 100"],
      ["filter", 'not Region contains "North"'],
      ["filter", "Region is null"],
      ["select", 'Region, "Q 1"'],
      ["rename", "Total -> Amount"],
      ["changeType", "Total: text or null"],
      ["join", "Regions (left) on Region = Code"],
      ["group", "Region: Sum = sum(Total), Rows = countRows()"],
      ["unpivot", 'Total, "Q 1" -> Measure, Value'],
    ];
    for (const [kind, text] of lines) {
      const parsed = step(kind, text);
      expect(stepText(parsed, columnsAfter(sales, queries), queries)).toBe(text);
    }
  });

  it("keeps column IDs through a rename, so later steps still refer to the same column", () => {
    const renamed: SavedQuery = { ...sales, steps: [step("rename", "Total -> Amount")] };
    const filter = parseStep(
      "filter",
      "Amount > 1",
      columnsAfter(renamed, queries),
      queries,
      "sales",
    );

    expect(filter).toEqual({
      value: {
        kind: "filter",
        predicate: { kind: "compare", column: "total", op: "gt", value: 1 },
      },
    });
  });

  it("gives new columns fresh IDs and follows joins into another query's columns", () => {
    // Group output has only the keys and aggregates, so an aggregate may reuse a source ID.
    const grouped = step("group", "Region: Total = sum(Total), Region = count(Total)");
    expect(grouped).toMatchObject({
      aggregates: [
        { id: "total", name: "Total" },
        { id: "region-2", name: "Region" },
      ],
    });

    const joined: SavedQuery = { ...sales, steps: [step("join", "Regions on Region = Code")] };
    expect(columnsAfter(joined, queries).map((column) => column.name)).toEqual([
      "Region",
      "Total",
      "Q 1",
      "Code",
      "Area",
    ]);
  });
});

describe("query source columns text", () => {
  it("keeps existing IDs on edit and rejects unknown types and duplicate names", () => {
    const edited = parseSourceColumns("Total: number\nRegion: text\nNew one: date", [
      ...sales.source.columns,
    ]);
    expect(edited).toEqual({
      value: [
        { id: "total", name: "Total", type: "number" },
        { id: "region", name: "Region", type: "text" },
        { id: "new-one", name: "New one", type: "date" },
      ],
    });
    expect(parseSourceColumns("A: money")).toMatchObject({
      error: expect.stringContaining("money"),
    });
    expect(parseSourceColumns("A\na")).toEqual({ error: "Two columns are named a." });
  });
});
