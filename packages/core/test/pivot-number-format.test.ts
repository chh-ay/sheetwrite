import { expect, it } from "bun:test";

import { validateDocumentOperationShape } from "../src/document-protocol.js";

it("refuses a value number format that is empty or longer than a cell format", () => {
  const pivot = (numberFormat: string) => ({
    id: "p",
    name: "P",
    source: { range: { sheet: "s", start: { row: 0, col: 0 }, end: { row: 2, col: 1 } } },
    anchor: { row: 0, col: 3 },
    rows: [0],
    columns: [],
    values: [{ field: 1, aggregation: "SUM", numberFormat }],
  });
  const issues = (numberFormat: string) =>
    validateDocumentOperationShape({ op: "setPivot", sheet: "s", pivot: pivot(numberFormat) }).map(
      (issue) => issue.path,
    );

  expect(issues("$#,##0")).toEqual([]);
  expect(issues("")).toEqual(["operation.pivot.values[0].numberFormat"]);
  expect(issues("0".repeat(256))).toEqual(["operation.pivot.values[0].numberFormat"]);
});
