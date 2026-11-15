import { expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  matchingCaptureAffinities,
  portableCommand,
  readCaptureArtifacts,
} from "../src/capture-scope.js";

it("binds a scope receipt to the exact artifact bytes of a declared release suite", async () => {
  await expect(readCaptureArtifacts("unknown-suite", tmpdir())).rejects.toThrow(
    "Unknown release suite",
  );
  const directory = mkdtempSync(join(tmpdir(), "sheetwrite-capture-proof-"));
  const filename = "chart-tracking-results.json";
  try {
    await expect(readCaptureArtifacts("chart-tracking", directory)).rejects.toThrow(
      "did not write",
    );
    writeFileSync(join(directory, filename), "abc");
    const before = await readCaptureArtifacts("chart-tracking", directory);
    expect(before).toHaveLength(1);
    expect(before[0]).toMatchObject({
      file: filename,
      sha256: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    });
    writeFileSync(join(directory, filename), "abd");
    const after = await readCaptureArtifacts("chart-tracking", directory);
    expect(after[0]?.sha256).not.toBe(before[0]?.sha256);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it("matches effective affinity per suite, including legacy single-slot receipts", () => {
  const formula = { label: "formula", metadata: { cpuSlot: 4, effectiveCpuAffinity: "4,6" } };
  const baseline = [{ label: "data", metadata: { cpuSlot: 4 } }, formula];
  const candidate = [
    { label: "data", metadata: { cpuSlot: 4, effectiveCpuAffinity: "4" } },
    formula,
    { label: "chart-tracking", metadata: { cpuSlot: 4 } },
  ];
  expect(matchingCaptureAffinities(baseline, candidate)).toEqual({
    data: "4",
    formula: "4,6",
    "chart-tracking": "4",
  });
});

it("rejects a mask mismatch and an overridden capture without its effective affinity", () => {
  const narrow = [{ label: "formula", metadata: { cpuSlot: 4, effectiveCpuAffinity: "4" } }];
  const wide = [{ label: "formula", metadata: { cpuSlot: 4, effectiveCpuAffinity: "4,6" } }];
  expect(() => matchingCaptureAffinities(narrow, wide)).toThrow(
    "Capture CPU affinities differ for formula",
  );
  const overridden = {
    label: "formula",
    metadata: { cpuSlot: 4, formulaAffinityCorrection: { intentionalProtocolCorrection: true } },
  };
  expect(() => matchingCaptureAffinities([overridden], [overridden])).toThrow(
    "Missing effective CPU affinity for overridden capture formula",
  );
});

it("records argv without the machine's directories", () => {
  const root = "/srv/checkouts/sheetwrite";
  const external = "/srv/checkouts";
  const recorded = portableCommand(
    [
      ...["bun", "run", "--output", `${root}/bench/results/releases/0.5.4`],
      ...["--baseline-root", `${external}/xlsx-baseline`],
      `SHEETWRITE_BENCH_ENGINE_ROOT=${external}/sheetwrite-base`,
      ...[`--cwd=${root}/bench`, `--baseline=${external}/sheetwrite-base`, root],
    ],
    root,
  );
  expect(recorded).toEqual([
    ...["bun", "run", "--output", "bench/results/releases/0.5.4"],
    ...["--baseline-root", "<external>/xlsx-baseline"],
    "SHEETWRITE_BENCH_ENGINE_ROOT=<external>/sheetwrite-base",
    ...["--cwd=bench", "--baseline=<external>/sheetwrite-base", "."],
  ]);
});
