import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  isGeneratedPackageSizeHistoryChange,
  packageSizeHistoryVersionFromHeadRef,
  releaseVersionFromHeadRef,
  validateReleasePackageVersions,
} from "./changeset-ci.js";
import {
  PUBLISHABLE_PACKAGE_ORDER,
  TYPECHECK_NODES,
  validateWorkspaceGraph,
} from "./workspace-tooling.js";

const fixtureRoots: string[] = [];

async function graphFixture(extraPackage?: { readonly name: string; readonly build?: boolean }) {
  const root = await mkdtemp(join(tmpdir(), "sheetwrite-workspace-graph-"));
  fixtureRoots.push(root);
  await mkdir(join(root, "packages"), { recursive: true });
  await mkdir(join(root, "bench"), { recursive: true });
  await mkdir(join(root, "docs"), { recursive: true });
  const dependencies: Readonly<Record<string, readonly string[]>> = {
    "@sheetwrite/wasm": [],
    "@sheetwrite/formulas": [],
    "@sheetwrite/core": ["@sheetwrite/wasm"],
    "@sheetwrite/xlsx": ["@sheetwrite/core"],
    "@sheetwrite/react": ["@sheetwrite/core"],
    "@sheetwrite/vue": ["@sheetwrite/core"],
    "@sheetwrite/svelte": ["@sheetwrite/core"],
  };
  for (const name of PUBLISHABLE_PACKAGE_ORDER) {
    const directory = name.slice("@sheetwrite/".length);
    await mkdir(join(root, "packages", directory), { recursive: true });
    await writeFile(
      join(root, "packages", directory, "package.json"),
      `${JSON.stringify({
        name,
        publishConfig: { access: "public" },
        scripts: { build: "build", typecheck: "typecheck" },
        dependencies: Object.fromEntries(
          (dependencies[name] ?? []).map((item) => [item, "workspace:*"]),
        ),
      })}\n`,
    );
  }
  if (extraPackage) {
    const directory = extraPackage.name.slice("@sheetwrite/".length);
    await mkdir(join(root, "packages", directory), { recursive: true });
    await writeFile(
      join(root, "packages", directory, "package.json"),
      `${JSON.stringify({
        name: extraPackage.name,
        publishConfig: { access: "public" },
        scripts: {
          ...(extraPackage.build === false ? {} : { build: "build" }),
          typecheck: "typecheck",
        },
      })}\n`,
    );
  }
  await writeFile(
    join(root, "bench/package.json"),
    `${JSON.stringify({ name: "@sheetwrite/bench", scripts: { typecheck: "typecheck" } })}\n`,
  );
  await writeFile(
    join(root, "docs/package.json"),
    `${JSON.stringify({ name: "@sheetwrite/docs-start", scripts: { typecheck: "typecheck" } })}\n`,
  );
  return root;
}

afterEach(async () => {
  await Promise.all(
    fixtureRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("canonical workspace graph", () => {
  it("rejects an unlisted publishable workspace package", async () => {
    const root = await graphFixture({ name: "@sheetwrite/new-package" });
    expect(() => validateWorkspaceGraph(root)).toThrow("missing: @sheetwrite/new-package");
  });

  it("rejects a dependency order inversion", async () => {
    const root = await graphFixture();
    const reversed = [...PUBLISHABLE_PACKAGE_ORDER].reverse();
    expect(() => validateWorkspaceGraph(root, reversed)).toThrow("must run after its dependency");
  });

  it("covers every discovered workspace and verification typecheck exactly once", async () => {
    const root = resolve(import.meta.dir, "..");
    const rootManifest = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as {
      readonly workspaces: readonly string[];
      readonly scripts: Readonly<Record<string, string>>;
    };
    const workspaceNames: string[] = [];
    for (const workspace of rootManifest.workspaces) {
      const glob = new Bun.Glob(`${workspace}/package.json`);
      for await (const path of glob.scan({ cwd: root, onlyFiles: true })) {
        const workspaceManifest = JSON.parse(await readFile(join(root, path), "utf8")) as {
          readonly name?: string;
          readonly scripts?: Readonly<Record<string, string>>;
        };
        if (workspaceManifest.name && typeof workspaceManifest.scripts?.typecheck === "string") {
          workspaceNames.push(workspaceManifest.name);
        }
      }
    }

    for (const name of workspaceNames) {
      expect(TYPECHECK_NODES.filter((node) => node.id === `typecheck:${name}`)).toHaveLength(1);
    }

    const verificationProjects = Object.values(rootManifest.scripts).flatMap((command) => {
      const match = /\btsc\b.*(?:^|\s)-p\s+(\S+)/u.exec(command);
      return match?.[1] ? [match[1]] : [];
    });
    for (const project of verificationProjects) {
      expect(
        TYPECHECK_NODES.filter((node) =>
          node.command.some(
            (argument, index) => argument === "-p" && node.command[index + 1] === project,
          ),
        ),
      ).toHaveLength(1);
    }
    expect(TYPECHECK_NODES).toHaveLength(workspaceNames.length + verificationProjects.length);
  });
});

describe("changeset workspace contract", () => {
  it("resolves every configured ignore to an existing workspace", async () => {
    const root = resolve(import.meta.dir, "..");
    const rootManifest = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as {
      readonly workspaces: readonly string[];
    };
    const changesetConfig = JSON.parse(
      await readFile(join(root, ".changeset/config.json"), "utf8"),
    ) as {
      readonly ignore: readonly string[];
    };
    const workspaceNames = new Set<string>();
    for (const workspace of rootManifest.workspaces) {
      const glob = new Bun.Glob(`${workspace}/package.json`);
      for await (const path of glob.scan({ cwd: root, onlyFiles: true })) {
        const manifest = JSON.parse(await readFile(join(root, path), "utf8")) as {
          readonly name?: string;
        };
        if (manifest.name) workspaceNames.add(manifest.name);
      }
    }

    for (const ignore of changesetConfig.ignore) {
      const escaped = ignore.replace(/[.+^${}()|[\]\\]/g, "\\$&");
      const pattern = new RegExp(`^${escaped.replaceAll("*", ".*").replaceAll("?", ".")}$`);
      expect([...workspaceNames].some((name) => pattern.test(name))).toBeTrue();
    }
  });

  it("runs the release-aware Changesets status command", () => {
    expect(releaseVersionFromHeadRef("0.3.1")).toBe("0.3.1");
    expect(releaseVersionFromHeadRef("release/version-0.4.0")).toBe("0.4.0");
    expect(releaseVersionFromHeadRef("feature/docs")).toBeUndefined();
    expect(packageSizeHistoryVersionFromHeadRef("automation/package-size-history-0.3.1")).toBe(
      "0.3.1",
    );
    expect(packageSizeHistoryVersionFromHeadRef("automation/package-size-history-next")).toBe(
      undefined,
    );
    expect(
      isGeneratedPackageSizeHistoryChange([
        "docs/src/content/docs/guides/performance-resources.md",
        "scripts/size-history.json",
      ]),
    ).toBeTrue();
    expect(
      isGeneratedPackageSizeHistoryChange([
        "docs/src/content/docs/guides/performance-resources.md",
        "docs/src/generated/docs-contract.json",
        "scripts/size-history.json",
      ]),
    ).toBeTrue();
    expect(
      isGeneratedPackageSizeHistoryChange([
        "docs/src/content/docs/guides/performance-resources.md",
        "scripts/changeset-ci.ts",
        "scripts/size-history.json",
      ]),
    ).toBeFalse();
    expect(isGeneratedPackageSizeHistoryChange(["scripts/size-history.json"])).toBeFalse();
    expect(
      isGeneratedPackageSizeHistoryChange([
        "docs/src/content/docs/guides/performance-resources.md",
        "scripts/size-history.json",
        "scripts/size-history.json",
      ]),
    ).toBeFalse();
    expect(() => validateReleasePackageVersions("0.4.0")).not.toThrow();
    expect(() => validateReleasePackageVersions("0.4.1")).toThrow(
      "Release branch 0.4.1 requires @sheetwrite/wasm@0.4.1",
    );
    const root = resolve(import.meta.dir, "..");
    const result = Bun.spawnSync(["bun", "run", "changeset:ci"], {
      cwd: root,
      env: { ...process.env, GITHUB_HEAD_REF: "0.4.0" },
      stderr: "pipe",
      stdout: "pipe",
    });
    expect(result.exitCode, result.stderr.toString()).toBe(0);
    expect(result.stdout.toString()).toContain("Release package versions match branch 0.4.0");
  });
});
