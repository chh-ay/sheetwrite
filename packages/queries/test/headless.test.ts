import { beforeAll, expect, test } from "bun:test";

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
  const bytes = encoder.encode(
    JSON.stringify([
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
    ]),
  );
  const parsed = engine.parse(bytes, source);
  const output = engine.execute(parsed, []);

  expect(output.rowCount).toBe(3);
  expect(column(output, 0)).toMatchObject({
    type: "number",
    values: Float64Array.of(2, 0, 0),
    validity: Uint8Array.of(1),
    errorRows: Uint32Array.of(1),
    errorCodes: Uint32Array.of(0),
    errorPool: ["conversion"],
  });
  expect(column(output, 1)).toMatchObject({
    type: "logical",
    values: Uint8Array.of(1),
    validity: Uint8Array.of(3),
  });
  expect(column(output, 2)).toMatchObject({
    type: "text",
    bytes: encoder.encode("é"),
    offsets: Uint32Array.of(0, 2, 2, 2),
  });
  expect(column(output, 3)).toMatchObject({ type: "date", values: Int32Array.of(1, 0, 0) });
  expect(column(output, 4)).toMatchObject({
    type: "dateTime",
    values: BigInt64Array.of(1n, 0n, 0n),
  });
  expect(column(output, 5)).toMatchObject({
    type: "mixed",
    tags: Uint8Array.of(3, 1, 0),
    indexes: Uint32Array.of(0, 0, 0),
    numbers: Float64Array.of(3),
    text: encoder.encode("a"),
  });
});

test("mixed error tags and interned codes survive a second execution", () => {
  const source = engine.parse(encoder.encode('[{"Value":"bad"},{"Value":null}]'), numericSource);
  const unpivoted = engine.execute(source, [
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

test("named typed inputs reach join execution without row objects", () => {
  const left = engine.parse(encoder.encode('[{"Value":2},{"Value":1}]'), numericSource);
  const right = engine.parse(encoder.encode('[{"Right":1},{"Right":2}]'), {
    format: "json",
    columns: [{ id: "right", name: "Right", type: "number" }],
  });
  const output = engine.execute(
    left,
    [
      { kind: "filter", predicate: { kind: "compare", column: "value", op: "gt", value: 1 } },
      { kind: "join", input: "right", keys: [["value", "right"]], join: "inner" },
    ],
    [{ id: "right", batch: right }],
  );

  expect(output.rowCount).toBe(1);
  expect(column(output, 0)).toMatchObject({ type: "number", values: Float64Array.of(2) });
  expect(column(output, 1)).toMatchObject({ type: "number", values: Float64Array.of(2) });
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

  expect(csv.rowCount).toBe(2);
  expect(column(csv, 0)).toMatchObject({
    type: "text",
    bytes: encoder.encode("a"),
    offsets: Uint32Array.of(0, 1, 1),
    validity: Uint8Array.of(3),
  });
  expect(column(csv, 1)).toMatchObject({ type: "number", values: Float64Array.of(1, 2) });

  const json = engine.parse(encoder.encode('{"résults":{"items":[{"Value":7}]}}'), {
    format: "json",
    path: ["résults", "items"],
    columns: numericSource.columns,
  });

  expect(json.rowCount).toBe(1);
  expect(column(json, 0)).toMatchObject({ type: "number", values: Float64Array.of(7) });
});

test("fatal diagnostics cross WASM with coordinates and leave the engine usable", () => {
  const source = engine.parse(encoder.encode('[{"Value":"bad"}]'), numericSource);

  const issue = diagnostic(() =>
    engine.execute(source, [
      {
        kind: "filter",
        predicate: { kind: "compare", column: "value", op: "gt", value: 0 },
      },
    ]),
  );

  expect(issue).toEqual({ code: "predicate-error", row: 0, column: "value", step: 0 });

  const recovered = engine.execute(
    engine.parse(encoder.encode('[{"Value":4}]'), numericSource),
    [],
  );
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

  expect(diagnostic(() => engine.execute(malformed, [])).code).toBe("shape");
  expect(() => engine.parse(encoder.encode("[]"), numericSource, { maxRows: 2 ** 32 })).toThrow(
    RangeError,
  );

  const source = engine.parse(encoder.encode('[{"Value":1}]'), numericSource);
  const nonFinite = diagnostic(() =>
    engine.execute(source, [
      {
        kind: "filter",
        predicate: { kind: "compare", column: "value", op: "eq", value: Number.POSITIVE_INFINITY },
      },
    ]),
  );

  expect(nonFinite.code).toBe("definition");
  expect(
    diagnostic(() =>
      engine.parse(encoder.encode('[{"Value":1}]'), numericSource, { maxOutputBytes: 8 }),
    ).code,
  ).toBe("limit");
});
