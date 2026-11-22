import { describe, expect, it } from "bun:test";

import { changesetComparisonFromBaseRef, unpublishedChangesetPackages } from "./changeset-ci.js";

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
