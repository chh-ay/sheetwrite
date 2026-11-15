import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";

import { optionValue } from "../bench/src/cli-options.js";
import { readReleaseManifestDigest } from "./release-artifacts.js";
import { readJson } from "./script-io.js";
import {
  assertAttributionAssetsFresh,
  buildAttributionFindings,
  loadBundlerEvidence,
} from "./size-bundler-evidence.js";
import {
  loadPackedArtifacts,
  measureClosure,
  OPTIONAL_PACKAGE_CLOSURES,
  packPackages,
  runCommand,
} from "./size-install.js";
import { PUBLISHABLE_PACKAGE_ORDER } from "./workspace-tooling.js";

export const SIZE_PROTOCOL_VERSION = 2;
export const SIZE_TOOL_NAME = "sheetwrite-delivery-size";
export const SIZE_TOOL_VERSION = "2.0.0";
export const BUNDLER_SOURCE_MAP_MODE = "hidden-external";

export type MetricUnit = "bytes" | "count";
export type PackedCategory =
  | "assets"
  | "css"
  | "declarations"
  | "maps"
  | "metadata"
  | "runtime-js"
  | "runtime-source"
  | "wasm";
export type AssetKind = "css" | "javascript" | "wasm";

export interface PackFile {
  path: string;
  size: number;
}

export interface PackResult {
  filename: string;
  size: number;
  unpackedSize: number;
  files: readonly PackFile[];
}

export interface Metric {
  actual: number;
  unit: MetricUnit;
  category: string;
  owner: string;
}

export interface SizeReleaseSnapshot {
  version: string;
  capturedAt?: string;
  source: string;
  metrics: Record<string, Pick<Metric, "actual" | "unit">>;
}

export interface SizeHistory {
  schemaVersion: 1;
  releases: SizeReleaseSnapshot[];
}

export interface BundlerAsset {
  path: string;
  kind: AssetKind;
  owner: string;
  roles: string[];
}
export interface BundlerProvenance {
  buildMode: string;
  minified: boolean;
  minifier: { name: string; version: string };
  externals: string[];
  target: string;
  sourceMaps: string;
  attributionMethod: string;
}

export interface BundlerModuleAttribution {
  id: string;
  owner: string;
  attribution: "source-map" | "opaque-asset";
  rawBytes: number;
  gzipBytes: number;
  brotliBytes: number;
}
export interface BundlerAttributedAsset {
  path: string;
  sha256: string;
}

export interface BundlerEntryAttribution {
  name: string;
  entry: string;
  eagerImports: string[];
  assets: BundlerAttributedAsset[];
  generatedBytes: number;
  modules: BundlerModuleAttribution[];
}

export interface BundlerEvidence {
  schemaVersion: number;
  bundler: "next" | "vite" | "webpack";
  version: string;
  assets: BundlerAsset[];
  provenance: BundlerProvenance;
  attribution: BundlerEntryAttribution[];
}

export interface PackageReport {
  name: string;
  tarballBytes: number;
  unpackedBytes: number;
  fileCount: number;
  categories: Record<PackedCategory, number>;
}

export interface ClosureReport {
  name: string;
  packageCount: number;
  logicalBytes: number;
  packages: string[];
}

export interface AssetReport extends BundlerAsset {
  rawBytes: number;
  gzipBytes: number;
  brotliBytes: number;
  sha256: string;
}
export interface AttributionFindings {
  comparison: {
    entry: "core-first-paint";
    buildMode: string;
    minified: true;
    externals: string[];
    target: string;
    sourceMaps: string;
    attributionMethod: string;
    minifiers: Record<"next" | "vite", { name: string; version: string }>;
    fixtureAndConfigurationDifferences: Array<{
      bundler: "next" | "vite";
      eagerImports: string[];
      nonSheetwriteRawBytes: number;
      opaqueFrameworkRawBytes: number;
    }>;
  };
  firstPaint: Array<{
    bundler: "next" | "vite";
    generatedBytes: number;
    sheetwriteRawBytes: number;
    rootBarrelRawBytes: number;
    eagerImports: string[];
  }>;
  subpaths: Array<{
    subpath: "sync" | "collaboration" | "rebase" | "persistence";
    publicExportAdded: false;
    decision: "retain-root-export" | "requires-isolated-subpath-proof";
    reason: string;
    retainedModules: Array<{
      bundler: "next" | "vite";
      rawBytes: number;
      brotliBytes: number;
    }>;
    materialWinThreshold: { brotliBytes: 7680; percent: 10 };
  }>;
}

export interface SizeReport {
  schemaVersion: number;
  protocolVersion: number;
  tool: { name: string; version: string };
  /** Protocol-binding capture stamp; the docs evidence page requires it. */
  meta: { commit: string; dirty: boolean; timestamp: string };
  toolchain: Record<string, string>;
  metrics: Record<string, Metric>;
  packages: PackageReport[];
  closures: ClosureReport[];
  bundlers: Array<{
    name: BundlerEvidence["bundler"];
    version: string;
    provenance: BundlerProvenance;
    attribution: BundlerEntryAttribution[];
    assets: AssetReport[];
  }>;
  attributionFindings: AttributionFindings;
  reproduction: string;
}

export const repositoryRoot = resolve(import.meta.dir, "..");
export const bundlerEvidenceRoot = join(repositoryRoot, "test-results/bundlers");
const reportPath = join(import.meta.dir, "size-report.json");
const historyPath = join(import.meta.dir, "size-history.json");
export function isNonNegativeInteger(value: unknown): value is number {
  return (
    typeof value === "number" && Number.isFinite(value) && value >= 0 && Number.isInteger(value)
  );
}

export function compressedSizes(data: Uint8Array): {
  rawBytes: number;
  gzipBytes: number;
  brotliBytes: number;
} {
  return {
    rawBytes: data.byteLength,
    gzipBytes: gzipSync(data, { level: 9 }).byteLength,
    brotliBytes: brotliCompressSync(data, {
      params: {
        [constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_GENERIC,
        [constants.BROTLI_PARAM_QUALITY]: 11,
        [constants.BROTLI_PARAM_SIZE_HINT]: data.byteLength,
      },
    }).byteLength,
  };
}

function addMetric(
  metrics: Record<string, Metric>,
  key: string,
  actual: number,
  unit: MetricUnit,
  category: string,
  owner: string,
): void {
  if (metrics[key] !== undefined) throw new Error(`Duplicate size metric ${key}`);
  if (!isNonNegativeInteger(actual)) throw new Error(`Metric ${key} is non-finite or malformed`);
  metrics[key] = { actual, unit, category, owner };
}

async function reportAsset(asset: BundlerAsset): Promise<AssetReport> {
  const absolutePath = resolve(repositoryRoot, asset.path);
  if (!absolutePath.startsWith(`${repositoryRoot}${sep}`)) {
    throw new Error(`Bundler asset escapes repository root: ${asset.path}`);
  }
  const content = await readFile(absolutePath);
  const compressed = compressedSizes(content);
  return {
    ...asset,
    ...compressed,
    sha256: createHash("sha256").update(content).digest("hex"),
  };
}
function metricSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9]+(.)/g, (_, next: string) => next.toUpperCase());
}

export function addPackageSizeMetrics(
  metrics: Record<string, Metric>,
  report: PackageReport,
): void {
  const prefix = `package.${report.name}`;
  addMetric(
    metrics,
    `${prefix}.tarballBytes`,
    report.tarballBytes,
    "bytes",
    "package-tarball",
    report.name,
  );
  addMetric(
    metrics,
    `${prefix}.unpackedBytes`,
    report.unpackedBytes,
    "bytes",
    "package-unpacked",
    report.name,
  );
  addMetric(
    metrics,
    `${prefix}.fileCount`,
    report.fileCount,
    "count",
    "package-files",
    report.name,
  );
  for (const [category, bytes] of Object.entries(report.categories).sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    addMetric(
      metrics,
      `${prefix}.${metricSegment(category)}Bytes`,
      bytes,
      "bytes",
      `package-unpacked-${category}`,
      report.name,
    );
  }
}

/**
 * Core's stylesheets as an app loads them: `styles.css` with the parts it
 * imports (all of them, in order), each part on its own, the icon sheet that
 * icons.css loads, and shell.css.
 */
async function coreStylesheets(): Promise<{ name: string; owner: string; bytes: Uint8Array }[]> {
  const core = join(repositoryRoot, "packages/core");
  const index = await readFile(join(core, "styles.css"), "utf8");
  const parts = [...index.matchAll(/@import "\.\/styles\/([a-z-]+)\.css";/g)].map(
    (match) => match[1] ?? "",
  );
  if (parts.length === 0) throw new Error("packages/core/styles.css imports no style parts");
  const partSheets = await Promise.all(
    parts.map(async (part) => ({
      name: `styles.${metricSegment(part)}`,
      owner: `@sheetwrite/core/styles/${part}.css`,
      bytes: await readFile(join(core, "styles", `${part}.css`)),
    })),
  );
  return [
    {
      name: "styles",
      owner: "@sheetwrite/core/styles.css",
      bytes: Buffer.concat(partSheets.map((sheet) => sheet.bytes)),
    },
    ...partSheets,
    {
      name: "styles.iconSheet",
      owner: "@sheetwrite/core/styles/icons.svg",
      bytes: await readFile(join(core, "styles/icons.svg")),
    },
    {
      name: "shell",
      owner: "@sheetwrite/core/shell.css",
      bytes: await readFile(join(core, "shell.css")),
    },
  ];
}

async function buildSizeReport(
  reuseBundlers: boolean,
  artifactDirectory?: string,
): Promise<SizeReport> {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "sheetwrite-size-report-"));
  try {
    const packedPackages =
      artifactDirectory === undefined
        ? await packPackages(temporaryRoot)
        : await loadPackedArtifacts(artifactDirectory, temporaryRoot);
    const tarballs = new Map(packedPackages.map((entry) => [entry.name, entry.tarballPath]));
    const closureSpecs: Array<[string, string[]]> = [
      ["core", ["@sheetwrite/wasm", "@sheetwrite/core"]],
      ["react", ["@sheetwrite/wasm", "@sheetwrite/core", "@sheetwrite/react"]],
      ["vue", ["@sheetwrite/wasm", "@sheetwrite/core", "@sheetwrite/vue"]],
      ["svelte", ["@sheetwrite/wasm", "@sheetwrite/core", "@sheetwrite/svelte"]],
      ["core-xlsx", ["@sheetwrite/wasm", "@sheetwrite/core", "@sheetwrite/xlsx"]],
      ["core-charts", ["@sheetwrite/wasm", "@sheetwrite/core", "@sheetwrite/charts"]],
      ["core-queries", ["@sheetwrite/wasm", "@sheetwrite/core", "@sheetwrite/queries"]],
    ];
    const closures = await Promise.all(
      closureSpecs.map(([name, names], index) =>
        measureClosure(name, names, tarballs, temporaryRoot, index),
      ),
    );
    const repeatedCore = await measureClosure(
      "core",
      closureSpecs[0]?.[1] ?? [],
      tarballs,
      temporaryRoot,
      closureSpecs.length,
    );
    const core = closures[0];
    if (
      core === undefined ||
      core.packageCount !== repeatedCore.packageCount ||
      core.logicalBytes !== repeatedCore.logicalBytes ||
      JSON.stringify(core.packages) !== JSON.stringify(repeatedCore.packages)
    ) {
      throw new Error("Repeated core clean-install closure measurement was not deterministic");
    }

    const bundlerEvidence = await loadBundlerEvidence(reuseBundlers, artifactDirectory);
    const attributionFindings = buildAttributionFindings(bundlerEvidence);
    const bundlers: SizeReport["bundlers"] = [];
    for (const evidence of bundlerEvidence) {
      const assets = await Promise.all(evidence.assets.map(reportAsset));
      assets.sort((left, right) => left.path.localeCompare(right.path));
      assertAttributionAssetsFresh(evidence, assets);
      bundlers.push({
        name: evidence.bundler,
        version: evidence.version,
        provenance: evidence.provenance,
        attribution: evidence.attribution,
        assets,
      });
    }
    bundlers.sort((left, right) => left.name.localeCompare(right.name));

    const metrics: Record<string, Metric> = {};
    for (const entry of packedPackages) addPackageSizeMetrics(metrics, entry.report);
    for (const closure of closures) {
      const prefix = `closure.${closure.name}`;
      addMetric(
        metrics,
        `${prefix}.packageCount`,
        closure.packageCount,
        "count",
        "install-closure",
        closure.name,
      );
      addMetric(
        metrics,
        `${prefix}.logicalBytes`,
        closure.logicalBytes,
        "bytes",
        "install-closure",
        closure.name,
      );
      for (const optional of OPTIONAL_PACKAGE_CLOSURES) {
        if (closure.name === optional.closure) continue;

        addMetric(
          metrics,
          `${prefix}.${optional.metric}`,
          closure.packages.filter((identity) => identity.startsWith(`${optional.packageName}@`))
            .length,
          "count",
          "optional-dependency-isolation",
          closure.name,
        );
      }
    }
    for (const bundler of bundlers) {
      const roles = [...new Set(bundler.assets.flatMap((asset) => asset.roles))].sort();
      for (const role of roles) {
        for (const kind of ["javascript", "css", "wasm"] as const) {
          const selected = bundler.assets.filter(
            (asset) => asset.kind === kind && asset.roles.includes(role),
          );
          if (selected.length === 0) continue;
          const prefix = `bundler.${bundler.name}.${metricSegment(role)}.${kind}`;
          addMetric(
            metrics,
            `${prefix}.rawBytes`,
            selected.reduce((sum, asset) => sum + asset.rawBytes, 0),
            "bytes",
            `browser-${kind}`,
            `${bundler.name}:${role}`,
          );
          addMetric(
            metrics,
            `${prefix}.gzipBytes`,
            selected.reduce((sum, asset) => sum + asset.gzipBytes, 0),
            "bytes",
            `browser-${kind}`,
            `${bundler.name}:${role}`,
          );
          addMetric(
            metrics,
            `${prefix}.brotliBytes`,
            selected.reduce((sum, asset) => sum + asset.brotliBytes, 0),
            "bytes",
            `browser-${kind}`,
            `${bundler.name}:${role}`,
          );
        }
      }
    }
    for (const entry of attributionFindings.firstPaint) {
      addMetric(
        metrics,
        `attribution.${entry.bundler}.coreFirstPaint.sheetwriteRawBytes`,
        entry.sheetwriteRawBytes,
        "bytes",
        "browser-module-attribution",
        `${entry.bundler}:@sheetwrite/core`,
      );
      addMetric(
        metrics,
        `attribution.${entry.bundler}.coreFirstPaint.rootBarrelRawBytes`,
        entry.rootBarrelRawBytes,
        "bytes",
        "browser-module-attribution",
        `${entry.bundler}:@sheetwrite/core`,
      );
    }
    for (const candidate of attributionFindings.subpaths) {
      for (const retained of candidate.retainedModules) {
        addMetric(
          metrics,
          `attribution.${retained.bundler}.${candidate.subpath}.rawBytes`,
          retained.rawBytes,
          "bytes",
          "browser-module-attribution",
          `${retained.bundler}:@sheetwrite/core/${candidate.subpath}`,
        );
        addMetric(
          metrics,
          `attribution.${retained.bundler}.${candidate.subpath}.brotliBytes`,
          retained.brotliBytes,
          "bytes",
          "browser-module-attribution",
          `${retained.bundler}:@sheetwrite/core/${candidate.subpath}`,
        );
      }
    }
    for (const stylesheet of await coreStylesheets()) {
      for (const [metric, value] of Object.entries(compressedSizes(stylesheet.bytes))) {
        addMetric(
          metrics,
          `css.${stylesheet.name}.${metric}`,
          value,
          "bytes",
          "browser-css",
          stylesheet.owner,
        );
      }
    }

    const nodeVersion = (await runCommand(["node", "--version"])).trim().replace(/^v/, "");
    const npmVersion = (await runCommand(["npm", "--version"])).trim();

    return {
      schemaVersion: SIZE_PROTOCOL_VERSION,
      protocolVersion: SIZE_PROTOCOL_VERSION,
      tool: { name: SIZE_TOOL_NAME, version: SIZE_TOOL_VERSION },
      meta: {
        commit: (await runCommand(["git", "rev-parse", "HEAD"])).trim(),
        dirty:
          (await runCommand(["git", "status", "--porcelain", "--untracked-files=no"])).trim()
            .length > 0,
        timestamp: new Date().toISOString(),
      },
      toolchain: {
        bun: Bun.version,
        next: bundlers.find((entry) => entry.name === "next")?.version ?? "missing",
        node: nodeVersion,
        npm: npmVersion,
        vite: bundlers.find((entry) => entry.name === "vite")?.version ?? "missing",
        webpack: bundlers.find((entry) => entry.name === "webpack")?.version ?? "missing",
      },
      metrics: Object.fromEntries(
        Object.entries(metrics).sort(([left], [right]) => left.localeCompare(right)),
      ),
      packages: packedPackages
        .map((entry) => entry.report)
        .sort((left, right) => left.name.localeCompare(right.name)),
      closures: closures.sort((left, right) => left.name.localeCompare(right.name)),
      bundlers,
      attributionFindings,
      reproduction: "bun run size:report",
    };
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

export function formatMetricDisplay(
  metric: Pick<Metric, "actual" | "unit">,
): readonly [value: string, unit: string] {
  if (metric.unit === "count") return [metric.actual.toLocaleString("en-US"), "count"];
  if (metric.actual >= 1024 ** 3) return [(metric.actual / 1024 ** 3).toFixed(2), "GiB"];
  if (metric.actual >= 1024 ** 2) return [(metric.actual / 1024 ** 2).toFixed(2), "MiB"];
  if (metric.actual >= 1024) return [(metric.actual / 1024).toFixed(1), "KiB"];
  return [metric.actual.toLocaleString("en-US"), "B"];
}

export function formatMetricDelta(
  current: Pick<Metric, "actual" | "unit">,
  previous: Pick<Metric, "actual" | "unit"> | undefined,
): readonly [change: string, percentage: string] {
  if (previous === undefined || previous.unit !== current.unit) return ["not tracked", "—"];
  const delta = current.actual - previous.actual;
  const [magnitude, unit] = formatMetricDisplay({ actual: Math.abs(delta), unit: current.unit });
  const change = delta === 0 ? `0 ${unit}` : `${delta > 0 ? "+" : "-"}${magnitude} ${unit}`;
  const percentage =
    previous.actual === 0
      ? current.actual === 0
        ? "0.0%"
        : "new"
      : `${delta >= 0 ? "+" : ""}${((delta / previous.actual) * 100).toFixed(1)}%`;
  return [change, percentage];
}

export function formatTable(report: SizeReport): string {
  const rows = ["metric\tactual\tunit"];
  for (const [key, metric] of Object.entries(report.metrics)) {
    const [value, unit] = formatMetricDisplay(metric);
    rows.push(`${key}\t${value}\t${unit}`);
  }
  return rows.join("\n");
}

export function formatReleaseComparison(
  current: Record<string, Pick<Metric, "actual" | "unit">>,
  baseline: SizeReleaseSnapshot,
): string {
  const rows = [`metric\tcurrent\tunit\tchange vs v${baseline.version}\tchange %`];
  for (const [key, previous] of Object.entries(baseline.metrics)) {
    const metric = current[key];
    if (metric === undefined || metric.unit !== previous.unit) continue;
    const [value, unit] = formatMetricDisplay(metric);
    const [change, percentage] = formatMetricDelta(metric, previous);
    rows.push(`${key}\t${value}\t${unit}\t${change}\t${percentage}`);
  }
  return rows.join("\n");
}

function assertReleaseVersion(version: string): void {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(`Invalid release version: ${version}`);
  }
}

export async function capturePublishedRelease(version: string): Promise<SizeReleaseSnapshot> {
  assertReleaseVersion(version);
  const metrics: SizeReleaseSnapshot["metrics"] = {};
  for (const packageName of PUBLISHABLE_PACKAGE_ORDER) {
    const metadataResponse = await fetch(
      `https://registry.npmjs.org/${encodeURIComponent(packageName)}/${encodeURIComponent(version)}`,
    );
    if (!metadataResponse.ok) {
      throw new Error(`Published package not found: ${packageName}@${version}`);
    }
    const metadata = (await metadataResponse.json()) as {
      dist?: { fileCount?: number; tarball?: string; unpackedSize?: number };
      version?: string;
    };
    if (
      metadata.version !== version ||
      !metadata.dist?.tarball ||
      !isNonNegativeInteger(metadata.dist.fileCount) ||
      !isNonNegativeInteger(metadata.dist.unpackedSize)
    ) {
      throw new Error(`Incomplete registry size metadata: ${packageName}@${version}`);
    }
    const tarballResponse = await fetch(metadata.dist.tarball);
    if (!tarballResponse.ok) throw new Error(`Cannot download ${packageName}@${version}`);
    const prefix = `package.${packageName}`;
    metrics[`${prefix}.tarballBytes`] = {
      actual: (await tarballResponse.arrayBuffer()).byteLength,
      unit: "bytes",
    };
    metrics[`${prefix}.unpackedBytes`] = {
      actual: metadata.dist.unpackedSize,
      unit: "bytes",
    };
    metrics[`${prefix}.fileCount`] = {
      actual: metadata.dist.fileCount,
      unit: "count",
    };
  }
  return {
    version,
    capturedAt: new Date().toISOString(),
    source: "npm registry published artifacts",
    metrics,
  };
}
export function validateSizeHistory(value: unknown): SizeHistory {
  if (typeof value !== "object" || value === null) throw new Error("Invalid size history");
  const candidate = value as Partial<SizeHistory>;
  if (candidate.schemaVersion !== 1 || !Array.isArray(candidate.releases)) {
    throw new Error("Invalid size history schema");
  }
  const versions = new Set<string>();
  for (const release of candidate.releases) {
    if (
      typeof release !== "object" ||
      release === null ||
      typeof release.version !== "string" ||
      typeof release.source !== "string" ||
      typeof release.metrics !== "object" ||
      release.metrics === null
    ) {
      throw new Error("Invalid size history release");
    }
    if (versions.has(release.version))
      throw new Error(`Duplicate size release: ${release.version}`);
    versions.add(release.version);
    for (const [key, metric] of Object.entries(release.metrics)) {
      if (
        typeof key !== "string" ||
        typeof metric !== "object" ||
        metric === null ||
        !Number.isFinite(metric.actual) ||
        (metric.unit !== "bytes" && metric.unit !== "count")
      ) {
        throw new Error(`Invalid size history metric: ${release.version}/${key}`);
      }
    }
  }
  return candidate as SizeHistory;
}

async function readSizeHistory(): Promise<SizeHistory> {
  return validateSizeHistory(await readJson<unknown>(historyPath));
}

async function recordRelease(history: SizeHistory, release: SizeReleaseSnapshot): Promise<void> {
  if (history.releases.some((entry) => entry.version === release.version)) {
    throw new Error(`Size history already contains v${release.version}`);
  }
  const updated: SizeHistory = {
    schemaVersion: 1,
    releases: [...history.releases, release],
  };
  await writeFile(historyPath, `${JSON.stringify(updated, null, 2)}\n`);
  await runCommand(["bun", "fmt", historyPath]);
}

async function writeReport(report: SizeReport): Promise<void> {
  await rm(join(import.meta.dir, "size-report-failure.json"), { force: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  await runCommand(["bun", "fmt", reportPath]);
}

async function writeFailure(error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  await writeFile(
    join(import.meta.dir, "size-report-failure.json"),
    `${JSON.stringify(
      {
        schemaVersion: SIZE_PROTOCOL_VERSION,
        tool: { name: SIZE_TOOL_NAME, version: SIZE_TOOL_VERSION },
        error: message,
        reproduction: "bun run size:report",
      },
      null,
      2,
    )}\n`,
  );
}

async function cli(): Promise<void> {
  const mode = process.argv[2] ?? "report";
  const reuseBundlers = process.argv.includes("--reuse-bundlers");
  try {
    const artifactDirectory = optionValue(process.argv, "--artifacts");
    if (mode !== "report" && mode !== "record") {
      throw new Error(`Unknown size-report mode: ${mode}`);
    }
    const history = await readSizeHistory();
    if (mode === "record") {
      const version = optionValue(process.argv, "--version");
      if (version === undefined) throw new Error("record mode requires --version");
      if (history.releases.some((release) => release.version === version)) {
        console.log(
          `Published v${version} is already present in ${relative(repositoryRoot, historyPath)}`,
        );
        return;
      }
      const release = await capturePublishedRelease(version);
      await recordRelease(history, release);
      console.log(`Recorded published v${version} in ${relative(repositoryRoot, historyPath)}`);
      return;
    }
    const requiredArtifacts = process.env.SHEETWRITE_RELEASE_ARTIFACTS;
    if (process.env.SHEETWRITE_ARTIFACT_ONLY === "1" && artifactDirectory === undefined) {
      throw new Error("Artifact-only size reporting requires --artifacts");
    }
    if (
      requiredArtifacts !== undefined &&
      (artifactDirectory === undefined || resolve(artifactDirectory) !== resolve(requiredArtifacts))
    ) {
      throw new Error("Size report artifact input differs from the canonical artifact set");
    }
    const report = await buildSizeReport(reuseBundlers, artifactDirectory);
    await writeReport(report);
    console.log(formatTable(report));
    const baseline = history.releases.at(-1);
    if (baseline !== undefined) {
      console.log(
        `\nCurrent workspace vs latest published release:\n${formatReleaseComparison(report.metrics, baseline)}`,
      );
    }
    console.log(`JSON report: ${relative(repositoryRoot, reportPath)}`);
    if (artifactDirectory !== undefined) {
      console.log(
        `Artifact manifest SHA-512: ${await readReleaseManifestDigest(artifactDirectory)}`,
      );
    }
  } catch (error) {
    await writeFailure(error);
    throw error;
  }
}

if (import.meta.main) await cli();
