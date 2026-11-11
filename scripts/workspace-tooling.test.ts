import { afterEach, describe, expect, it } from "bun:test";
import { existsSync } from "node:fs";
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
  BUILD_NODES,
  COVERED_PACKAGE_TEST_ROOTS,
  PUBLISHABLE_PACKAGE_ORDER,
  RUST_BUILD_NODES,
  TOOLING_TEST_PATHS,
  TYPECHECK_NODES,
  UNIT_TEST_PATHS,
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
    "@sheetwrite/charts": ["@sheetwrite/core"],
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
    const nodeProjects = TYPECHECK_NODES.flatMap((node) => {
      const index = node.command.indexOf("-p");
      return index >= 0 ? [node.command[index + 1] ?? ""] : [];
    });
    expect(nodeProjects.filter((project) => !existsSync(join(root, project)))).toEqual([]);
    expect(new Set(nodeProjects).size).toBe(nodeProjects.length);
    expect(TYPECHECK_NODES).toHaveLength(workspaceNames.length + nodeProjects.length);
  });

  it("runs every script test suite from exactly one test list", async () => {
    const root = resolve(import.meta.dir, "..");
    const listed: readonly string[] = [...TOOLING_TEST_PATHS, ...UNIT_TEST_PATHS];
    const suites: string[] = [];
    for await (const path of new Bun.Glob("scripts/*.test.ts").scan({ cwd: root })) {
      suites.push(path);
    }

    expect(listed.filter((path, index) => listed.indexOf(path) !== index)).toEqual([]);
    expect(suites.filter((suite) => !listed.includes(suite)).sort()).toEqual([]);
    expect(listed.filter((path) => !existsSync(join(root, path)))).toEqual([]);
  });

  it("runs every unit suite in CI once, either uncovered or under coverage", async () => {
    const root = resolve(import.meta.dir, "..");
    const result = Bun.spawnSync(
      ["bun", "scripts/workspace-tooling.ts", "test-unit-uncovered", "--dry-run"],
      { cwd: root, stdout: "pipe", stderr: "pipe" },
    );
    expect(result.exitCode, result.stderr.toString()).toBe(0);
    const command = result.stdout
      .toString()
      .split("\n")
      .map((line) => line.split("\t"))
      .find(([id]) => id === "test:unit:uncovered")?.[1];
    if (command === undefined)
      throw new Error("test-unit-uncovered has no test:unit:uncovered node");
    const paths = command
      .split(" ")
      .slice(2)
      .map((argument) => JSON.parse(argument) as string);

    const packageTestDirectories: string[] = [];
    for await (const path of new Bun.Glob("packages/*/test").scan({
      cwd: root,
      onlyFiles: false,
    })) {
      packageTestDirectories.push(path);
    }
    const packageRuns = [
      ...paths.filter((path) => path.startsWith("packages/")),
      ...COVERED_PACKAGE_TEST_ROOTS,
    ];
    expect(packageRuns.sort()).toEqual(packageTestDirectories.sort());
    expect(paths.filter((path) => !path.startsWith("packages/"))).toEqual(
      UNIT_TEST_PATHS.filter((path) => path !== "packages"),
    );
  });

  it("runs one cargo build up front for each wasm-pack package build", async () => {
    const root = resolve(import.meta.dir, "..");
    const wasmPackBuilds: string[] = [];
    for await (const path of new Bun.Glob("packages/*/package.json").scan({ cwd: root })) {
      const manifest = JSON.parse(await readFile(join(root, path), "utf8")) as {
        readonly scripts?: { readonly build?: string };
      };
      for (const command of manifest.scripts?.build?.split("&&") ?? []) {
        if (command.includes("wasm-pack build")) wasmPackBuilds.push(command.trim());
      }
    }

    expect(BUILD_NODES[0]?.command).toEqual(["bun", "scripts/workspace-tooling.ts", "build-rust"]);
    expect(RUST_BUILD_NODES).toHaveLength(wasmPackBuilds.length);
    // The full engine's wasm-pack build uses the target directory its cargo build fills.
    expect(wasmPackBuilds).toContain(
      "CARGO_TARGET_DIR=../wasm/target/analysis wasm-pack build ../wasm --target web --out-dir ../formulas/pkg -- --features analysis",
    );
    const formulas = RUST_BUILD_NODES.find((node) => node.id === "cargo:@sheetwrite/formulas");
    expect(formulas?.cwd).toBe("packages/wasm");
    expect(formulas?.command.slice(-4)).toEqual([
      "--features",
      "analysis",
      "--target-dir",
      "target/analysis",
    ]);
  });
});

describe("changeset workspace contract", () => {
  it("routes release and package-size-history branches", () => {
    expect(releaseVersionFromHeadRef("0.3.1")).toBe("0.3.1");
    expect(releaseVersionFromHeadRef("release/version-0.4.0")).toBe("0.4.0");
    expect(releaseVersionFromHeadRef("feature/docs")).toBeUndefined();
    expect(packageSizeHistoryVersionFromHeadRef("automation/package-size-history-0.3.1")).toBe(
      "0.3.1",
    );
    expect(packageSizeHistoryVersionFromHeadRef("automation/package-size-history-next")).toBe(
      undefined,
    );
    expect(isGeneratedPackageSizeHistoryChange(["scripts/size-history.json"])).toBeTrue();
    expect(
      isGeneratedPackageSizeHistoryChange([
        "scripts/size-history.json",
        "scripts/size-report.json",
      ]),
    ).toBeTrue();
    expect(
      isGeneratedPackageSizeHistoryChange(["scripts/changeset-ci.ts", "scripts/size-history.json"]),
    ).toBeFalse();
    // The docs build renders the landing data, so a branch committing it needs a changeset.
    expect(
      isGeneratedPackageSizeHistoryChange([
        "docs/src/generated/landing-bench.json",
        "scripts/size-history.json",
      ]),
    ).toBeFalse();
    expect(isGeneratedPackageSizeHistoryChange(["scripts/size-report.json"])).toBeFalse();
    expect(
      isGeneratedPackageSizeHistoryChange([
        "scripts/size-history.json",
        "scripts/size-history.json",
      ]),
    ).toBeFalse();
  });

  it("requires every publishable package to match the release branch version", async () => {
    const root = await mkdtemp(join(tmpdir(), "sheetwrite-release-versions-"));
    fixtureRoots.push(root);
    const writeVersions = async (versionOf: (name: string) => string) => {
      for (const name of PUBLISHABLE_PACKAGE_ORDER) {
        const directory = join(root, "packages", name.slice("@sheetwrite/".length));
        await mkdir(directory, { recursive: true });
        await writeFile(
          join(directory, "package.json"),
          JSON.stringify({ name, version: versionOf(name) }),
        );
      }
    };

    await writeVersions(() => "7.8.9");
    expect(() => validateReleasePackageVersions("7.8.9", root)).not.toThrow();
    expect(() => validateReleasePackageVersions("7.8.10", root)).toThrow("7.8.10");
    const last = PUBLISHABLE_PACKAGE_ORDER.at(-1)!;
    await writeVersions((name) => (name === last ? "7.8.8" : "7.8.9"));
    expect(() => validateReleasePackageVersions("7.8.9", root)).toThrow(last);

    // The CLI takes the release shortcut for the checkout's own version.
    const repository = resolve(import.meta.dir, "..");
    const { version } = JSON.parse(
      await readFile(join(repository, "packages/core/package.json"), "utf8"),
    ) as { version: string };
    const result = Bun.spawnSync(["bun", "run", "changeset:ci"], {
      cwd: repository,
      env: { ...process.env, GITHUB_HEAD_REF: version },
      stderr: "pipe",
      stdout: "pipe",
    });
    expect(result.exitCode, result.stderr.toString()).toBe(0);
  });
});
