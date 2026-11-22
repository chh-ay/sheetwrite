import { describe, expect, it } from "bun:test";

import {
  COVERAGE_SCHEMA_VERSION,
  type CoverageLanguage,
  type CoveragePolicy,
  type CoverageRecord,
  evaluateCoveragePolicy,
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

const GRID = "SF:packages/core/src/grid.ts";

describe("LCOV parser", () => {
  it("merges sharded line hits while conservatively ratcheting function coverage", () => {
    const first = parseLcov(
      `TN:\n${GRID}\nFNF:3\nFNH:1\nDA:10,2\nDA:11,0\nLF:2\nLH:1\nend_of_record`,
      ROOT,
    );
    expect(first[0]).toMatchObject({ lines: { covered: 1, total: 2 }, uncoveredLines: [11] });
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

  const valid = `${GRID}\nFNF:0\nFNH:0\nDA:1,1\nLF:1\nLH:1\nend_of_record`;
  it.each([
    ["a non-finite counter", valid.replace("DA:1,1", "DA:1,NaN"), "finite non-negative integer"],
    ["a duplicate source record", `${valid}\n${valid}`, "Duplicate LCOV source record"],
    ["a duplicate line counter", valid.replace("DA:1,1", "DA:1,1\nDA:1,0"), "Duplicate LCOV DA"],
    ["a missing terminator", `${GRID}\nDA:1,1`, "ended before end_of_record"],
    ["a line total inconsistent with DA", valid.replace("LF:1", "LF:2"), "LF does not match"],
  ])("fails closed on %s", (_label, report, message) => {
    expect(() => parseLcov(report, ROOT)).toThrow(message);
  });
});

describe("coverage floors", () => {
  const scored_paths = new Set(["packages/core/src/a.ts", "packages/core/src/b.ts"]);
  const fully_covered = record("packages/core/src/a.ts", { covered: 100, total: 100 });
  const evaluate = (
    records: CoverageRecord[],
    paths = scored_paths,
    language: CoverageLanguage = "typescript",
  ) => evaluateCoveragePolicy({ policy: POLICY, language, records, scoredPaths: paths });

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
  });

  it("passes at the floor and fails one line below it, summing across files", () => {
    const at_floor = [fully_covered, record("packages/core/src/b.ts", { covered: 80, total: 100 })];
    expect(evaluate(at_floor)).toEqual({
      lines: { covered: 180, total: 200 },
      functions: { covered: 34, total: 40 },
    });
    const below_floor = [
      fully_covered,
      record("packages/core/src/b.ts", { covered: 79, total: 100 }),
    ];
    expect(() => evaluate(below_floor)).toThrow(
      "typescript lines coverage 89.50% (179/200) is below the 90% floor",
    );
  });

  it("fails on a missing scored source, scored generated output, and a Rust region floor", () => {
    expect(() => evaluate([fully_covered])).toThrow(
      "Coverage report is missing scored source: packages/core/src/b.ts",
    );
    expect(() => evaluate([record("packages/core/dist/grid.js")], new Set())).toThrow(
      "Generated/test output entered scored coverage",
    );
    const rust: CoverageRecord = {
      ...record("packages/wasm/src/calc.rs", { covered: 100, total: 100 }),
      functions: { covered: 10, total: 10 },
      regions: { covered: 79, total: 100 },
    };
    expect(() => evaluate([rust], new Set([rust.path]), "rust")).toThrow(
      "rust regions coverage 79.00% (79/100) is below the 80% floor",
    );
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
      { ...valid, exclusions: [{ ...valid.exclusions[0], reason: "" }] },
      "reason must be non-empty",
    ],
    [
      { ...valid, floors: { ...valid.floors, rust: { lines: 80 } } },
      "Coverage rust floor functions must be an integer percentage",
    ],
    [{ ...valid, schemaVersion: 2 }, "Unsupported coverage policy schema version"],
    [{ ...valid, typo: true }, "unknown field"],
    [{ ...valid, floors: { ...valid.floors, go: { lines: 1, functions: 1 } } }, "unknown field"],
    [
      {
        ...valid,
        floors: { ...valid.floors, typescript: { lines: 90, functions: 80, statements: 90 } },
      },
      "unknown field",
    ],
    [{ ...valid, exclusions: [{ ...valid.exclusions[0], ticket: "SEC-1" }] }, "unknown field"],
  ])("rejects policy %#", (value, message) => {
    expect(() => parseCoveragePolicy(value)).toThrow(message);
  });
});

describe("Rust LLVM normalization", () => {
  it("removes inline tests and ignores function sources excluded from the file report", () => {
    const lcov = parseLcov(
      "SF:/repo/packages/wasm/src/calc.rs\nFNF:2\nFNH:2\nDA:1,3\nDA:2,0\nDA:3,2\nDA:4,1\nDA:5,1\nLF:5\nLH:4\nend_of_record",
      ROOT,
    );
    const llvm = (prod_count: number) => ({
      data: [
        {
          files: [{ filename: "/repo/packages/wasm/src/calc.rs" }],
          functions: [
            {
              name: "_RNv_prod",
              count: prod_count,
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
    });
    expect(normalizeRustCoverage(llvm(3), lcov, ROOT)).toEqual([
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
    expect(() => normalizeRustCoverage(llvm(Number.NaN), lcov, ROOT)).toThrow(
      "finite non-negative integer",
    );
    expect(() =>
      normalizeRustCoverage(
        { data: [{ files: [{ filename: "/repo/packages/wasm/src/eval.rs" }], functions: [] }] },
        lcov,
        ROOT,
      ),
    ).toThrow("missing from LCOV");
  });
});
