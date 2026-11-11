import { describe, expect, it } from "bun:test";

import {
  FIRST_PAINT_BROTLI_GATE_BYTES,
  FIRST_PAINT_DEFERRED_MODULE,
  type FirstPaintTiming,
  firstPaintGate,
  validateFirstPaintEvidence,
} from "./first-paint-evidence.js";
import { validateBundlerEvidence, validateComparableAttribution } from "./size-bundler-evidence.js";
import { classifyPackedPath, summarizePack } from "./size-install.js";
import { BUNDLER_SOURCE_MAP_MODE, SIZE_PROTOCOL_VERSION } from "./size-report.js";

type Bundler = "next" | "vite" | "webpack";

const MINIFIERS: Record<Bundler, { version: string; minifier: { name: string; version: string } }> =
  {
    next: { version: "15.5.9", minifier: { name: "next-swc", version: "15.5.9" } },
    vite: { version: "7.2.2", minifier: { name: "esbuild", version: "0.25.12" } },
    webpack: { version: "5.102.1", minifier: { name: "terser-webpack-plugin", version: "5.3.14" } },
  };
const EAGER_IMPORTS = ["@sheetwrite/core#createGrid", "@sheetwrite/core#initSheetwrite"];

function provenance(bundler: Bundler) {
  return {
    buildMode: "production",
    minified: true,
    minifier: MINIFIERS[bundler].minifier,
    externals: [] as string[],
    target: "browser",
    sourceMaps: BUNDLER_SOURCE_MAP_MODE,
    attributionMethod: "source-map-generated-spans-with-explicit-opaque-assets-v2",
  };
}

const asset = (role: string, kind = "javascript", path = `dist/${role}.js`) => ({
  path,
  kind,
  owner: role,
  roles: [role],
});

function evidence(
  assets: Array<{ path: string; kind: string; roles: string[] }>,
  bundler: Bundler = "webpack",
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const initial = assets.find(
    (entry) => entry.kind === "javascript" && entry.roles.includes("core-initial"),
  );
  return {
    schemaVersion: SIZE_PROTOCOL_VERSION,
    bundler,
    version: MINIFIERS[bundler].version,
    assets,
    provenance: provenance(bundler),
    attribution: [
      {
        name: "core-first-paint",
        entry: "src/main.js",
        eagerImports: EAGER_IMPORTS,
        assets: [{ path: initial?.path ?? "dist/main.js", sha256: "a".repeat(64) }],
        generatedBytes: 10,
        modules: [
          {
            id: "@sheetwrite/core/dist/index.js",
            owner: "@sheetwrite/core",
            attribution: "source-map",
            rawBytes: 10,
            gzipBytes: 8,
            brotliBytes: 6,
          },
        ],
      },
    ],
    ...overrides,
  };
}

const VITE_ROLES = [
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
];

function comparable(bundler: "next" | "vite", overrides: Record<string, unknown> = {}) {
  const roles = bundler === "next" ? ["core-initial"] : VITE_ROLES;
  const assets = [
    ...roles.map((role) => asset(role)),
    asset("core-initial", "wasm", "dist/runtime.wasm"),
  ];
  return validateBundlerEvidence(evidence(assets, bundler, overrides));
}

describe("packed file classification", () => {
  it("fails closed on unclassified files and inconsistent unpacked sizes", () => {
    expect(classifyPackedPath("dist/icons.svg")).toBe("assets");
    // The icon sheet's layout manifest is the only JSON asset.
    expect(classifyPackedPath("dist/icons.json")).toBe("assets");
    expect(() => classifyPackedPath("dist/unexpected.json")).toThrow("Unclassified");
    expect(() => classifyPackedPath("dist/unexpected.bin")).toThrow("Unclassified");
    expect(() =>
      summarizePack("test", {
        filename: "sheetwrite.tgz",
        size: 4,
        unpackedSize: 99,
        files: [
          { path: "dist/index.js", size: 2 },
          { path: "package.json", size: 1 },
        ],
      }),
    ).toThrow("do not equal");
  });
});

describe("manifest ownership", () => {
  const [core, worker, ribbon, wasm] = [
    asset("core-initial", "javascript", "dist/main-renamed.js"),
    asset("worker-async", "javascript", "dist/worker-any-hash.js"),
    asset("chrome-async", "javascript", "dist/worker-ribbon-hash.js"),
    asset("core-initial", "wasm", "dist/runtime-any-hash.wasm"),
  ];

  it.each([
    ["a missing required asset", [core], "missing required worker-async"],
    [
      "an unclassified asset",
      [{ ...core, owner: "unclassified" }, worker, ribbon, wasm],
      "missing path, kind, owner, or roles",
    ],
    [
      "a lazy chunk leaked into an initial entry",
      [core, worker, { ...ribbon, roles: ["chrome-async", "core-initial"] }, wasm],
      "leaked into an initial entry",
    ],
  ])("rejects %s", (_label, assets, message) => {
    expect(() => validateBundlerEvidence(evidence(assets))).toThrow(message);
  });

  it("rejects incomparable modes, externals, and eager imports", () => {
    const next = comparable("next");
    const vite = comparable("vite");
    for (const [overrides, message] of [
      [
        { provenance: { ...vite.provenance, buildMode: "development" } },
        "not a minified production browser build",
      ],
      [{ provenance: { ...vite.provenance, externals: ["react"] } }, "incomparable externals"],
      [
        {
          attribution: vite.attribution.map((entry) => ({
            ...entry,
            eagerImports: ["@sheetwrite/core#createGrid"],
          })),
        },
        "eager imports differ",
      ],
    ] as const) {
      expect(() => validateComparableAttribution([next, comparable("vite", overrides)])).toThrow(
        message,
      );
    }
  });
});

interface FirstPaintVariant {
  initialJavaScript: { rawBytes: number; gzipBytes: number; brotliBytes: number };
  timing: FirstPaintTiming;
  checksum: string;
}
interface FirstPaintFixture {
  provenance: ReturnType<typeof provenance>;
  baseline: FirstPaintVariant;
  candidate: FirstPaintVariant;
  delta: { rawBytes: number; gzipBytes: number; brotliBytes: number; brotliPercent: number };
}

const steady = (ms: number): number[] => new Array(10).fill(ms);

function timing(samplesMs: number[]): FirstPaintTiming {
  const sorted = [...samplesMs].sort((left, right) => left - right);
  const rank = (fraction: number) => sorted[Math.ceil(sorted.length * fraction) - 1] ?? Number.NaN;
  return { samplesMs, medianMs: rank(0.5), p95Ms: rank(0.95) };
}

function firstPaintEvidence() {
  const fixture = (bundler: "next" | "vite") => ({
    bundler,
    version: MINIFIERS[bundler].version,
    provenance: provenance(bundler),
    eagerImports: EAGER_IMPORTS,
    baseline: {
      initialJavaScript: { rawBytes: 200_000, gzipBytes: 70_000, brotliBytes: 60_000 },
      timing: timing(steady(20)),
      checksum: "a".repeat(64),
    },
    candidate: {
      initialJavaScript: { rawBytes: 160_000, gzipBytes: 56_000, brotliBytes: 50_000 },
      timing: timing(steady(19)),
      checksum: "a".repeat(64),
      deferredChunk: "assets/clipboard-controller.js",
      interaction: {
        module: FIRST_PAINT_DEFERRED_MODULE,
        loaded: true,
        successOutcome: "empty",
        errorOutcome: "unsupported",
        rejected: false,
      },
    },
    delta: {
      rawBytes: 40_000,
      gzipBytes: 14_000,
      brotliBytes: 10_000,
      brotliPercent: (10_000 / 60_000) * 100,
    },
  });
  return {
    schemaVersion: SIZE_PROTOCOL_VERSION,
    kind: "first-paint-counterfactual",
    candidate: {
      fixtureOnly: true,
      shipping: false,
      deferredModules: [FIRST_PAINT_DEFERRED_MODULE],
    },
    thresholds: {
      brotliBytes: FIRST_PAINT_BROTLI_GATE_BYTES,
      percent: 10,
      timing: "median-and-p95-no-slower",
    },
    fixtures: [fixture("next"), fixture("vite")] as [FirstPaintFixture, FirstPaintFixture],
  };
}

describe("first-paint counterfactual evidence", () => {
  it("admits complete comparable evidence only when both size and timing gates pass", () => {
    const evidence = firstPaintEvidence();
    expect(validateFirstPaintEvidence(evidence).fixtures).toHaveLength(2);
    expect(firstPaintGate(evidence)).toEqual({ admitted: true, reasons: [] });
  });

  it.each<[string, (fixture: FirstPaintFixture) => void]>([
    ["checksum", (fixture) => (fixture.candidate.checksum = "b".repeat(64))],
    ["provenance", (fixture) => (fixture.provenance.buildMode = "development")],
    ["samples", (fixture) => (fixture.candidate.timing.samplesMs = [19])],
    ["recorded delta", (fixture) => (fixture.delta.brotliBytes = 9_999)],
  ])("rejects an incomparable %s", (_label, mutate) => {
    const evidence = firstPaintEvidence();
    mutate(evidence.fixtures[0]);
    expect(() => validateFirstPaintEvidence(evidence)).toThrow();
  });

  it.each([
    ["bytes", { candidateBrotli: 60_000 - (FIRST_PAINT_BROTLI_GATE_BYTES - 1) }],
    ["percent", { baselineBrotli: 100_000, candidateBrotli: 92_000 }],
    ["median", { baselineMs: [...steady(20).slice(1), 40], candidateMs: steady(21) }],
    ["p95", { candidateMs: [...steady(19).slice(1), 25] }],
  ] as const)("blocks admission when only the %s gate fails", (_gate, change) => {
    const evidence = firstPaintEvidence();
    const vite = evidence.fixtures[1];
    if ("baselineBrotli" in change)
      vite.baseline.initialJavaScript.brotliBytes = change.baselineBrotli;
    if ("candidateBrotli" in change)
      vite.candidate.initialJavaScript.brotliBytes = change.candidateBrotli;
    if ("baselineMs" in change) vite.baseline.timing = timing([...change.baselineMs]);
    if ("candidateMs" in change) vite.candidate.timing = timing([...change.candidateMs]);
    const baselineBytes = vite.baseline.initialJavaScript.brotliBytes;
    const reduction = baselineBytes - vite.candidate.initialJavaScript.brotliBytes;
    vite.delta.brotliBytes = reduction;
    vite.delta.brotliPercent = (reduction / baselineBytes) * 100;

    const decision = firstPaintGate(evidence);
    expect(decision.admitted).toBe(false);
    expect(decision.reasons).toHaveLength(1);
  });
});
