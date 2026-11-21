import { describe, expect, it } from "bun:test";

import { changesetComparisonFromBaseRef, unpublishedChangesetPackages } from "./changeset-ci.js";

const CASES = [
  { githubBaseRef: "0.4.0", expectedBaseRef: "origin/0.4.0" },
  { githubBaseRef: "develop", expectedBaseRef: "origin/develop" },
  { githubBaseRef: "release/next", expectedBaseRef: "origin/release/next" },
  { githubBaseRef: "", expectedBaseRef: "origin/develop" },
  { githubBaseRef: undefined, expectedBaseRef: "origin/develop" },
] as const;

describe("changeset comparison base", () => {
  for (const { githubBaseRef, expectedBaseRef } of CASES) {
    it(`uses ${expectedBaseRef} for ${githubBaseRef ?? "an absent GITHUB_BASE_REF"}`, () => {
      expect(changesetComparisonFromBaseRef(githubBaseRef)).toEqual({
        baseRef: expectedBaseRef,
        diffRange: `${expectedBaseRef}...HEAD`,
        sinceArgument: `--since=${expectedBaseRef}`,
      });
    });
  }
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
