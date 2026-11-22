import { describe, expect, it } from "bun:test";

import {
  changesetComparisonFromBaseRef,
  changesetRequired,
  unpublishedChangesetPackages,
} from "./changeset-ci.js";

describe("changeset comparison base", () => {
  it.each([
    ["0.4.0", "origin/0.4.0"],
    ["release/next", "origin/release/next"],
    ["", "origin/develop"],
    [undefined, "origin/develop"],
  ])("compares GITHUB_BASE_REF %p against %s", (github_base_ref, base_ref) => {
    expect(changesetComparisonFromBaseRef(github_base_ref)).toEqual({
      baseRef: base_ref,
      diffRange: `${base_ref}...HEAD`,
      sinceArgument: `--since=${base_ref}`,
    });
  });
});

describe("changeset packages", () => {
  it("names the private packages a changeset would release", () => {
    const changeset = (lines: string) => `---\n${lines}\n---\n\nSummary.\n`;
    expect(
      unpublishedChangesetPackages(
        changeset(`"@sheetwrite/core": patch\n"@sheetwrite/bench": minor`),
      ),
    ).toEqual(["@sheetwrite/bench"]);
    expect(unpublishedChangesetPackages(changeset(`"@sheetwrite/core": minor`))).toEqual([]);
    expect(unpublishedChangesetPackages("---\n---\n")).toEqual([]);
  });
});

describe("changeset requirement", () => {
  it.each([
    "packages/core/src/grid.ts",
    "packages/core/src/testing.ts",
    "packages/core/styles/grid.css",
    "packages/core/package.json",
    "packages/wasm/src/calc.rs",
    "packages/wasm/Cargo.toml",
    "packages/wasm/history/src/lib.rs",
    "packages/queries/engine/src/csv.rs",
  ])("requires a changeset for published package source %p", (path) => {
    expect(changesetRequired([path])).toBe(true);
    expect(changesetRequired(["packages/core/test/grid.test.ts", path])).toBe(true);
  });

  it.each([
    "packages/core/test/grid.test.ts",
    "packages/core/test/panel-loading-probe.ts",
    "packages/core/test/wasm-loader.test.mjs",
    "packages/react/test/index.test.tsx",
    "packages/xlsx/test/fixtures/external-case-mapping.json",
    "packages/wasm/src/tests/functions.rs",
    "packages/wasm/src/move_tests.rs",
    "packages/queries/engine/src/csv/tests.rs",
    "packages/wasm/tests/regex_memory.rs",
    "packages/formula-assist/bench/enron/build.ts",
    "packages/formulas/README.md",
    "bench/src/formula-bench.ts",
    "bench/test/reader-gate.test.ts",
    "scripts/excel-checks-read.ts",
    "scripts/rust-lint-baseline.json",
    "test/browser/vanilla-workbench.spec.ts",
    "test/fixtures/excel-checks/people.csv",
    "docs/src/routes/index.tsx",
    "docs/contributing/rust.md",
    ".github/workflows/ci.yml",
    ".changeset/core-grid.md",
    "CONTRIBUTING.md",
  ])("needs no changeset when only %p changes", (path) => {
    expect(changesetRequired([path])).toBe(false);
  });

  it("needs no changeset when nothing changed", () => {
    expect(changesetRequired([])).toBe(false);
  });
});
