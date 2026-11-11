import { beforeAll, expect, test } from "bun:test";

import { isSheetwriteError } from "@sheetwrite/core";

import { QueryError, loadQueryEngine } from "../src/node.js";
import type {
  QueryBatch,
  QueryColumn,
  QueryDiagnostic,
  QueryEngine,
  QuerySource,
} from "../src/types.js";

let engine: QueryEngine;

beforeAll(async () => {
  engine = await loadQueryEngine();
});

function column(batch: QueryBatch, index: number): QueryColumn {
  const column = batch.columns[index];
  if (column === undefined) throw new Error("Missing fixture output column");

  return column;
}

function diagnostic(operation: () => unknown): QueryDiagnostic {
  try {
    operation();
  } catch (error) {
    if (error instanceof QueryError) return error.diagnostic;

    throw error;
  }

  throw new Error("Expected a query failure");
}

const numericSource: QuerySource = {
  format: "json",
  columns: [{ id: "value", name: "Value", type: "number" }],
};
const encoder = new TextEncoder();
const json = (rows: string) => engine.parse(encoder.encode(rows), numericSource);
const filter = (op: "gt" | "eq", value: number) =>
  ({ kind: "filter", predicate: { kind: "compare", column: "value", op, value } }) as const;

test("typed lanes, nulls and errors survive a complete host round-trip", () => {
  const source: QuerySource = {
    format: "json",
    columns: [
      { id: "number", name: "Number", type: "number" },
      { id: "logical", name: "Logical", type: "logical" },
      { id: "text", name: "Text", type: "text" },
      { id: "date", name: "Date", type: "date" },
      { id: "time", name: "Time", type: "dateTime" },
      { id: "mixed", name: "Mixed", type: "mixed" },
    ],
  };
  const rows = [
    {
      Number: 2,
      Logical: true,
      Text: "é",
      Date: "1970-01-02",
      Time: "1970-01-01T00:00:00.000001",
      Mixed: "a",
    },
    { Number: "bad", Logical: false, Text: "", Date: null, Time: null, Mixed: 3 },
    {},
  ];
  const output = engine.execute(engine.parse(encoder.encode(JSON.stringify(rows)), source), []);

  expect(output.rowCount).toBe(3);
  expect(output.columns).toMatchObject([
    {
      type: "number",
      values: Float64Array.of(2, 0, 0),
      validity: Uint8Array.of(1),
      errorRows: Uint32Array.of(1),
      errorCodes: Uint32Array.of(0),
      errorPool: ["conversion"],
    },
    { type: "logical", values: Uint8Array.of(1), validity: Uint8Array.of(3) },
    { type: "text", bytes: encoder.encode("é"), offsets: Uint32Array.of(0, 2, 2, 2) },
    { type: "date", values: Int32Array.of(1, 0, 0) },
    { type: "dateTime", values: BigInt64Array.of(1n, 0n, 0n) },
    {
      type: "mixed",
      tags: Uint8Array.of(3, 1, 0),
      indexes: Uint32Array.of(0, 0, 0),
      numbers: Float64Array.of(3),
      text: encoder.encode("a"),
    },
  ]);
});

test("mixed error tags and interned codes survive a second execution", () => {
  const unpivoted = engine.execute(json('[{"Value":"bad"},{"Value":null}]'), [
    {
      kind: "unpivot",
      columns: ["value"],
      attribute: { id: "attribute", name: "Attribute" },
      value: { id: "result", name: "Result" },
    },
  ]);
  const output = engine.execute(unpivoted, []);

  expect(output.rowCount).toBe(1);
  expect(column(output, 1)).toMatchObject({
    type: "mixed",
    tags: Uint8Array.of(6),
    indexes: Uint32Array.of(0),
    errorRows: Uint32Array.of(0),
    errorCodes: Uint32Array.of(0),
    errorPool: ["conversion"],
  });
});

test("source options retain empty text, schema order and nested JSON record paths", () => {
  const csv = engine.parse(encoder.encode("a;1\n;2\n"), {
    format: "csv",
    delimiter: 59,
    headers: false,
    emptyIsNull: false,
    columns: [
      { id: "label", name: "Label", type: "text" },
      { id: "value", name: "Value", type: "number" },
    ],
  });
  const nested = engine.parse(encoder.encode('{"résults":{"items":[{"Value":7}]}}'), {
    format: "json",
    path: ["résults", "items"],
    columns: numericSource.columns,
  });

  expect(csv.rowCount).toBe(2);
  expect(csv.columns).toMatchObject([
    {
      type: "text",
      bytes: encoder.encode("a"),
      offsets: Uint32Array.of(0, 1, 1),
      validity: Uint8Array.of(3),
    },
    { type: "number", values: Float64Array.of(1, 2) },
  ]);
  expect(nested.rowCount).toBe(1);
  expect(column(nested, 0)).toMatchObject({ type: "number", values: Float64Array.of(7) });
});

test("fatal diagnostics cross WASM with coordinates and leave the engine usable", () => {
  const issue = diagnostic(() => engine.execute(json('[{"Value":"bad"}]'), [filter("gt", 0)]));

  expect(issue).toEqual({ code: "predicate-error", row: 0, column: "value", step: 0 });
  const recovered = engine.execute(json('[{"Value":4}]'), []);
  expect(column(recovered, 0)).toMatchObject({ type: "number", values: Float64Array.of(4) });
});

test("invalid host offsets and scalar widths are rejected rather than trapped or truncated", () => {
  const malformed: QueryBatch = {
    rowCount: 1,
    columns: [
      {
        id: "text",
        name: "Text",
        type: "text",
        bytes: encoder.encode("a"),
        offsets: Uint32Array.of(0, 2),
        validity: Uint8Array.of(1),
        errorRows: new Uint32Array(),
        errorCodes: new Uint32Array(),
        errorPool: [],
      },
    ],
  };
  const one = encoder.encode('[{"Value":1}]');

  expect(diagnostic(() => engine.execute(malformed, [])).code).toBe("shape");
  expect(() => engine.parse(encoder.encode("[]"), numericSource, { maxRows: 2 ** 32 })).toThrow(
    RangeError,
  );
  const infinite = filter("eq", Number.POSITIVE_INFINITY);
  expect(diagnostic(() => engine.execute(json('[{"Value":1}]'), [infinite])).code).toBe(
    "definition",
  );
  expect(diagnostic(() => engine.parse(one, numericSource, { maxOutputBytes: 8 })).code).toBe(
    "limit",
  );
});

test("fatal failures use the shared serializable error envelope", () => {
  let failure: unknown;
  try {
    engine.parse(encoder.encode('[{"Value":1},{"Value":2}]'), numericSource, { maxRows: 1 });
  } catch (error) {
    failure = error;
  }

  expect(isSheetwriteError(failure)).toBe(true);
  expect(JSON.parse(JSON.stringify(failure))).toMatchObject({
    code: "resource-limit",
    operation: "query",
    context: { diagnostic: "limit", step: null, row: null, column: null },
  });
});
