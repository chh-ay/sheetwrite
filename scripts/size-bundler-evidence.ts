import { join, resolve } from "node:path";

import { readJson } from "./script-io.js";
import { runCommand } from "./size-install.js";
import {
  type AssetReport,
  type AttributionFindings,
  BUNDLER_SOURCE_MAP_MODE,
  type BundlerAsset,
  type BundlerEntryAttribution,
  type BundlerEvidence,
  bundlerEvidenceRoot,
  type BundlerModuleAttribution,
  type BundlerProvenance,
  isNonNegativeInteger,
  SIZE_PROTOCOL_VERSION,
} from "./size-report.js";

const requiredBundlerRoles: Record<BundlerEvidence["bundler"], readonly string[]> = {
  vite: [
    "core-initial",
    "react-initial",
    "vue-initial",
    "svelte-initial",
    "shell-initial",
    "worker-async",
    "xlsx-async",
    "charts-async",
    "queries-async",
    "chrome-async",
  ],
  webpack: ["core-initial", "worker-async", "chrome-async"],
  next: ["core-initial"],
};
/** Lazily loaded roles; an asset that also belongs to an initial entry defeats the split. */
const ASYNC_ROLES: Readonly<Record<string, true>> = {
  "worker-async": true,
  "xlsx-async": true,
  "charts-async": true,
  "queries-async": true,
  "chrome-async": true,
};
const ATTRIBUTION_METHOD = "source-map-generated-spans-with-explicit-opaque-assets-v2";
const COMPARABLE_ENTRY = "core-first-paint";
const SUBPATH_CANDIDATES = ["sync", "collaboration", "rebase", "persistence"] as const;

export function validateBundlerEvidence(value: unknown): BundlerEvidence {
  if (value === null || typeof value !== "object") throw new Error("Bundler evidence is malformed");
  const candidate = value as Record<string, unknown>;
  if (candidate.schemaVersion !== SIZE_PROTOCOL_VERSION) {
    throw new Error(`Bundler evidence protocol mismatch: ${String(candidate.schemaVersion)}`);
  }
  if (!(["next", "vite", "webpack"] as unknown[]).includes(candidate.bundler)) {
    throw new Error(`Unknown bundler evidence owner: ${String(candidate.bundler)}`);
  }
  if (
    typeof candidate.version !== "string" ||
    candidate.version.length === 0 ||
    !Array.isArray(candidate.assets)
  ) {
    throw new Error("Bundler evidence has invalid version or assets");
  }
  const bundler = candidate.bundler as BundlerEvidence["bundler"];
  const seen = new Set<string>();
  const assets = candidate.assets.map((value, index) => {
    if (value === null || typeof value !== "object") {
      throw new Error(`${bundler} asset ${index} is malformed`);
    }
    const asset = value as Record<string, unknown>;
    if (
      typeof asset.path !== "string" ||
      asset.path.length === 0 ||
      !(asset.kind === "javascript" || asset.kind === "css" || asset.kind === "wasm") ||
      typeof asset.owner !== "string" ||
      asset.owner.length === 0 ||
      asset.owner === "unclassified" ||
      !Array.isArray(asset.roles) ||
      asset.roles.length === 0 ||
      !asset.roles.every((role) => typeof role === "string" && role.length > 0)
    ) {
      throw new Error(`${bundler} asset ${index} is missing path, kind, owner, or roles`);
    }
    if (seen.has(asset.path)) throw new Error(`${bundler} contains duplicate asset ${asset.path}`);
    seen.add(asset.path);
    return {
      path: asset.path,
      kind: asset.kind,
      owner: asset.owner,
      roles: [...new Set(asset.roles as string[])].sort(),
    } as BundlerAsset;
  });
  for (const role of requiredBundlerRoles[bundler]) {
    if (!assets.some((asset) => asset.roles.includes(role))) {
      throw new Error(`${bundler} is missing required ${role} asset ownership`);
    }
  }
  if (!assets.some((asset) => asset.kind === "wasm")) {
    throw new Error(`${bundler} is missing a required WASM asset`);
  }
  const initialRoles = new Set([
    "core-initial",
    "react-initial",
    "vue-initial",
    "svelte-initial",
    "shell-initial",
  ]);
  for (const asset of assets) {
    if (
      asset.roles.some((role) => ASYNC_ROLES[role] === true) &&
      asset.roles.some((role) => initialRoles.has(role))
    ) {
      throw new Error(`${bundler} async asset ${asset.path} leaked into an initial entry`);
    }
  }

  if (candidate.provenance === null || typeof candidate.provenance !== "object") {
    throw new Error(`${bundler} is missing build provenance`);
  }
  const provenanceValue = candidate.provenance as Record<string, unknown>;
  const minifierValue = provenanceValue.minifier;
  if (
    typeof provenanceValue.buildMode !== "string" ||
    provenanceValue.buildMode.length === 0 ||
    typeof provenanceValue.minified !== "boolean" ||
    minifierValue === null ||
    typeof minifierValue !== "object" ||
    typeof (minifierValue as Record<string, unknown>).name !== "string" ||
    (minifierValue as Record<string, unknown>).name === "" ||
    typeof (minifierValue as Record<string, unknown>).version !== "string" ||
    (minifierValue as Record<string, unknown>).version === "" ||
    !Array.isArray(provenanceValue.externals) ||
    !provenanceValue.externals.every(
      (external) => typeof external === "string" && external.length > 0,
    ) ||
    typeof provenanceValue.target !== "string" ||
    provenanceValue.target.length === 0 ||
    provenanceValue.sourceMaps !== BUNDLER_SOURCE_MAP_MODE ||
    provenanceValue.attributionMethod !== ATTRIBUTION_METHOD
  ) {
    throw new Error(`${bundler} build provenance is malformed or unsupported`);
  }
  const externals = provenanceValue.externals as string[];
  if (new Set(externals).size !== externals.length) {
    throw new Error(`${bundler} build provenance contains duplicate externals`);
  }
  const provenance: BundlerProvenance = {
    buildMode: provenanceValue.buildMode,
    minified: provenanceValue.minified,
    minifier: {
      name: (minifierValue as Record<string, unknown>).name as string,
      version: (minifierValue as Record<string, unknown>).version as string,
    },
    externals: [...externals].sort(),
    target: provenanceValue.target,
    sourceMaps: provenanceValue.sourceMaps,
    attributionMethod: provenanceValue.attributionMethod,
  };

  if (!Array.isArray(candidate.attribution) || candidate.attribution.length === 0) {
    throw new Error(`${bundler} is missing module attribution`);
  }
  const assetByPath = new Map(assets.map((asset) => [asset.path, asset]));
  const seenEntries = new Set<string>();
  const attribution = candidate.attribution.map((value, entryIndex) => {
    if (value === null || typeof value !== "object") {
      throw new Error(`${bundler} attribution entry ${entryIndex} is malformed`);
    }
    const entry = value as Record<string, unknown>;
    if (
      typeof entry.name !== "string" ||
      entry.name.length === 0 ||
      typeof entry.entry !== "string" ||
      entry.entry.length === 0 ||
      !Array.isArray(entry.eagerImports) ||
      entry.eagerImports.length === 0 ||
      !entry.eagerImports.every(
        (specifier) => typeof specifier === "string" && specifier.length > 0,
      ) ||
      !Array.isArray(entry.assets) ||
      entry.assets.length === 0 ||
      !entry.assets.every(
        (asset) =>
          asset !== null &&
          typeof asset === "object" &&
          typeof (asset as Record<string, unknown>).path === "string" &&
          ((asset as Record<string, unknown>).path as string).length > 0 &&
          typeof (asset as Record<string, unknown>).sha256 === "string" &&
          /^[a-f0-9]{64}$/.test((asset as Record<string, unknown>).sha256 as string),
      ) ||
      !isNonNegativeInteger(entry.generatedBytes) ||
      entry.generatedBytes === 0 ||
      !Array.isArray(entry.modules) ||
      entry.modules.length === 0
    ) {
      throw new Error(`${bundler} attribution entry ${entryIndex} is incomplete`);
    }
    if (seenEntries.has(entry.name)) {
      throw new Error(`${bundler} contains duplicate attribution entry ${entry.name}`);
    }
    seenEntries.add(entry.name);
    const attributedAssets = (entry.assets as Array<Record<string, unknown>>).map((asset) => ({
      path: asset.path as string,
      sha256: asset.sha256 as string,
    }));
    const attributedPaths = attributedAssets.map((asset) => asset.path);
    if (new Set(attributedPaths).size !== attributedPaths.length) {
      throw new Error(`${bundler} ${entry.name} contains duplicate attributed assets`);
    }
    for (const { path } of attributedAssets) {
      const asset = assetByPath.get(path);
      if (asset === undefined || asset.kind !== "javascript") {
        throw new Error(`${bundler} ${entry.name} attributes unknown JavaScript asset ${path}`);
      }
    }
    const seenModules = new Set<string>();
    const modules = entry.modules.map((value, moduleIndex) => {
      if (value === null || typeof value !== "object") {
        throw new Error(`${bundler} ${entry.name} module ${moduleIndex} is malformed`);
      }
      const module = value as Record<string, unknown>;
      if (
        typeof module.id !== "string" ||
        module.id.length === 0 ||
        typeof module.owner !== "string" ||
        module.owner.length === 0 ||
        module.owner === "unclassified" ||
        !(module.attribution === "source-map" || module.attribution === "opaque-asset") ||
        !isNonNegativeInteger(module.rawBytes) ||
        module.rawBytes === 0 ||
        !isNonNegativeInteger(module.gzipBytes) ||
        module.gzipBytes === 0 ||
        !isNonNegativeInteger(module.brotliBytes) ||
        module.brotliBytes === 0
      ) {
        throw new Error(`${bundler} ${entry.name} module ${moduleIndex} lacks ownership or sizes`);
      }
      const opaqueIdentity =
        module.owner === `${bundler}:opaque-framework` &&
        (module.id as string).startsWith(`${bundler}:opaque/`);
      if ((module.attribution === "opaque-asset") !== opaqueIdentity) {
        throw new Error(
          `${bundler} ${entry.name} module ${moduleIndex} has invalid opaque ownership`,
        );
      }
      if (seenModules.has(module.id)) {
        throw new Error(`${bundler} ${entry.name} contains duplicate module ${module.id}`);
      }
      seenModules.add(module.id);
      return {
        id: module.id,
        owner: module.owner,
        attribution: module.attribution,
        rawBytes: module.rawBytes,
        gzipBytes: module.gzipBytes,
        brotliBytes: module.brotliBytes,
      } as BundlerModuleAttribution;
    });
    const attributedBytes = modules.reduce((sum, module) => sum + module.rawBytes, 0);
    if (attributedBytes !== entry.generatedBytes) {
      throw new Error(
        `${bundler} ${entry.name} module bytes ${attributedBytes} do not equal generated bytes ${entry.generatedBytes}`,
      );
    }
    return {
      name: entry.name,
      entry: entry.entry,
      eagerImports: [...new Set(entry.eagerImports as string[])].sort(),
      assets: attributedAssets.sort((left, right) => left.path.localeCompare(right.path)),
      generatedBytes: entry.generatedBytes,
      modules: modules.sort((left, right) => left.id.localeCompare(right.id)),
    } as BundlerEntryAttribution;
  });
  if (!seenEntries.has(COMPARABLE_ENTRY)) {
    throw new Error(`${bundler} is missing ${COMPARABLE_ENTRY} module attribution`);
  }
  return {
    schemaVersion: SIZE_PROTOCOL_VERSION,
    bundler,
    version: candidate.version,
    assets,
    provenance,
    attribution,
  };
}

export function validateComparableAttribution(evidence: readonly BundlerEvidence[]): void {
  const byBundler = new Map(evidence.map((entry) => [entry.bundler, entry]));
  const next = byBundler.get("next");
  const vite = byBundler.get("vite");
  if (next === undefined || vite === undefined) {
    throw new Error("Comparable attribution requires both Next.js and Vite evidence");
  }
  for (const entry of [next, vite]) {
    if (
      entry.provenance.buildMode !== "production" ||
      entry.provenance.minified !== true ||
      entry.provenance.target !== "browser" ||
      entry.provenance.sourceMaps !== BUNDLER_SOURCE_MAP_MODE ||
      entry.provenance.attributionMethod !== ATTRIBUTION_METHOD
    ) {
      throw new Error(`${entry.bundler} attribution is not a minified production browser build`);
    }
  }
  for (const field of [
    "buildMode",
    "minified",
    "target",
    "sourceMaps",
    "attributionMethod",
  ] as const) {
    if (next.provenance[field] !== vite.provenance[field]) {
      throw new Error(`Next.js and Vite attribution differ in ${field}`);
    }
  }
  if (JSON.stringify(next.provenance.externals) !== JSON.stringify(vite.provenance.externals)) {
    throw new Error("Next.js and Vite attribution use incomparable externals");
  }
  const nextEntry = next.attribution.find((entry) => entry.name === COMPARABLE_ENTRY);
  const viteEntry = vite.attribution.find((entry) => entry.name === COMPARABLE_ENTRY);
  if (nextEntry === undefined || viteEntry === undefined) {
    throw new Error(`Comparable attribution is missing ${COMPARABLE_ENTRY}`);
  }
  if (JSON.stringify(nextEntry.eagerImports) !== JSON.stringify(viteEntry.eagerImports)) {
    throw new Error("Next.js and Vite first-paint eager imports differ");
  }
}
export function buildAttributionFindings(
  evidence: readonly BundlerEvidence[],
): AttributionFindings {
  validateComparableAttribution(evidence);
  const comparable = (bundler: "next" | "vite") => {
    const owner = evidence.find((entry) => entry.bundler === bundler);
    const entry = owner?.attribution.find((candidate) => candidate.name === COMPARABLE_ENTRY);
    if (owner === undefined || entry === undefined) {
      throw new Error(`Missing ${bundler} ${COMPARABLE_ENTRY} attribution`);
    }
    return { owner, entry };
  };
  const next = comparable("next");
  const vite = comparable("vite");
  const pairs = [next, vite] as const;
  const firstPaint = pairs.map(({ owner, entry }) => ({
    bundler: owner.bundler as "next" | "vite",
    generatedBytes: entry.generatedBytes,
    sheetwriteRawBytes: entry.modules
      .filter((module) => module.owner === "@sheetwrite/core")
      .reduce((sum, module) => sum + module.rawBytes, 0),
    rootBarrelRawBytes: entry.modules
      .filter(
        (module) =>
          module.owner === "@sheetwrite/core" &&
          /(?:^|\/)(?:dist\/index\.js|src\/index\.ts)$/.test(module.id),
      )
      .reduce((sum, module) => sum + module.rawBytes, 0),
    eagerImports: entry.eagerImports,
  }));
  const subpaths: AttributionFindings["subpaths"] = SUBPATH_CANDIDATES.map((subpath) => {
    const modulePattern = new RegExp(`(?:^|/)(?:dist/${subpath}\\.js|src/${subpath}\\.ts)$`);
    const retainedModules = pairs.map(({ owner, entry }) => {
      const modules = entry.modules.filter(
        (module) => module.owner === "@sheetwrite/core" && modulePattern.test(module.id),
      );
      return {
        bundler: owner.bundler as "next" | "vite",
        rawBytes: modules.reduce((sum, module) => sum + module.rawBytes, 0),
        brotliBytes: modules.reduce((sum, module) => sum + module.brotliBytes, 0),
      };
    });
    const retained = retainedModules.some((measurement) => measurement.rawBytes > 0);
    return {
      subpath,
      publicExportAdded: false,
      decision: retained ? "requires-isolated-subpath-proof" : "retain-root-export",
      reason: retained
        ? "The module is present in a comparable first-paint graph, but attribution alone does not prove the counterfactual bundle saving required for a public subpath."
        : "Neither comparable first-paint graph retains this module, so a dedicated public subpath has no measured initial-bundle benefit.",
      retainedModules,
      materialWinThreshold: { brotliBytes: 7680, percent: 10 },
    };
  });
  return {
    comparison: {
      entry: COMPARABLE_ENTRY,
      buildMode: next.owner.provenance.buildMode,
      minified: true,
      externals: next.owner.provenance.externals,
      target: next.owner.provenance.target,
      sourceMaps: next.owner.provenance.sourceMaps,
      attributionMethod: next.owner.provenance.attributionMethod,
      minifiers: {
        next: next.owner.provenance.minifier,
        vite: vite.owner.provenance.minifier,
      },
      fixtureAndConfigurationDifferences: pairs.map(({ owner, entry }) => ({
        bundler: owner.bundler as "next" | "vite",
        eagerImports: entry.eagerImports,
        nonSheetwriteRawBytes: entry.modules
          .filter((module) => module.owner !== "@sheetwrite/core")
          .reduce((sum, module) => sum + module.rawBytes, 0),
        opaqueFrameworkRawBytes: entry.modules
          .filter((module) => module.attribution === "opaque-asset")
          .reduce((sum, module) => sum + module.rawBytes, 0),
      })),
    },
    firstPaint,
    subpaths,
  };
}

export async function loadBundlerEvidence(
  reuseBundlers: boolean,
  artifactDirectory?: string,
): Promise<BundlerEvidence[]> {
  if (!reuseBundlers) {
    const command = ["node", "test/bundler-fixtures/run.mjs"];
    if (artifactDirectory !== undefined) command.push("--artifacts", resolve(artifactDirectory));
    await runCommand(command);
  }
  const evidence: BundlerEvidence[] = [];
  for (const bundler of ["vite", "webpack", "next"] as const) {
    const path = join(bundlerEvidenceRoot, `${bundler}.json`);
    evidence.push(validateBundlerEvidence(await readJson<unknown>(path)));
  }
  validateComparableAttribution(evidence);
  return evidence;
}

export function assertAttributionAssetsFresh(
  evidence: Pick<BundlerEvidence, "bundler" | "attribution">,
  assets: readonly Pick<AssetReport, "path" | "rawBytes" | "sha256">[],
): void {
  const assetByPath = new Map(assets.map((asset) => [asset.path, asset]));
  for (const entry of evidence.attribution) {
    let generatedBytes = 0;
    for (const attributed of entry.assets) {
      const asset = assetByPath.get(attributed.path);
      if (asset === undefined) {
        throw new Error(
          `${evidence.bundler} ${entry.name} attribution asset disappeared: ${attributed.path}`,
        );
      }
      if (asset.sha256 !== attributed.sha256) {
        throw new Error(
          `${evidence.bundler} ${entry.name} attribution asset SHA-256 changed: ${attributed.path}`,
        );
      }
      generatedBytes += asset.rawBytes;
    }
    if (generatedBytes !== entry.generatedBytes) {
      throw new Error(
        `${evidence.bundler} ${entry.name} generated bytes changed after attribution`,
      );
    }
  }
}
