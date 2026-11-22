import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export const BUN_VERSION = "1.4.4";
export const RUST_VERSION = "1.99.0";
export const NODE_VERSION = "26.12.1";
export const NPM_VERSION = "11.19.1";
export const WASM_TARGET = "wasm32-unknown-unknown";
export const CARGO_AUDIT_VERSION = "0.22.2";
export const CARGO_LLVM_COV_VERSION = "0.8.7";

/** Dependency order of the published packages: build, typecheck and publish all follow it. */
export const PUBLISHABLE_PACKAGE_ORDER = [
  "@sheetwrite/wasm",
  "@sheetwrite/formulas",
  "@sheetwrite/core",
  "@sheetwrite/xlsx",
  "@sheetwrite/queries",
  "@sheetwrite/charts",
  "@sheetwrite/formula-assist",
  "@sheetwrite/react",
  "@sheetwrite/vue",
  "@sheetwrite/svelte",
] as const;

/** One published package name. */
export type PublishablePackage = (typeof PUBLISHABLE_PACKAGE_ORDER)[number];

/** Publication position of a package name, or -1 for a name that is not published. */
export function publishableIndex(name: unknown): number {
  return PUBLISHABLE_PACKAGE_ORDER.findIndex((candidate) => candidate === name);
}

export interface CommandNode {
  readonly id: string;
  readonly command: readonly [string, ...string[]];
  readonly cwd?: string;
}

interface WorkspaceManifest {
  readonly name?: string;
  readonly publishConfig?: unknown;
  readonly scripts?: Readonly<Record<string, string>>;
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
  readonly peerDependencies?: Readonly<Record<string, string>>;
}

const package_node = (name: string, operation: "build" | "typecheck"): CommandNode => ({
  id: `${operation}:${name}`,
  command: ["bun", "run", "--filter", name, operation],
});

export const PACKAGE_BUILD_NODES: readonly CommandNode[] = PUBLISHABLE_PACKAGE_ORDER.map((name) =>
  package_node(name, "build"),
);

/** Builds a Rust crate the way `wasm-pack build` does. */
const cargo_release_node = (id: string, cwd: string, ...extra: string[]): CommandNode => ({
  id,
  command: ["cargo", "build", "--lib", "--release", "--target", WASM_TARGET, ...extra],
  cwd,
});

/**
 * The cargo builds inside the wasm-pack package builds. `build` runs them all
 * at once first, so their single-threaded link-time optimization stages
 * overlap; each wasm-pack build then finds its cargo output up to date. Each
 * command must stay equal to the one its wasm-pack build runs, or that build
 * compiles again (slower, but the output is the same). The full engine
 * (`@sheetwrite/formulas`) builds into its own target directory, so it does not
 * wait for the lock of the default engine's.
 */
export const RUST_BUILD_NODES: readonly CommandNode[] = [
  cargo_release_node("cargo:@sheetwrite/wasm", "packages/wasm"),
  cargo_release_node("cargo:@sheetwrite/wasm/history", "packages/wasm/history"),
  cargo_release_node(
    "cargo:@sheetwrite/formulas",
    "packages/wasm",
    "--features",
    "analysis",
    "--target-dir",
    "target/analysis",
  ),
  cargo_release_node("cargo:@sheetwrite/queries", "packages/queries/engine"),
];

const RUST_BUILD_NODE: CommandNode = {
  id: "build:rust",
  command: ["bun", "scripts/workspace-tooling.ts", "build-rust"],
};

/** Every package build: the Rust builds together, then each package in order. */
export const BUILD_NODES: readonly CommandNode[] = [RUST_BUILD_NODE, ...PACKAGE_BUILD_NODES];

export const PACKAGE_TYPECHECK_NODES: readonly CommandNode[] = PUBLISHABLE_PACKAGE_ORDER.map(
  (name) => package_node(name, "typecheck"),
);

/**
 * Files generated from repository sources instead of committed: the core
 * function table and the docs pages and data. Docs generation reads built
 * package declarations, so these run after the package build.
 */
const GENERATED_SOURCE_NODES: readonly CommandNode[] = [
  {
    id: "generate:function-metadata",
    command: ["bun", "run", "--filter", "@sheetwrite/core", "generate"],
  },
  {
    id: "generate:docs",
    command: ["bun", "run", "docs:generate"],
  },
];

/**
 * The docs build checks the docs, then generates them and builds the site.
 * It builds the browser-test fixture pages too, as CI's production docs job
 * does: the XLSX isolation check reads them.
 */
export const EXAMPLE_BUILD_NODES: readonly CommandNode[] = [
  {
    id: "build:@sheetwrite/docs",
    command: ["bun", "run", "--filter", "@sheetwrite/docs", "build:test"],
  },
  {
    id: "verify:example-xlsx-isolation",
    command: ["bun", "scripts/verify-example-xlsx-isolation.ts"],
  },
];

export const EXAMPLE_TYPECHECK_NODES: readonly CommandNode[] = [
  {
    id: "typecheck:@sheetwrite/docs",
    command: ["bun", "run", "--filter", "@sheetwrite/docs", "typecheck"],
  },
];

export const VERIFICATION_TYPECHECK_NODES: readonly CommandNode[] = [
  {
    id: "typecheck:verification",
    command: ["bunx", "tsc", "--noEmit", "-p", "tsconfig.verification.json"],
  },
  {
    id: "typecheck:consumer-nodenext",
    command: ["bunx", "tsc", "--noEmit", "-p", "test/consumer-nodenext"],
  },
];

export const BENCH_TYPECHECK_NODES: readonly CommandNode[] = [
  {
    id: "typecheck:@sheetwrite/bench",
    command: ["bun", "run", "--filter", "@sheetwrite/bench", "typecheck"],
  },
];

export const TYPECHECK_NODES: readonly CommandNode[] = [
  ...PACKAGE_TYPECHECK_NODES,
  ...BENCH_TYPECHECK_NODES,
  ...EXAMPLE_TYPECHECK_NODES,
  ...VERIFICATION_TYPECHECK_NODES,
];

/**
 * The test lists below own every repository test path. `test:tooling` (CI
 * preflight), `test:unit` and `verify-ci` run these nodes, so a suite added
 * here runs everywhere. CI runs `test:unit:uncovered` and `test:coverage:ts`
 * in separate jobs, which together run every unit suite once. Tooling suites run before any package is
 * built; unit suites run against built package outputs and generated files, so
 * a suite that loads the engine or generated docs data (directly or through
 * `docs/src/lib`) belongs there.
 * `workspace-tooling.test.ts` rejects a `scripts/*.test.ts` file that is in
 * neither list or in both.
 */
export const TOOLING_TEST_PATHS = [
  "scripts/toolchain-contract.test.ts",
  "scripts/workspace-tooling.test.ts",
  "scripts/dependency-audit.test.ts",
  "scripts/verify-clean-build.test.ts",
  "scripts/size-report.test.ts",
  "scripts/release-artifacts.test.ts",
  "scripts/package-dist.test.ts",
  "scripts/consumer-lock.test.ts",
  "scripts/release-verify.test.ts",
  "scripts/release-workflow.test.ts",
  "scripts/changeset-ci.test.ts",
  "scripts/workflow-contract.test.ts",
  "scripts/formula-docs.test.ts",
  "scripts/coverage-check.test.ts",
  "scripts/normalize-sitemap.test.ts",
  "scripts/docs-render-errors.test.ts",
  "scripts/prepare-docs-deployment.test.ts",
  "scripts/check-import-cycles.test.ts",
  "scripts/check-engine-exports.test.ts",
  "scripts/check-local-paths.test.ts",
  "scripts/check-path-case.test.ts",
  "scripts/verify-example-xlsx-isolation.test.ts",
  "scripts/wasm-function-sizes.test.ts",
  "scripts/wasm-relocations.test.ts",
  "scripts/snake-case-internals.test.ts",
] as const;

export const UNIT_TEST_PATHS = [
  "packages",
  "scripts/public-api.test.ts",
  "scripts/conformance.test.ts",
  "scripts/conformance-excel-runner.test.ts",
  "scripts/conformance-google.test.ts",
  "scripts/conformance-workbook-roundtrip.test.ts",
  "scripts/formula-contract.test.ts",
  "scripts/ci-paths.test.ts",
  "scripts/indexnow.test.ts",
  "scripts/release-github.test.ts",
  "scripts/docs.test.ts",
  "scripts/docs-llms.test.ts",
  "scripts/docs-feed.test.ts",
  // The hover engine reads the built @sheetwrite package declarations, as the site does.
  "scripts/sheetwrite-code-hovers.test.ts",
  "bench/test",
  "docs/test",
] as const;

/**
 * Package test directories that `test:coverage:ts` runs under coverage. CI
 * runs them only there, so no CI job runs them twice.
 */
export const COVERED_PACKAGE_TEST_ROOTS = [
  "packages/core/test",
  "packages/react/test",
  "packages/vue/test",
  "packages/svelte/test",
  "packages/xlsx/test",
  "packages/charts/test",
  "packages/formula-assist/test",
  "packages/queries/test",
] as const;

const TOOLING_TESTS: CommandNode = {
  id: "test:tooling-contracts",
  command: ["bun", "test", ...TOOLING_TEST_PATHS],
};

/** Unit suites import generated files, so they generate them first. */
const UNIT_TEST_NODES: readonly CommandNode[] = [
  ...GENERATED_SOURCE_NODES,
  {
    id: "test:unit",
    command: ["bun", "test", ...UNIT_TEST_PATHS],
  },
];

/**
 * The unit suites outside the coverage run: `UNIT_TEST_PATHS` with `packages`
 * narrowed to the package test directories that coverage does not run.
 */
function uncovered_unit_test_nodes(root: string): readonly CommandNode[] {
  const uncovered_package_tests = readdirSync(resolve(root, "packages"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `packages/${entry.name}/test`)
    .filter((path) => existsSync(resolve(root, path)))
    .filter((path) => !(COVERED_PACKAGE_TEST_ROOTS as readonly string[]).includes(path))
    .sort();
  const paths = UNIT_TEST_PATHS.flatMap((path) =>
    path === "packages" ? uncovered_package_tests : [path],
  );
  return [
    ...GENERATED_SOURCE_NODES,
    { id: "test:unit:uncovered", command: ["bun", "test", ...paths] },
  ];
}

const PRE_BUILD_VERIFICATION_NODES: readonly CommandNode[] = [
  TOOLING_TESTS,
  {
    id: "audit:javascript",
    command: ["bun", "scripts/dependency-audit.ts"],
  },
  {
    id: "test:rust",
    command: ["cargo", "test"],
    cwd: "packages/wasm",
  },
  {
    id: "test:rust:analysis",
    command: ["cargo", "test", "--features", "analysis"],
    cwd: "packages/wasm",
  },
  {
    id: "test:rust:history",
    command: ["cargo", "test", "--manifest-path", "packages/wasm/history/Cargo.toml"],
  },
  {
    id: "test:rust:queries",
    command: ["cargo", "test", "--manifest-path", "packages/queries/engine/Cargo.toml"],
  },
  {
    id: "lint:rust",
    command: ["bun", "run", "lint:rust"],
  },
  {
    id: "audit:rust",
    command: ["cargo", "audit"],
    cwd: "packages/wasm",
  },
  {
    id: "audit:rust:history",
    command: ["cargo", "audit"],
    cwd: "packages/wasm/history",
  },
  {
    id: "audit:rust:queries",
    command: ["cargo", "audit"],
    cwd: "packages/queries/engine",
  },
];

const POST_BUILD_QUALITY_NODES: readonly CommandNode[] = [
  {
    id: "verify:exports",
    command: ["bun", "scripts/verify-clean-build.ts", "--validate-current"],
  },
  ...TYPECHECK_NODES,
  {
    id: "lint",
    command: ["bun", "run", "lint"],
  },
  ...UNIT_TEST_NODES,
  ...EXAMPLE_BUILD_NODES,
  {
    id: "verify:node-esm",
    command: ["bun", "run", "verify:node-esm"],
  },
];

const PUBLIC_API_AND_BENCHMARK_NODES: readonly CommandNode[] = [
  {
    id: "verify:public-api",
    command: ["bun", "run", "api:check"],
  },
  {
    id: "verify:benchmarks",
    command: ["bun", "run", "--filter", "@sheetwrite/bench", "bench:verify"],
  },
];

export const RELEASE_QUALITY_NODES: readonly CommandNode[] = [
  ...PRE_BUILD_VERIFICATION_NODES,
  ...POST_BUILD_QUALITY_NODES,
  ...PUBLIC_API_AND_BENCHMARK_NODES,
];

export const VERIFY_CI_NODES: readonly CommandNode[] = [
  ...PRE_BUILD_VERIFICATION_NODES,
  ...BUILD_NODES,
  ...POST_BUILD_QUALITY_NODES,
  {
    id: "verify:naming",
    command: ["bun", "run", "naming:check"],
  },
  {
    id: "verify:packed",
    command: ["bun", "run", "verify:packed"],
  },
  {
    id: "verify:bundlers",
    command: ["bun", "run", "verify:bundlers"],
  },
  ...PUBLIC_API_AND_BENCHMARK_NODES,
  {
    id: "report:delivery-size",
    command: ["bun", "scripts/size-report.ts", "report", "--reuse-bundlers"],
  },
];

function read_manifest(path: string): WorkspaceManifest {
  return JSON.parse(readFileSync(path, "utf8")) as WorkspaceManifest;
}

function internal_dependencies(manifest: WorkspaceManifest): readonly string[] {
  return [
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.devDependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
  ].filter((name) => name.startsWith("@sheetwrite/"));
}

export function validateWorkspaceGraph(
  root: string,
  packageOrder: readonly string[] = PUBLISHABLE_PACKAGE_ORDER,
): void {
  const packages_root = resolve(root, "packages");
  const manifests = readdirSync(packages_root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => read_manifest(resolve(packages_root, entry.name, "package.json")));
  const package_manifests = new Map(
    manifests.flatMap((manifest) => (manifest.name ? [[manifest.name, manifest] as const] : [])),
  );
  const graph_set = new Set(packageOrder);
  if (graph_set.size !== packageOrder.length) {
    throw new Error("The publishable package graph contains a duplicate package");
  }

  const required = manifests
    .filter(
      (manifest) => manifest.publishConfig !== undefined || manifest.scripts?.build !== undefined,
    )
    .map((manifest) => manifest.name)
    .filter((name): name is string => name !== undefined)
    .sort();
  const missing = required.filter((name) => !graph_set.has(name));
  const unknown = packageOrder.filter((name) => !package_manifests.has(name));
  if (missing.length > 0 || unknown.length > 0) {
    throw new Error(
      `Canonical package graph mismatch (missing: ${missing.join(", ") || "none"}; unknown: ${unknown.join(", ") || "none"})`,
    );
  }

  for (const [index, name] of packageOrder.entries()) {
    const manifest = package_manifests.get(name);
    if (!manifest?.scripts?.build) {
      throw new Error(`${name} must declare a build script`);
    }
    if (!manifest.scripts.typecheck) {
      throw new Error(`${name} must declare a typecheck script`);
    }
    for (const dependency of internal_dependencies(manifest)) {
      const dependency_index = packageOrder.indexOf(dependency);
      if (dependency_index >= 0 && dependency_index >= index) {
        throw new Error(`${name} must run after its dependency ${dependency}`);
      }
    }
  }

  for (const relative_path of ["bench/package.json", "docs/package.json"]) {
    const manifest = read_manifest(resolve(root, relative_path));
    if (!manifest.scripts?.typecheck) {
      throw new Error(`${manifest.name ?? relative_path} must declare a typecheck script`);
    }
  }
}

export function assertUniqueOrderedNodes(nodes: readonly CommandNode[]): void {
  const ids = nodes.map((node) => node.id);
  if (new Set(ids).size !== ids.length) {
    throw new Error("The command graph contains a duplicate node");
  }
  const build_ids = PACKAGE_BUILD_NODES.map((node) => node.id);
  const positions = build_ids.map((id) => ids.indexOf(id));
  const present_builds = positions.filter((position) => position >= 0);
  if (present_builds.length > 0 && present_builds.length !== build_ids.length) {
    throw new Error("The command graph omits a package build node");
  }
  if (
    positions.some(
      (position, index) => position >= 0 && index > 0 && position <= (positions[index - 1] ?? -1),
    )
  ) {
    throw new Error("Package build nodes are not dependency ordered");
  }
}

async function execute_node(root: string, node: CommandNode): Promise<void> {
  console.log(`::workspace-node::${node.id}`);
  const child = Bun.spawn([...node.command], {
    cwd: resolve(root, node.cwd ?? "."),
    env: { ...process.env, CI: process.env.CI ?? "1" },
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  const exit_code = await child.exited;
  if (exit_code !== 0) throw new Error(`${node.id} failed with exit code ${exit_code}`);
}

export async function runNodes(root: string, nodes: readonly CommandNode[]): Promise<void> {
  assertUniqueOrderedNodes(nodes);
  for (const node of nodes) await execute_node(root, node);
}

/** Runs independent nodes at once and fails after all of them finish. */
async function run_concurrent_nodes(root: string, nodes: readonly CommandNode[]): Promise<void> {
  const results = await Promise.allSettled(nodes.map((node) => execute_node(root, node)));
  const failures = results.flatMap((result) =>
    result.status === "rejected" ? [String(result.reason)] : [],
  );
  if (failures.length > 0) throw new Error(failures.join("\n"));
}

function nodes_for_mode(mode: string, root: string): readonly CommandNode[] {
  switch (mode) {
    case "build":
      return BUILD_NODES;
    case "build-rust":
      return RUST_BUILD_NODES;
    case "build-examples":
      return EXAMPLE_BUILD_NODES;
    case "test-tooling":
      return [TOOLING_TESTS];
    case "test-unit":
      return UNIT_TEST_NODES;
    case "test-unit-uncovered":
      return uncovered_unit_test_nodes(root);
    case "generate":
      return GENERATED_SOURCE_NODES;
    case "typecheck-packages":
      return PACKAGE_TYPECHECK_NODES;
    case "typecheck":
      return TYPECHECK_NODES;
    case "verify-ci":
      return VERIFY_CI_NODES;
    case "verify-release-quality":
      return RELEASE_QUALITY_NODES;
    default:
      throw new Error(`Unknown workspace tooling mode: ${mode}`);
  }
}

export async function main(
  args: readonly string[],
  root = resolve(import.meta.dir, ".."),
): Promise<void> {
  const mode = args.find((argument) => !argument.startsWith("--"));
  if (!mode) throw new Error("A workspace tooling mode is required");
  validateWorkspaceGraph(root);
  const nodes = nodes_for_mode(mode, root);
  if (args.includes("--dry-run")) {
    for (const node of nodes) {
      console.log(
        `${node.id}\t${node.command.map((argument) => JSON.stringify(argument)).join(" ")}`,
      );
    }
    return;
  }
  if (mode === "build-rust") await run_concurrent_nodes(root, nodes);
  else await runNodes(root, nodes);
}

if (import.meta.main) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
