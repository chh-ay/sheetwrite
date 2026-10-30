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

/** One line as `@changesets/changelog-github` writes it. */
function entry(pull: number, author: string, summary: string): string {
  return `- [#${pull}](https://github.com/chh-ay/sheetwrite/pull/${pull}) [\`${pull}0000\`](https://github.com/chh-ay/sheetwrite/commit/${pull}0000) Thanks [@${author}](https://github.com/${author})! - ${summary}`;
}

const provenance = entry(173, "chh-ay", "Publish each package with npm provenance.");
const pivots = `${entry(170, "chh-ay", "Add pivot tables.")}
  
  Pivot tables update when their source cells change.`;
const engineStart = entry(176, "alice", "Make the engine start faster.");
const dependencyUpdate = `- Updated dependencies [[\`1700000\`](https://github.com/chh-ay/sheetwrite/commit/1700000)]:
  - @sheetwrite/core@0.5.4`;

function changelog(name: string, groups: Readonly<Record<string, readonly string[]>>): string {
  const sections = Object.entries(groups).map(
    ([heading, entries]) => `### ${heading}\n\n${entries.join("\n")}\n`,
  );
  return `# ${name}\n\n## 0.5.4\n\n${sections.join("\n")}\n## 0.5.3\n\n### Patch Changes\n\n- 885b764: Older entry.\n`;
}

const changelogs: Readonly<Record<string, string>> = {
  "@sheetwrite/core": changelog("@sheetwrite/core", {
    "Minor Changes": [pivots],
    "Patch Changes": [provenance, dependencyUpdate],
  }),
  "@sheetwrite/wasm": changelog("@sheetwrite/wasm", {
    "Patch Changes": [
      entry(171, "alice", "Fix a rounding error in `ROUND`."),
      engineStart,
      provenance,
    ],
  }),
  // The same text from another changeset is another entry.
  "@sheetwrite/formulas": changelog("@sheetwrite/formulas", {
    "Patch Changes": [
      entry(175, "carol", "Fix a rounding error in `ROUND`."),
      engineStart,
      provenance,
    ],
  }),
  "@sheetwrite/xlsx": changelog("@sheetwrite/xlsx", {
    "Minor Changes": [dependencyUpdate],
    "Patch Changes": [provenance],
  }),
  "@sheetwrite/charts": changelog("@sheetwrite/charts", {
    "Patch Changes": [provenance, dependencyUpdate],
  }),
  "@sheetwrite/react": changelog("@sheetwrite/react", {
    "Patch Changes": [
      pivots,
      entry(172, "bob", "Keep focus in the grid after paste."),
      provenance,
      dependencyUpdate,
    ],
  }),
  "@sheetwrite/vue": changelog("@sheetwrite/vue", {
    "Patch Changes": [provenance, dependencyUpdate],
  }),
  "@sheetwrite/svelte": changelog("@sheetwrite/svelte", {
    "Patch Changes": [dependencyUpdate, provenance],
  }),
};

async function changelogFor(name: string): Promise<string> {
  const text = changelogs[name];
  if (text === undefined) throw new Error(`No fixture CHANGELOG for ${name}`);
  return text;
}

const expectedNotes = `## All packages

### Patch Changes

- Publish each package with npm provenance. (#173 by @chh-ay)

## @sheetwrite/core

### Minor Changes

- Add pivot tables. (#170 by @chh-ay)

  Pivot tables update when their source cells change.

  _Also in \`@sheetwrite/react\`._

## @sheetwrite/wasm

### Patch Changes

- Fix a rounding error in \`ROUND\`. (#171 by @alice)
- Make the engine start faster. (#176 by @alice)

  _Also in \`@sheetwrite/formulas\`._

## @sheetwrite/formulas

### Patch Changes

- Fix a rounding error in \`ROUND\`. (#175 by @carol)

## @sheetwrite/react

### Patch Changes

- Keep focus in the grid after paste. (#172 by @bob)

---

**Release notes:** https://www.sheetwrite.dev/docs/releases/0.5.4/

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
    if (tool === "git" && action === "tag" && rest[0] === "--list") {
      return result(0, [...this.tags.keys()].filter((tag) => tag.startsWith("v")).join("\n"));
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
      state.commands.filter(
        (command) => command[1] === "push" || (command[1] === "tag" && command[2] !== "--list"),
      ),
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
    ["creating", "create", false],
    ["updating", "edit", true],
  ])(
    "does not move Latest when %s the release of an older version",
    async (_label, verb, hasRelease) => {
      const state = new RepositoryState();
      state.tags.set("v0.10.0", olderCommit);
      if (hasRelease) state.releases.set("v0.5.4", { isDraft: false, isPrerelease: false });

      await release(state);

      const [command] = state.releaseCommands(verb);
      expect(command?.at(-1)).toBe("--latest=false");
      expect(command).not.toContain("--latest");
    },
  );

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
