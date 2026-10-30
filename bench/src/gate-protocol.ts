import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { cpus, release } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { DEFAULT_SEED } from "./dataset.js";
import { RENDER_PROTOCOL_VERSION } from "./render-protocol.js";
import type { Stat } from "./stats.js";
import { summarize } from "./stats.js";

export const PERFORMANCE_GATE_PROTOCOL_VERSION = 1 as const;
/** Data v2 uses full GC and a fresh document between ingest samples. */
export const DATA_GATE_PROTOCOL_VERSION = 2 as const;
export type BenchmarkMode = "full" | "smoke";

export const MATRIX_IDS = {
  // v2: every timed data sample runs after a forced full GC, so v1 numbers are
  // a different sampling method and must never be compared with v2 numbers.
  data: {
    full: "data-full-v2",
    smoke: "data-smoke-v2",
  },
  paged: {
    full: "paged-full-v1",
    smoke: "paged-smoke-v1",
  },
  range: {
    full: "range-full-v1",
    smoke: "range-smoke-v1",
  },
  formula: {
    full: "formula-full-v1",
    smoke: "formula-smoke-v1",
  },
  render: {
    full: "render-full-v1",
    smoke: "render-smoke-v1",
  },
} as const;

export interface GateIdentity<
  ProtocolVersion extends
    | typeof PERFORMANCE_GATE_PROTOCOL_VERSION
    | typeof DATA_GATE_PROTOCOL_VERSION = typeof PERFORMANCE_GATE_PROTOCOL_VERSION,
> {
  readonly protocolVersion: ProtocolVersion;
  readonly mode: BenchmarkMode;
  readonly matrixId: string;
}

export interface MatrixValidation {
  readonly expectedKeys: readonly string[];
  readonly observedKeys: readonly string[];
  readonly missingKeys: readonly string[];
  readonly duplicateKeys: readonly string[];
  readonly unexpectedKeys: readonly string[];
}

function sorted(values: Iterable<string>): string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

/** The argument after flag `name` in a gate's argv, or undefined when the flag is absent. */
export function optionValue(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const optionArgument = args[index + 1];
  if (optionArgument === undefined || optionArgument.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }
  return optionArgument;
}

/** Validate an exact result matrix. Every diagnostic contains the canonical key. */
export function validateExactMatrix(
  family: string,
  expected: readonly string[],
  observed: readonly string[],
): MatrixValidation {
  const expectedKeys = sorted(expected);
  const observedKeys = sorted(observed);
  const expectedSet = new Set(expectedKeys);
  if (expectedSet.size !== expectedKeys.length) {
    throw new Error(`${family} expected matrix contains duplicate keys`);
  }

  const counts = new Map<string, number>();
  for (const key of observedKeys) counts.set(key, (counts.get(key) ?? 0) + 1);
  const missingKeys = expectedKeys.filter((key) => !counts.has(key));
  const duplicateKeys = sorted([...counts].filter(([, count]) => count > 1).map(([key]) => key));
  const unexpectedKeys = sorted([...counts.keys()].filter((key) => !expectedSet.has(key)));
  const diagnostics = [
    ...missingKeys.map((key) => `missing ${key}`),
    ...duplicateKeys.map((key) => `duplicate ${key}`),
    ...unexpectedKeys.map((key) => `unexpected ${key}`),
  ];
  if (diagnostics.length > 0) {
    throw new Error(`${family} matrix is not exact: ${diagnostics.join("; ")}`);
  }
  return { expectedKeys, observedKeys, missingKeys, duplicateKeys, unexpectedKeys };
}

export function assertGateIdentity(
  family: keyof typeof MATRIX_IDS,
  mode: BenchmarkMode,
  value: GateIdentity<typeof PERFORMANCE_GATE_PROTOCOL_VERSION | typeof DATA_GATE_PROTOCOL_VERSION>,
): void {
  const protocolVersion =
    family === "data" ? DATA_GATE_PROTOCOL_VERSION : PERFORMANCE_GATE_PROTOCOL_VERSION;
  if (value.protocolVersion !== protocolVersion) {
    throw new Error(
      `${family} stale protocol: expected ${protocolVersion}, observed ${String(value.protocolVersion)}`,
    );
  }
  if (value.mode !== mode) {
    throw new Error(`${family} mode mismatch: expected ${mode}, observed ${String(value.mode)}`);
  }
  const matrixId = MATRIX_IDS[family][mode];
  if (value.matrixId !== matrixId) {
    throw new Error(
      `${family} stale matrix: expected ${matrixId}, observed ${String(value.matrixId)}`,
    );
  }
}

export function assertFiniteNonNegative(value: number, path: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${path} must be finite and non-negative`);
  }
}

export function validateStat(stat: Stat, path: string): void {
  for (const field of ["median", "p95", "mean", "stddev", "min", "max"] as const) {
    assertFiniteNonNegative(stat[field], `${path}.${field}`);
  }
  if (!Number.isInteger(stat.iters) || stat.iters <= 0) {
    throw new Error(`${path}.iters must prove a non-empty sample`);
  }
  if (
    stat.min > stat.median ||
    stat.median > stat.p95 ||
    stat.p95 > stat.max ||
    stat.mean < stat.min ||
    stat.mean > stat.max
  ) {
    throw new Error(`${path} contains an impossible finite summary`);
  }
}

/** Require raw evidence and prove its persisted summary is derived, not trusted. */
export function validateRawStat(samples: readonly number[], stat: Stat, path: string): void {
  if (samples.length === 0) throw new Error(`${path} has an empty sample`);
  for (const [index, sample] of samples.entries()) {
    assertFiniteNonNegative(sample, `${path}.samples[${index}]`);
  }
  validateStat(stat, `${path}.stat`);
  const actual = summarize(samples);
  for (const field of ["median", "p95", "mean", "stddev", "min", "max", "iters"] as const) {
    const observed = stat[field];
    if (observed !== actual[field]) {
      throw new Error(
        `${path}.stat.${field} does not match raw samples: expected ${actual[field]}, observed ${observed}`,
      );
    }
  }
}

export interface HarnessFingerprint {
  readonly digest: string;
  readonly protocol: string;
  readonly matrix: string;
  readonly dataset: string;
  readonly sampling: string;
  readonly schema: string;
  readonly sources: Readonly<Record<string, string>>;
}

export interface ControlledRunnerFingerprint {
  readonly os: string;
  readonly arch: string;
  readonly cpu: string;
  readonly bun: string;
  readonly node: string;
  readonly browser: string;
  readonly powerMode: string;
  readonly concurrency: number;
}

const REPOSITORY_ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));

export const HARNESS_SOURCE_FILES = [
  "bench/package.json",
  "bench/src/dataset.ts",
  "bench/src/dom-setup.ts",
  "bench/src/handsontable-runtime.ts",
  "bench/src/render-bench.html",
  "bench/src/render-bench.ts",
  "bench/src/render-driver.ts",
  "bench/src/render-gate.ts",
  "bench/src/render-protocol.ts",
  "bench/src/render-scenarios.ts",
  "bench/src/stats.ts",
  "bun.lock",
] as const;

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function dependencyFingerprint(value: unknown, field: string): Record<string, string> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`bench/package.json ${field} must be an object`);
  }
  return Object.fromEntries(
    Object.entries(value)
      .map(([name, version]) => {
        if (typeof version !== "string") {
          throw new TypeError(`bench/package.json ${field}.${name} must be a string`);
        }
        return [name, version] as const;
      })
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

export function fingerprintRenderHarnessManifest(manifest: unknown): string {
  if (manifest === null || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new TypeError("bench/package.json must be an object");
  }
  const packageManifest = manifest as {
    readonly scripts?: Readonly<Record<string, unknown>>;
    readonly dependencies?: unknown;
    readonly devDependencies?: unknown;
  };
  const prepare = packageManifest.scripts?.["bench:render:prepare"];
  if (typeof prepare !== "string") {
    throw new TypeError("bench/package.json scripts.bench:render:prepare must be a string");
  }
  return sha256(
    JSON.stringify({
      scripts: { "bench:render:prepare": prepare },
      dependencies: dependencyFingerprint(packageManifest.dependencies, "dependencies"),
      devDependencies: dependencyFingerprint(packageManifest.devDependencies, "devDependencies"),
    }),
  );
}

export function computeHarnessFingerprint(
  matrix: string,
  sampling: string,
  root = REPOSITORY_ROOT,
): HarnessFingerprint {
  const sources: Record<string, string> = {};
  for (const relativePath of HARNESS_SOURCE_FILES) {
    const bytes = readFileSync(resolve(root, relativePath));
    sources[relativePath] =
      relativePath === "bench/package.json"
        ? fingerprintRenderHarnessManifest(JSON.parse(bytes.toString("utf8")) as unknown)
        : sha256(bytes);
  }
  const protocol = `performance=${PERFORMANCE_GATE_PROTOCOL_VERSION};render=${RENDER_PROTOCOL_VERSION}`;
  const dataset = `seed=0x${DEFAULT_SEED.toString(16)};schema=id,date,customer,city,amount`;
  const schema = "typed-render-artifact-v1;controlled-baseline-v2";
  const payload = JSON.stringify({ protocol, matrix, dataset, sampling, schema, sources });
  return { digest: sha256(payload), protocol, matrix, dataset, sampling, schema, sources };
}

export function currentRunnerFingerprint(
  browser: string,
  powerMode: string,
  concurrency: number,
): ControlledRunnerFingerprint {
  if (powerMode.trim().length === 0) throw new Error("controlled runner power mode is required");
  if (!Number.isInteger(concurrency) || concurrency <= 0) {
    throw new Error("controlled runner concurrency must be a positive integer");
  }
  return {
    os: `${process.platform} ${release()}`,
    arch: process.arch,
    cpu: cpus()[0]?.model ?? "unknown",
    bun: Bun.version,
    node: process.versions.node,
    browser,
    powerMode,
    concurrency,
  };
}

function flattenFingerprint(value: unknown, path: string, output: Record<string, unknown>): void {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    for (const [key, nested] of Object.entries(value)) {
      flattenFingerprint(nested, `${path}.${key}`, output);
    }
    return;
  }
  output[path] = value;
}

export function fingerprintMismatches<T extends object>(
  expected: T,
  observed: T,
  prefix: string,
): string[] {
  const left: Record<string, unknown> = {};
  const right: Record<string, unknown> = {};
  flattenFingerprint(expected, prefix, left);
  flattenFingerprint(observed, prefix, right);
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  return sorted(
    [...keys]
      .filter((key) => JSON.stringify(left[key]) !== JSON.stringify(right[key]))
      .map(
        (key) =>
          `${key}: expected ${JSON.stringify(left[key])}, observed ${JSON.stringify(right[key])}`,
      ),
  );
}

export type BenchmarkEnginePackage = "wasm" | "formulas";

/** The frozen harness remains current; only these engine files come from 0.5.4. */
export interface EngineBaselineContext {
  label: "0.5.4 engine (WASM) under 0.6 core and harness";
  engineCommit: string;
  harnessCommit: string;
  engineFiles: Record<string, string>;
  currentWasmFiles: Record<string, string>;
}

const ENGINE_RUNTIME_FILES = [
  "loader-node.mjs",
  "loader-state.mjs",
  "pkg/sheetwrite_wasm.js",
  "pkg/sheetwrite_wasm_factory.js",
  "pkg/sheetwrite_wasm_bg.wasm",
] as const;
const BASELINE_ENGINE_LABEL = "0.5.4 engine (WASM) under 0.6 core and harness";

export function benchmarkEnginePath(path: string): string {
  return resolve(process.env.SHEETWRITE_BENCH_ENGINE_ROOT ?? REPOSITORY_ROOT, path);
}

export function validateEngineBaselineContext(
  context: EngineBaselineContext,
  harnessCommit: string,
  packages: readonly BenchmarkEnginePackage[],
): void {
  validateExactMatrix(
    "baseline context fields",
    ["label", "engineCommit", "harnessCommit", "engineFiles", "currentWasmFiles"],
    Object.keys(context),
  );
  if (
    context.label !== BASELINE_ENGINE_LABEL ||
    !/^[0-9a-f]{40}$/u.test(context.engineCommit) ||
    context.harnessCommit !== harnessCommit ||
    !/^[0-9a-f]{40}$/u.test(harnessCommit)
  )
    throw new Error("Invalid baseline engine provenance");

  const runtimePaths = packages.flatMap((name) =>
    ENGINE_RUNTIME_FILES.map((path) => `packages/${name}/${path}`),
  );
  const wasmPaths = packages.map((name) => `packages/${name}/pkg/sheetwrite_wasm_bg.wasm`);
  validateExactMatrix("baseline engine files", runtimePaths, Object.keys(context.engineFiles));
  validateExactMatrix(
    "baseline current WASM files",
    wasmPaths,
    Object.keys(context.currentWasmFiles),
  );
  for (const digest of [
    ...Object.values(context.engineFiles),
    ...Object.values(context.currentWasmFiles),
  ]) {
    if (!/^[0-9a-f]{64}$/u.test(digest)) throw new Error("Invalid baseline file digest");
  }
  for (const path of wasmPaths) {
    if (context.engineFiles[path] === context.currentWasmFiles[path]) {
      throw new Error(`Baseline loaded current 0.6 WASM: ${path}`);
    }
  }
}

export function captureEngineBaselineContext(
  harnessCommit: string,
  packages: readonly BenchmarkEnginePackage[],
): EngineBaselineContext | undefined {
  const root = process.env.SHEETWRITE_BENCH_ENGINE_ROOT;
  // The paired gate also points the root at this checkout; that side is the candidate, not a baseline.
  if (root === undefined || resolve(root) === REPOSITORY_ROOT) return undefined;
  const versions = packages.map((name) => {
    const manifest = JSON.parse(
      readFileSync(resolve(root, `packages/${name}/package.json`), "utf8"),
    ) as { version?: unknown };
    return manifest.version;
  });
  if (!versions.includes("0.5.4")) return undefined;
  if (versions.some((version) => version !== "0.5.4"))
    throw new Error("Mixed baseline engine versions");

  const ref = process.env.SHEETWRITE_BENCH_ENGINE_REF ?? "HEAD";
  const commit = Bun.spawnSync(["git", "rev-parse", "--verify", `${ref}^{commit}`], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  });
  if (commit.exitCode !== 0) throw new Error("Cannot identify baseline engine commit");
  const engineCommit = commit.stdout.toString().trim();
  // A bench-only patch may change HEAD, but must not change the claimed engine code.
  const engineDiff = Bun.spawnSync(["git", "diff", "--exit-code", engineCommit, "--", "packages"], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  });
  if (engineDiff.exitCode !== 0)
    throw new Error("Baseline packages differ from the claimed engine ref");
  const context: EngineBaselineContext = {
    label: BASELINE_ENGINE_LABEL,
    engineCommit,
    harnessCommit,
    engineFiles: Object.fromEntries(
      packages.flatMap((name) =>
        ENGINE_RUNTIME_FILES.map((path) => {
          const key = `packages/${name}/${path}`;
          return [key, sha256(readFileSync(resolve(root, key)))];
        }),
      ),
    ),
    currentWasmFiles: Object.fromEntries(
      packages.map((name) => {
        const key = `packages/${name}/pkg/sheetwrite_wasm_bg.wasm`;
        return [key, sha256(readFileSync(resolve(REPOSITORY_ROOT, key)))];
      }),
    ),
  };
  validateEngineBaselineContext(context, harnessCommit, packages);
  return context;
}
