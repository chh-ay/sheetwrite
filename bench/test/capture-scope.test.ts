import { expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  matchingCaptureAffinities,
  portableCommand,
  readCaptureArtifacts,
} from "../src/capture-scope.js";

it("binds a scope receipt to the exact artifact bytes", async () => {
  const directory = mkdtempSync(join(tmpdir(), "sheetwrite-capture-proof-"));
  const filename = "chart-tracking-results.json";
  try {
    await expect(readCaptureArtifacts("chart-tracking", directory)).rejects.toThrow(
      "did not write",
    );
    writeFileSync(join(directory, filename), "abc");

    const before = await readCaptureArtifacts("chart-tracking", directory);
    expect(before).toHaveLength(1);
    expect(before[0]?.file).toBe(filename);
    expect(before[0]?.sha256).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );

    writeFileSync(join(directory, filename), "abd");
    const after = await readCaptureArtifacts("chart-tracking", directory);
    expect(after[0]?.sha256).not.toBe(before[0]?.sha256);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it("rejects a scope label with no declared release artifact coverage", async () => {
  await expect(readCaptureArtifacts("unknown-suite", tmpdir())).rejects.toThrow(
    "Unknown release suite",
  );
});

it("matches effective affinity per suite, including legacy single-slot receipts", () => {
  const baseline = [
    { label: "data", metadata: { cpuSlot: 4 } },
    { label: "formula", metadata: { cpuSlot: 4, effectiveCpuAffinity: "4,6" } },
  ];
  const candidate = [
    { label: "data", metadata: { cpuSlot: 4, effectiveCpuAffinity: "4" } },
    { label: "formula", metadata: { cpuSlot: 4, effectiveCpuAffinity: "4,6" } },
    { label: "chart-tracking", metadata: { cpuSlot: 4 } },
  ];

  expect(matchingCaptureAffinities(baseline, candidate)).toEqual({
    data: "4",
    formula: "4,6",
    "chart-tracking": "4",
  });
});

it("rejects a same-suite mask mismatch despite identical reservation slots", () => {
  const baseline = [{ label: "formula", metadata: { cpuSlot: 4, effectiveCpuAffinity: "4" } }];
  const candidate = [{ label: "formula", metadata: { cpuSlot: 4, effectiveCpuAffinity: "4,6" } }];

  expect(() => matchingCaptureAffinities(baseline, candidate)).toThrow(
    "Capture CPU affinities differ for formula",
  );
});

it("does not infer effective affinity from a reservation slot after an explicit override", () => {
  const capture = {
    label: "formula",
    metadata: { cpuSlot: 4, formulaAffinityCorrection: { intentionalProtocolCorrection: true } },
  };

  expect(() => matchingCaptureAffinities([capture], [capture])).toThrow(
    "Missing effective CPU affinity for overridden capture formula",
  );
});

it("records argv without the machine's directories", () => {
  const root = "/srv/checkouts/sheetwrite";
  expect(
    portableCommand(
      [
        "bun",
        "run",
        "--output",
        `${root}/bench/results/releases/0.5.4`,
        "--baseline-root",
        "/srv/checkouts/xlsx-baseline",
        `SHEETWRITE_BENCH_ENGINE_ROOT=/srv/checkouts/sheetwrite-base`,
        `--cwd=${root}/bench`,
        "--baseline=/srv/checkouts/sheetwrite-base",
        root,
      ],
      root,
    ),
  ).toEqual([
    "bun",
    "run",
    "--output",
    "bench/results/releases/0.5.4",
    "--baseline-root",
    "<external>/xlsx-baseline",
    "SHEETWRITE_BENCH_ENGINE_ROOT=<external>/sheetwrite-base",
    "--cwd=bench",
    "--baseline=<external>/sheetwrite-base",
    ".",
  ]);
});
