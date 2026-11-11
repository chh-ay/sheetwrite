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
  const GRID = "SF:packages/core/src/grid.ts";
  const report = [GRID, "FNF:2", "FNH:1", "DA:10,2", "DA:11,0", "LF:2", "LH:1", "end_of_record"].join(
    "\n",
  );

  it("normalizes repository paths and counts uncovered lines", () => {
    expect(parseLcov(report, ROOT)[0]).toMatchObject({
      path: "packages/core/src/grid.ts",
      lines: { covered: 1, total: 2 },
      functions: { covered: 1, total: 2 },
      uncoveredLines: [11],
    });
  });

  it.each([
    ["a non-finite counter", report.replace("DA:11,0", "DA:11,NaN"), "finite non-negative integer"],
    ["a duplicate source record", `${report}\n${report}`, "Duplicate LCOV source record"],
    ["a duplicate line counter", report.replace("DA:11,0", "DA:11,0\nDA:11,1"), "Duplicate LCOV DA"],
    ["a missing terminator", `${GRID}\nDA:1,1`, "ended before end_of_record"],
    ["an LF that disagrees with DA", report.replace("LF:2", "LF:3"), "LF does not match"],
  ])("fails closed on %s", (_label, text, message) => {
    expect(() => parseLcov(text, ROOT)).toThrow(message);
  });

  it("merges sharded line hits while conservatively ratcheting function coverage", () => {
    const first = parseLcov(
      `${GRID}\nFNF:3\nFNH:1\nDA:10,2\nDA:11,0\nLF:2\nLH:1\nend_of_record`,
      ROOT,
    );
    const second = parseLcov(
      `${GRID}\nFNF:4\nFNH:2\nDA:10,0\nDA:11,3\nDA:12,1\nLF:3\nLH:2\nend_of_record`,
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

  it.each([
    [
      "an unjustified exclusion",
      { ...valid, exclusions: [{ path: "packages/core/src/types.ts", reason: "" }] },
      "reason must be non-empty",
    ],
    [
      "a missing floor",
      { ...valid, floors: { ...valid.floors, rust: { lines: 80 } } },
      "Coverage rust floor functions must be an integer percentage",
    ],
    ["an unsupported schema", { ...valid, schemaVersion: 2 }, "Unsupported coverage policy schema version"],
    ["an unknown policy field", { ...valid, typo: true }, "unknown field"],
    [
      "an unknown language",
      { ...valid, floors: { ...valid.floors, go: { lines: 1, functions: 1 } } },
      "unknown field",
    ],
    [
      "an unknown floor metric",
      { ...valid, floors: { ...valid.floors, typescript: { lines: 90, functions: 80, statements: 90 } } },
      "unknown field",
    ],
    [
      "an unknown exclusion field",
      { ...valid, exclusions: [{ ...valid.exclusions[0], ticket: "SEC-1" }] },
      "unknown field",
    ],
  ])("rejects %s", (_label, policy, message) => {
    expect(() => parseCoveragePolicy(policy)).toThrow(message);
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
