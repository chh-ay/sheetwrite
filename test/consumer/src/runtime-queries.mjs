import assert from "node:assert/strict";

import { loadQueryEngine } from "@sheetwrite/queries";

const engine = await loadQueryEngine();
const source = engine.parse(new TextEncoder().encode("Value\n1\n2\n4\n"), {
  format: "csv",
  columns: [{ id: "value", name: "Value", type: "number" }],
});
const output = engine.execute(source, [
  { kind: "filter", predicate: { kind: "compare", column: "value", op: "gt", value: 1 } },
  { kind: "group", keys: [], aggregates: [{ id: "sum", name: "Sum", op: "sum", column: "value" }] },
]);
const total = output.columns.find((column) => column.id === "sum");

assert.equal(output.rowCount, 1);
assert.equal(total?.type, "number");
if (total?.type === "number") {
  assert.deepEqual(total.values, Float64Array.of(6));
}

process.stdout.write("Packed query execution passed\n");
