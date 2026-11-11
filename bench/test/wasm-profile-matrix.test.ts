import { expect, it } from "bun:test";

import { decideWasmProfile, parseWasmProfileMatrix } from "../src/wasm-profile-matrix.js";
import { expectRejections, must } from "./gate-fixtures.js";

const HASH = {
  input: "a".repeat(64),
  runner: "b".repeat(64),
  tool: "c".repeat(64),
  stdout: "e".repeat(64),
  stderr: "f".repeat(64),
} as const;
const COMMIT = "1".repeat(40);

function gate(wasmSha256: string, commands: string[][]) {
  return {
    status: "passed",
    commands,
    exitCode: 0,
    artifactPath: `bench/results/candidate-${wasmSha256.slice(0, 8)}.json`,
    evidenceSha256: wasmSha256,
    wasmSha256,
    commit: COMMIT,
    runnerFingerprint: HASH.runner,
  };
}

function fixture() {
  const variants = [
    ["-O3", 1_000, 500, 400, "2"],
    ["-Os", 950, 480, 390, "3"],
    ["-Oz", 900, 470, 380, "4"],
  ].map(([wasmOpt, rawBytes, gzipBytes, brotliBytes, hash]) => {
    const sha256 = String(hash).repeat(64);
    return {
      wasmOpt: String(wasmOpt),
      inputWasmSha256: HASH.input,
      artifact: { rawBytes, gzipBytes, brotliBytes, sha256 },
      formulaGate: gate(sha256, [["bun", "run", "bench:formula"]]),
      renderGate: gate(sha256, [
        ["bun", "run", "bench:render"],
        ["bun", "run", "bench:check"],
      ]),
    };
  });
  const blocker = (id: string, owner: string, dependency: string, reason: string) => ({
    id,
    kind: "dependency-cycle",
    owner,
    dependency,
    reason,
  });
  return {
    schemaVersion: 1,
    protocol: "wasm-post-link-profile-matrix-v1",
    provenance: {
      commit: COMMIT,
      dirty: false,
      timestamp: "2026-08-09T12:00:00.000Z",
      host: "controlled-host",
      rustc: "rustc 1.90.0",
      cargo: "cargo 1.90.0",
      wasmPack: "wasm-pack 0.13.1",
      wasmOptVersion: "wasm-opt version 123",
      wasmOptSha256: HASH.tool,
      bun: "1.3.14",
    },
    rustProfile: { optLevel: 3, lto: "fat", codegenUnits: 1 },
    postLink: {
      inputWasmSha256: HASH.input,
      compression: { gzipLevel: 9, brotliQuality: 11, brotliMode: "generic" },
    },
    decisionPolicy: {
      sizeMetric: "brotliBytes",
      requireFormulaGate: true,
      requireRenderGate: true,
    },
    captureOrder: { formula: ["-O3", "-Oz", "-Os"], render: ["-Os", "-O3", "-Oz"] },
    variants,
    storeOnlyProbe: {
      provenance: { commit: COMMIT, dirty: false, timestamp: "2026-08-09T12:01:00.000Z" },
      command: [
        ...["cargo", "check", "--target", "wasm32-unknown-unknown"],
        ...["--no-default-features", "--message-format=json"],
      ],
      outcome: "blocked",
      exitCode: 101,
      stdoutSha256: HASH.stdout,
      stderrSha256: HASH.stderr,
      blockers: [
        blocker(
          "formula-entry-ast",
          "types::FormulaEntry::ast",
          "calc::Ast",
          "stored syntax crosses the boundary",
        ),
        blocker(
          "dependency-index",
          "graph::FormulaGraph::index",
          "eval::DepIndex",
          "dependency state crosses the boundary",
        ),
      ],
    },
  };
}
type Fixture = ReturnType<typeof fixture>;
const variant = (evidence: Fixture, index: number) =>
  must(evidence.variants[index], `variant ${index}`);

it("keeps Rust opt-level separate and selects by the declared Brotli policy", () => {
  const parsed = parseWasmProfileMatrix(fixture());
  expect(parsed.rustProfile.optLevel).toBe(3);
  expect(parsed.variants.map(({ wasmOpt }) => wasmOpt)).toEqual(["-O3", "-Os", "-Oz"]);
  expect(decideWasmProfile(parsed)).toEqual({
    status: "recommended",
    wasmOpt: "-Oz",
    baseline: "-O3",
    savedBytes: { raw: 100, gzip: 30, brotli: 20 },
  });
});

it("rejects unshared inputs, non-gating commands, opted-out gates and unmatched provenance", () => {
  expectRejections(fixture, parseWasmProfileMatrix, [
    [
      "shared input",
      (evidence) => (variant(evidence, 1).inputWasmSha256 = "9".repeat(64)),
      "-Os did not use the shared pre-post-link artifact",
    ],
    [
      "preliminary formula",
      (evidence) =>
        (variant(evidence, 0).formulaGate.commands = [
          ["bun", "run", "bench:formula", "--preliminary"],
        ]),
      "must run the gating formula benchmark",
    ],
    [
      "report-only render",
      (evidence) =>
        must(variant(evidence, 0).renderGate.commands[1], "check command").push("--report-only"),
      "must run the render capture and fail-closed check",
    ],
    [
      "render gate opt-out",
      (evidence) => (evidence.decisionPolicy.requireRenderGate = false),
      "decisionPolicy.requireRenderGate must be true",
    ],
    ["dirty", (evidence) => (evidence.provenance.dirty = true), "provenance.dirty must be false"],
    [
      "runner",
      (evidence) => (variant(evidence, 2).renderGate.runnerFingerprint = "9".repeat(64)),
      "renderGate runner provenance is incomparable",
    ],
  ]);
});

it("blocks the decision on any failed gate or an unclassified compile probe failure", () => {
  for (const [edit, failure] of [
    [
      (evidence: Fixture) =>
        Object.assign(variant(evidence, 2).formulaGate, { status: "failed", exitCode: 1 }),
      "-Oz formula gate failed",
    ],
    [
      (evidence: Fixture) =>
        Object.assign(variant(evidence, 1).renderGate, { status: "failed", exitCode: 1 }),
      "-Os render gate failed",
    ],
    [
      (evidence: Fixture) =>
        Object.assign(evidence.storeOnlyProbe, { outcome: "failed", blockers: [] }),
      "store-only compile probe failed without a classified outcome",
    ],
  ] as const) {
    const evidence = fixture();
    edit(evidence);
    expect(decideWasmProfile(evidence)).toEqual({ status: "blocked", failures: [failure] });
  }
});
