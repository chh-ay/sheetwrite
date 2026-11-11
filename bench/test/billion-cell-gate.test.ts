import { expect, it } from "bun:test";

import {
  assertCapturedOnRunningMachine,
  type BillionCellBenchmarkArtifact,
  validateBillionCellBenchmark,
} from "../src/billion-cell-bench.js";

const RECORDED: unknown = await Bun.file(
  new URL("../results/billion-cell-results.json", import.meta.url),
).json();

it("accepts the committed evidence and rejects a new capture that does not record the running machine", () => {
  validateBillionCellBenchmark(RECORDED);
  const recorded: BillionCellBenchmarkArtifact = RECORDED;
  const running = {
    ...recorded.toolchain,
    bunVersion: Bun.version,
    platform: process.platform,
    architecture: process.arch,
  };
  expect(() => assertCapturedOnRunningMachine(running)).not.toThrow();
  for (const toolchain of [
    { ...running, platform: process.platform === "linux" ? "darwin" : "linux" },
    { ...running, architecture: process.arch === "x64" ? "arm64" : "x64" },
    { ...running, bunVersion: "0.0.0-other" },
  ]) {
    expect(() => assertCapturedOnRunningMachine(toolchain)).toThrow();
  }
});
