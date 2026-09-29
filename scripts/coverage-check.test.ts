import { describe, expect, it } from "bun:test";
import {
  COVERAGE_SCHEMA_VERSION,
  type CoveragePolicy,
  type CoverageRecord,
  evaluateCoveragePolicy,
  filterRuntimeRecords,
  isCoverageContamination,
  mergeLcovRecords,
  normalizeRustCoverage,
  parseCoveragePolicy,
  parseLcov,
  scoredRuntimePaths,
} from "./coverage-check.js";

const ROOT = "/repo";

const POLICY: CoveragePolicy = {
  schemaVersion: COVERAGE_SCHEMA_VERSION,
  floors: {
    typescript: { lines: 90, functions: 80 },
    rust: { lines: 80, functions: 80, regions: 80 },
  },
  exclusions: [{ path: "packages/core/src/types.ts", reason: "Type-only module" }],
};

function record(
  path = "packages/core/src/document-protocol.ts",
  lines = { covered: 90, total: 100 },
): CoverageRecord {
  return {
    path,
    lines,
    functions: { covered: 17, total: 20 },
    uncoveredLines: Array.from({ length: lines.total - lines.covered }, (_, index) => index + 1),
  };
}

describe("LCOV parser", () => {
  it("normalizes repository paths and rejects a one-line malformed/non-finite counter", () => {
    const report = [
      "TN:",
      "SF:packages/core/src/grid.ts",
      "FNF:2",
      "FNH:1",
      "DA:10,2",
      "DA:11,0",
      "LF:2",
      "LH:1",
      "end_of_record",
    ].join("\n");
    expect(parseLcov(report, ROOT)[0]).toMatchObject({
      path: "packages/core/src/grid.ts",
      lines: { covered: 1, total: 2 },
      functions: { covered: 1, total: 2 },
      uncoveredLines: [11],
    });
    expect(() => parseLcov(report.replace("DA:11,0", "DA:11,NaN"), ROOT)).toThrow(
      "finite non-negative integer",
    );
  });

  it("merges sharded line hits while conservatively ratcheting function coverage", () => {
    const first = parseLcov(
      "SF:packages/core/src/grid.ts\nFNF:3\nFNH:1\nDA:10,2\nDA:11,0\nLF:2\nLH:1\nend_of_record",
      ROOT,
    );
    const second = parseLcov(
      "SF:packages/core/src/grid.ts\nFNF:4\nFNH:2\nDA:10,0\nDA:11,3\nDA:12,1\nLF:3\nLH:2\nend_of_record",
      ROOT,
    );
    expect(mergeLcovRecords([first, second])).toMatchObject([
      {
        path: "packages/core/src/grid.ts",
        lines: { covered: 3, total: 3 },
        functions: { covered: 2, total: 4 },
        uncoveredLines: [],
      },
    ]);
  });

  it("rejects duplicate source records and duplicate line counters", () => {
    const source = [
      "SF:packages/core/src/grid.ts",
      "FNF:0",
      "FNH:0",
      "DA:1,1",
      "LF:1",
      "LH:1",
      "end_of_record",
    ].join("\n");
    expect(() => parseLcov(`${source}\n${source}`, ROOT)).toThrow("Duplicate LCOV source record");
    expect(() => parseLcov(source.replace("DA:1,1", "DA:1,1\nDA:1,0"), ROOT)).toThrow(
      "Duplicate LCOV DA",
    );
  });

  it("fails closed on a missing terminator and counters inconsistent with DA", () => {
    expect(() => parseLcov("SF:packages/core/src/grid.ts\nDA:1,1", ROOT)).toThrow(
      "ended before end_of_record",
    );
    expect(() =>
      parseLcov(
        "SF:packages/core/src/grid.ts\nFNF:0\nFNH:0\nDA:1,1\nLF:2\nLH:1\nend_of_record",
        ROOT,
      ),
    ).toThrow("LF does not match");
  });
});

describe("scored source selection", () => {
  it("keeps adjacent runtime source while filtering dist/test/generated records", () => {
    const records = [
      record("packages/core/src/grid.ts"),
      record("packages/core/dist/grid.js"),
      record("packages/core/test/grid.test.ts"),
      record("packages/wasm/pkg/sheetwrite_wasm.js"),
    ];
    expect(
      filterRuntimeRecords(records, new Set(["packages/core/src/grid.ts"])).map(
        (item) => item.path,
      ),
    ).toEqual(["packages/core/src/grid.ts"]);
    expect(isCoverageContamination("packages/core/src/grid.ts")).toBe(false);
    expect(isCoverageContamination("packages/core/dist/grid.js")).toBe(true);
  });

  it("scores new runtime files automatically, skips exclusions, and rejects stale exclusions", () => {
    const scored = scoredRuntimePaths(POLICY, "typescript", [
      "packages/core/src/grid.ts",
      "packages/core/src/new-runtime.ts",
      "packages/core/src/types.ts",
    ]);
    expect([...scored]).toEqual(["packages/core/src/grid.ts", "packages/core/src/new-runtime.ts"]);
    expect(() => scoredRuntimePaths(POLICY, "typescript", ["packages/core/src/grid.ts"])).toThrow(
      "Coverage exclusion has no runtime source file: packages/core/src/types.ts",
    );
    expect([...scoredRuntimePaths(POLICY, "rust", ["packages/wasm/src/calc.rs"])]).toEqual([
      "packages/wasm/src/calc.rs",
    ]);
  });
});

describe("aggregate floors", () => {
  const scoredPaths = new Set(["packages/core/src/a.ts", "packages/core/src/b.ts"]);

  it("passes at the floor and fails one line below it, summing across files", () => {
    const fullyCovered = record("packages/core/src/a.ts", { covered: 100, total: 100 });
    const atFloor = [fullyCovered, record("packages/core/src/b.ts", { covered: 80, total: 100 })];
    expect(
      evaluateCoveragePolicy({
        policy: POLICY,
        language: "typescript",
        records: atFloor,
        scoredPaths,
      }),
    ).toEqual({ lines: { covered: 180, total: 200 }, functions: { covered: 34, total: 40 } });

    const belowFloor = [
      fullyCovered,
      record("packages/core/src/b.ts", { covered: 79, total: 100 }),
    ];
    expect(() =>
      evaluateCoveragePolicy({
        policy: POLICY,
        language: "typescript",
        records: belowFloor,
        scoredPaths,
      }),
    ).toThrow("typescript lines coverage 89.50% (179/200) is below the 90% floor");
  });

  it("fails when a scored source is missing from the report or generated output is scored", () => {
    expect(() =>
      evaluateCoveragePolicy({
        policy: POLICY,
        language: "typescript",
        records: [record("packages/core/src/a.ts", { covered: 100, total: 100 })],
        scoredPaths,
      }),
    ).toThrow("Coverage report is missing scored source: packages/core/src/b.ts");
    expect(() =>
      evaluateCoveragePolicy({
        policy: POLICY,
        language: "typescript",
        records: [record("packages/core/dist/grid.js")],
        scoredPaths: new Set(),
      }),
    ).toThrow("Generated/test output entered scored coverage");
  });

  it("enforces Rust region floors", () => {
    const rustRecord: CoverageRecord = {
      ...record("packages/wasm/src/calc.rs", { covered: 100, total: 100 }),
      functions: { covered: 10, total: 10 },
      regions: { covered: 79, total: 100 },
    };
    expect(() =>
      evaluateCoveragePolicy({
        policy: POLICY,
        language: "rust",
        records: [rustRecord],
        scoredPaths: new Set([rustRecord.path]),
      }),
    ).toThrow("rust regions coverage 79.00% (79/100) is below the 80% floor");
  });
});

describe("policy schema", () => {
  const valid = {
    schemaVersion: COVERAGE_SCHEMA_VERSION,
    floors: { typescript: { lines: 90, functions: 80 }, rust: { lines: 80, functions: 80 } },
    exclusions: [{ path: "packages/core/src/types.ts", reason: "Type-only module" }],
  };

  it("rejects unjustified exclusions, missing floors, and unsupported schema versions", () => {
    expect(() =>
      parseCoveragePolicy({
        ...valid,
        exclusions: [{ path: "packages/core/src/types.ts", reason: "" }],
      }),
    ).toThrow("reason must be non-empty");
    expect(() =>
      parseCoveragePolicy({ ...valid, floors: { ...valid.floors, rust: { lines: 80 } } }),
    ).toThrow("Coverage rust floor functions must be an integer percentage");
    expect(() => parseCoveragePolicy({ ...valid, schemaVersion: 2 })).toThrow(
      "Unsupported coverage policy schema version",
    );
  });

  it("fails closed on unknown policy, floor, and exclusion fields", () => {
    const cases = [
      { ...valid, typo: true },
      { ...valid, floors: { ...valid.floors, go: { lines: 1, functions: 1 } } },
      {
        ...valid,
        floors: { ...valid.floors, typescript: { lines: 90, functions: 80, statements: 90 } },
      },
      { ...valid, exclusions: [{ ...valid.exclusions[0], ticket: "SEC-1" }] },
    ];
    for (const value of cases) {
      expect(() => parseCoveragePolicy(value)).toThrow("unknown field");
    }
  });
});

describe("Rust LLVM normalization", () => {
  it("removes inline tests and ignores function sources excluded from the file report", () => {
    const lcov = parseLcov(
      [
        "SF:/repo/packages/wasm/src/calc.rs",
        "FNF:2",
        "FNH:2",
        "DA:1,3",
        "DA:2,0",
        "DA:3,2",
        "DA:4,1",
        "DA:5,1",
        "LF:5",
        "LH:4",
        "end_of_record",
      ].join("\n"),
      ROOT,
    );
    const llvm = {
      data: [
        {
          files: [{ filename: "/repo/packages/wasm/src/calc.rs" }],
          functions: [
            {
              name: "_RNv_prod",
              count: 3,
              filenames: [
                "/repo/packages/wasm/src/calc.rs",
                "/toolchain/rustlib/src/thread_local.rs",
              ],
              regions: [
                [1, 1, 1, 8, 3, 0, 0, 0],
                [2, 1, 3, 8, 0, 0, 0, 0],
              ],
            },
            {
              name: "_RNvNt_crate5tests_contract",
              count: 1,
              filenames: ["/repo/packages/wasm/src/calc.rs"],
              regions: [[4, 1, 5, 8, 1, 0, 0, 0]],
            },
          ],
        },
      ],
    };
    expect(normalizeRustCoverage(llvm, lcov, ROOT)).toEqual([
      {
        path: "packages/wasm/src/calc.rs",
        lines: { covered: 2, total: 3 },
        functions: { covered: 1, total: 1 },
        regions: { covered: 1, total: 2 },
        uncoveredLines: [2],
        lineCounts: new Map([
          [1, 3],
          [2, 0],
          [3, 2],
        ]),
      },
    ]);
  });

  it("rejects malformed/non-finite LLVM counters and JSON/LCOV source disagreement", () => {
    const lcov = parseLcov(
      "SF:/repo/packages/wasm/src/calc.rs\nFNF:0\nFNH:0\nDA:1,1\nLF:1\nLH:1\nend_of_record",
      ROOT,
    );
    const base = {
      data: [
        {
          files: [{ filename: "/repo/packages/wasm/src/calc.rs" }],
          functions: [
            {
              name: "prod",
              count: Number.NaN,
              filenames: ["/repo/packages/wasm/src/calc.rs"],
              regions: [[1, 1, 1, 2, 1, 0, 0, 0]],
            },
          ],
        },
      ],
    };
    expect(() => normalizeRustCoverage(base, lcov, ROOT)).toThrow("finite non-negative integer");
    expect(() =>
      normalizeRustCoverage(
        { data: [{ files: [{ filename: "/repo/packages/wasm/src/eval.rs" }], functions: [] }] },
        lcov,
        ROOT,
      ),
    ).toThrow("missing from LCOV");
  });
});
