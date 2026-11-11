import { expect, it } from "bun:test";

import {
  runDatasourcePrefetchBenchmark,
  validateDatasourcePrefetchReport,
} from "../src/datasource-prefetch-bench.js";

it("keeps every logical-clock repetition resident, bounded and cancellable", async () => {
  const report = await runDatasourcePrefetchBenchmark();
  // The validator holds each repetition to the residency, wait, request, cache and abort bounds.
  expect(() => validateDatasourcePrefetchReport(report)).not.toThrow();
  expect(report.sparseBookkeeping.modeledNumericPayloadBytes).toBe(32);
});
