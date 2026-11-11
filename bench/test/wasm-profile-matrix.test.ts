import { expect, it } from "bun:test";

import { decideWasmProfile, parseWasmProfileMatrix } from "../src/wasm-profile-matrix.js";

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
