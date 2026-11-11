import { beforeAll, expect, test } from "bun:test";

import { QueryError, loadQueryEngine } from "../src/node.js";
import type { QueryBatch, QueryDiagnostic, QueryEngine, QuerySource } from "../src/types.js";

let engine: QueryEngine;

beforeAll(async () => {
  engine = await loadQueryEngine();
});

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
  expect(output.columns[1]).toMatchObject({
    type: "mixed",
    tags: Uint8Array.of(6),
    indexes: Uint32Array.of(0),
    errorRows: Uint32Array.of(0),
    errorCodes: Uint32Array.of(0),
    errorPool: ["conversion"],
  });
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
  const infinite = {
    kind: "filter",
    predicate: { kind: "compare", column: "value", op: "eq", value: Number.POSITIVE_INFINITY },
  } as const;
  const one = encoder.encode('[{"Value":1}]');

  expect(diagnostic(() => engine.execute(malformed, [])).code).toBe("shape");
  expect(() => engine.parse(encoder.encode("[]"), numericSource, { maxRows: 2 ** 32 })).toThrow(
    RangeError,
  );
  expect(diagnostic(() => engine.execute(json('[{"Value":1}]'), [infinite])).code).toBe(
    "definition",
  );
  expect(diagnostic(() => engine.parse(one, numericSource, { maxOutputBytes: 8 })).code).toBe(
    "limit",
  );
});
