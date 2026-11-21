import { describe, expect, it } from "bun:test";

import { changesetComparisonFromBaseRef, unpublishedChangesetPackages } from "./changeset-ci.js";

describe("changeset comparison base", () => {
  it.each([
    ["0.4.0", "origin/0.4.0"],
    ["release/next", "origin/release/next"],
    ["", "origin/develop"],
    [undefined, "origin/develop"],
  ])("compares GITHUB_BASE_REF %p against %s", (githubBaseRef, baseRef) => {
    expect(changesetComparisonFromBaseRef(githubBaseRef)).toEqual({
      baseRef,
      diffRange: `${baseRef}...HEAD`,
      sinceArgument: `--since=${baseRef}`,
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
