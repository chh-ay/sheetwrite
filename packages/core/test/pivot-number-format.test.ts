import { expect, it } from "bun:test";

import { validateDocumentOperationShape } from "../src/index.js";

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

it("formats pivot values on the full engine, in its own process", async () => {
  // Engine selection is process-wide, so the full-engine checks run apart.
  const probe = Bun.spawn(
    [process.execPath, "test", "./packages/core/test/pivot-number-format.full-engine.ts"],
    { cwd: new URL("../../..", import.meta.url).pathname, stdout: "pipe", stderr: "pipe" },
  );
  const [exitCode, stderr] = await Promise.all([probe.exited, new Response(probe.stderr).text()]);

  expect({ exitCode, failures: stderr.match(/^\(fail\).*$/gmu) ?? [] }).toEqual({
    exitCode: 0,
    failures: [],
  });
});
