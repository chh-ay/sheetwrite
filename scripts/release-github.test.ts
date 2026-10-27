import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  type CommandResult,
  type CommandRunner,
  ensureVersionRelease,
  type PackageReleaseIdentity,
  provenanceCommitFromAttestations,
} from "./release-github.js";
import { PUBLISHABLE_PACKAGE_ORDER } from "./workspace-tooling.js";

const sha = "a".repeat(40);
const olderCommit = "b".repeat(40);
const version = "0.5.4";

function result(exitCode: number, stdout = "", stderr = ""): CommandResult {
  return { exitCode, stdout, stderr };
}

const changelogs: Readonly<Record<string, string>> = {
  "@sheetwrite/core": `# @sheetwrite/core

## 0.5.4

### Minor Changes

- [#170](https://github.com/chh-ay/sheetwrite/pull/170) [\`1111111\`](https://github.com/chh-ay/sheetwrite/commit/1111111) Thanks [@chh-ay](https://github.com/chh-ay)! - Add pivot tables.
  
  Pivot tables update when their source cells change.

### Patch Changes

- Updated dependencies [[\`2222222\`](https://github.com/chh-ay/sheetwrite/commit/2222222)]:
  - @sheetwrite/wasm@0.5.4

## 0.5.3

### Patch Changes

- 885b764: Older entry.
`,
  "@sheetwrite/wasm": `# @sheetwrite/wasm

## 0.5.4

### Patch Changes

- [#171](https://github.com/chh-ay/sheetwrite/pull/171) [\`2222222\`](https://github.com/chh-ay/sheetwrite/commit/2222222) Thanks [@alice](https://github.com/alice)! - Fix a rounding error in \`ROUND\`.

## 0.5.3
`,
  "@sheetwrite/formulas": `# @sheetwrite/formulas

## 0.5.4

## 0.5.3
`,
  "@sheetwrite/react": `# @sheetwrite/react

## 0.5.4

### Patch Changes

- [#172](https://github.com/chh-ay/sheetwrite/pull/172) [\`3333333\`](https://github.com/chh-ay/sheetwrite/commit/3333333) Thanks [@bob](https://github.com/bob)! - Keep focus in the grid after paste.
- Updated dependencies [[\`1111111\`](https://github.com/chh-ay/sheetwrite/commit/1111111)]:
  - @sheetwrite/core@0.5.4

## 0.5.3
`,
};

/** xlsx, vue and svelte changed only because core changed. */
function changelogFor(name: string): Promise<string> {
  return Promise.resolve(
    changelogs[name] ??
      `# ${name}

## 0.5.4

### Patch Changes

- Updated dependencies [[\`1111111\`](https://github.com/chh-ay/sheetwrite/commit/1111111)]:
  - @sheetwrite/core@0.5.4

## 0.5.3
`,
  );
}

const expectedNotes = `## @sheetwrite/core

### Minor Changes

- Add pivot tables. (#170 by @chh-ay)

  Pivot tables update when their source cells change.

## @sheetwrite/wasm

### Patch Changes

- Fix a rounding error in \`ROUND\`. (#171 by @alice)

## @sheetwrite/react

### Patch Changes

- Keep focus in the grid after paste. (#172 by @bob)

---

**Release notes:** https://sheetwrite.vercel.app/docs/releases/0.5.4/

**Changes since 0.5.3:** https://github.com/chh-ay/sheetwrite/compare/@sheetwrite/core@0.5.3...v0.5.4
`;

interface GithubRelease {
  readonly isDraft: boolean;
  readonly isPrerelease: boolean;
}

/** Git tags and GitHub releases as the release job sees them. */
class RepositoryState {
  readonly commands: string[][] = [];
  readonly tags = new Map<string, string>();
  readonly releases = new Map<string, GithubRelease>();

  readonly runner: CommandRunner = async (command) => {
    this.commands.push([...command]);
    const [tool, action, ...rest] = command;
    if (tool === "git" && action === "rev-parse") {
      const tag = /^refs\/tags\/(.+)\^\{commit\}$/.exec(rest[1] ?? "")?.[1] ?? "";
      const commit = this.tags.get(tag);
      return commit === undefined ? result(1, "", "unknown revision") : result(0, commit);
    }
    if (tool === "git" && action === "tag") {
      this.tags.set(rest[0] ?? "", rest[1] ?? "");
      return result(0);
    }
    if (tool === "git" && action === "push") return result(0);
    if (tool === "gh" && action === "release") {
      const [verb, tag = ""] = rest;
      const release = this.releases.get(tag);
      if (verb === "view") {
        return release === undefined
          ? result(1, "", "release not found")
          : result(0, JSON.stringify({ tagName: tag, ...release }));
      }
      if (verb === "create") {
        this.releases.set(tag, { isDraft: false, isPrerelease: false });
        return result(0);
      }
      if (verb === "edit" && release !== undefined) return result(0);
    }
    throw new Error(`Unexpected command ${command.join(" ")}`);
  };

  releaseCommands(verb: string): string[][] {
    return this.commands.filter(
      (command) => command[0] === "gh" && command[1] === "release" && command[2] === verb,
    );
  }
}

const allPackages: readonly PackageReleaseIdentity[] = PUBLISHABLE_PACKAGE_ORDER.map((name) => ({
  name,
  version,
}));

function release(state: RepositoryState, attested = sha, published = allPackages) {
  return ensureVersionRelease(allPackages, published, sha, {
    runner: state.runner,
    provenance: async () => attested,
    readChangelog: changelogFor,
  });
}

describe("version GitHub release", () => {
  it("reads the immutable source commit from npm provenance", () => {
    const payload = Buffer.from(
      JSON.stringify({
        predicate: {
          buildDefinition: { resolvedDependencies: [{ digest: { gitCommit: sha } }] },
        },
      }),
    ).toString("base64");
    expect(
      provenanceCommitFromAttestations({
        attestations: [
          {
            predicateType: "https://slsa.dev/provenance/v1",
            bundle: { dsseEnvelope: { payload } },
          },
        ],
      }),
    ).toBe(sha);
  });

  it("publishes one Latest release per version, grouped by package from the CHANGELOGs", async () => {
    const state = new RepositoryState();

    expect(await release(state)).toBe("v0.5.4");

    expect(state.releaseCommands("create")).toEqual([
      [
        "gh",
        "release",
        "create",
        "v0.5.4",
        "--verify-tag",
        "--target",
        sha,
        "--title",
        "Sheetwrite 0.5.4",
        "--notes",
        expectedNotes,
        "--latest",
      ],
    ]);

    // Per-package tags stay for npm provenance; the release gets its own tag.
    expect(Object.fromEntries(state.tags)).toEqual({
      ...Object.fromEntries(PUBLISHABLE_PACKAGE_ORDER.map((name) => [`${name}@0.5.4`, sha])),
      "v0.5.4": sha,
    });
  });

  it("updates the existing release on a rerun instead of creating another", async () => {
    const state = new RepositoryState();
    for (const identity of allPackages) state.tags.set(`${identity.name}@${version}`, sha);
    state.tags.set("v0.5.4", sha);
    state.tags.set("v0.5.3", olderCommit);
    state.releases.set("v0.5.4", { isDraft: false, isPrerelease: false });

    expect(await release(state, sha, [])).toBe("v0.5.4");

    expect(state.releaseCommands("create")).toEqual([]);
    expect(
      state.commands.filter((command) => command[1] === "tag" || command[1] === "push"),
    ).toEqual([]);
    const notes = expectedNotes.replace("@sheetwrite/core@0.5.3...v0.5.4", "v0.5.3...v0.5.4");
    expect(state.releaseCommands("edit")).toEqual([
      [
        "gh",
        "release",
        "edit",
        "v0.5.4",
        "--title",
        "Sheetwrite 0.5.4",
        "--notes",
        notes,
        "--latest",
      ],
    ]);
  });

  it.each([
    ["a draft", { isDraft: true, isPrerelease: false }],
    ["a prerelease", { isDraft: false, isPrerelease: true }],
  ])("refuses to update %s", async (_label, existing) => {
    const state = new RepositoryState();
    state.releases.set("v0.5.4", existing);

    await expect(release(state)).rejects.toThrow("v0.5.4 has an invalid GitHub release state");
    expect(state.releaseCommands("edit")).toEqual([]);
  });

  it.each([
    ["a package tag", "@sheetwrite/core@0.5.4"],
    ["the version tag", "v0.5.4"],
  ])("fails closed when %s targets another commit", async (_label, tag) => {
    const state = new RepositoryState();
    state.tags.set(tag, olderCommit);

    await expect(release(state)).rejects.toThrow(`${tag} targets ${olderCommit}, expected ${sha}`);
    expect(state.releaseCommands("create")).toEqual([]);
  });

  it("only verifies package tags when this commit published nothing", async () => {
    const state = new RepositoryState();
    for (const identity of allPackages) state.tags.set(`${identity.name}@${version}`, olderCommit);

    expect(await release(state, olderCommit, [])).toBeUndefined();
    expect(
      state.commands.filter((command) => command[0] !== "git" || command[1] !== "rev-parse"),
    ).toEqual([]);

    // A package published from this commit must attest to it.
    await expect(release(new RepositoryState(), olderCommit)).rejects.toThrow(
      `@sheetwrite/wasm@0.5.4 provenance targets ${olderCommit}, expected ${sha}`,
    );
  });

  it("keeps every publishable package in one changeset version group", async () => {
    const config = JSON.parse(
      await readFile(resolve(import.meta.dir, "../.changeset/config.json"), "utf8"),
    ) as { readonly fixed: readonly (readonly string[])[]; readonly changelog: unknown };

    // One GitHub release names one version, so the packages cannot drift apart.
    expect(config.fixed.map((group) => [...group].sort())).toEqual([
      [...PUBLISHABLE_PACKAGE_ORDER].sort(),
    ]);
    // Entries need their pull request and author for the release notes.
    expect(config.changelog).toEqual([
      "@changesets/changelog-github",
      { repo: "chh-ay/sheetwrite" },
    ]);
  });
});
