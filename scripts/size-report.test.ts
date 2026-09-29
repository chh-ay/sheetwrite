import { describe, expect, it } from "bun:test";
import {
  FIRST_PAINT_BROTLI_GATE_BYTES,
  FIRST_PAINT_DEFERRED_MODULE,
  firstPaintGate,
  validateFirstPaintEvidence,
} from "./first-paint-evidence.js";
import {
  BUNDLER_SOURCE_MAP_MODE,
  classifyPackedPath,
  parsePackJson,
  SIZE_PROTOCOL_VERSION,
  summarizePack,
  validateBundlerEvidence,
  validateComparableAttribution,
} from "./size-report.js";

function packJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify([
    {
      filename: "sheetwrite.tgz",
      size: 4,
      unpackedSize: 3,
      files: [
        { path: "dist/index.js", size: 2 },
        { path: "package.json", size: 1 },
      ],
      ...overrides,
    },
  ]);
}

function evidence(
  assets: unknown[],
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const initialPath =
    (assets as Array<{ path?: unknown; kind?: unknown; roles?: unknown }>).find(
      (asset) =>
        asset.kind === "javascript" &&
        Array.isArray(asset.roles) &&
        asset.roles.includes("core-initial"),
    )?.path ?? "dist/main.js";
  return {
    schemaVersion: SIZE_PROTOCOL_VERSION,
    bundler: "webpack",
    version: "5.102.1",
    assets,
    provenance: {
      buildMode: "production",
      minified: true,
      minifier: { name: "terser-webpack-plugin", version: "5.3.14" },
      externals: [],
      target: "browser",
      sourceMaps: BUNDLER_SOURCE_MAP_MODE,
      attributionMethod: "source-map-generated-spans-with-explicit-opaque-assets-v2",
    },
    attribution: [
      {
        name: "core-first-paint",
        entry: "src/main.js",
        eagerImports: ["@sheetwrite/core#createGrid", "@sheetwrite/core#initSheetwrite"],
        assets: [{ path: initialPath, sha256: "a".repeat(64) }],
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

function comparableEvidence(bundler: "next" | "vite", overrides: Record<string, unknown> = {}) {
  const roles =
    bundler === "next"
      ? ["core-initial"]
      : [
          "core-initial",
          "react-initial",
          "vue-initial",
          "svelte-initial",
          "worker-async",
          "xlsx-async",
        ];
  const assets = roles.map((role) => ({
    path: `dist/${role}.js`,
    kind: "javascript",
    owner: role,
    roles: [role],
  }));
  assets.push({
    path: "dist/runtime.wasm",
    kind: "wasm",
    owner: "core-initial",
    roles: ["core-initial"],
  });
  return validateBundlerEvidence(
    evidence(assets, {
      bundler,
      version: bundler === "next" ? "15.5.9" : "7.2.2",
      provenance: {
        buildMode: "production",
        minified: true,
        minifier: {
          name: bundler === "next" ? "next-swc" : "esbuild",
          version: bundler === "next" ? "15.5.9" : "0.25.12",
        },
        externals: [],
        target: "browser",
        sourceMaps: BUNDLER_SOURCE_MAP_MODE,
        attributionMethod: "source-map-generated-spans-with-explicit-opaque-assets-v2",
      },
      ...overrides,
    }),
  );
}

describe("npm pack parsing and classification", () => {
  it("fails closed on malformed, duplicate, and unclassified pack data", () => {
    expect(() => parsePackJson("not-json")).toThrow("Malformed npm pack JSON");
    expect(() => parsePackJson("[]")).toThrow("exactly one result");
    expect(() =>
      parsePackJson(
        packJson({
          unpackedSize: 4,
          files: [
            { path: "dist/index.js", size: 2 },
            { path: "dist/index.js", size: 2 },
          ],
        }),
      ),
    ).toThrow("duplicate file");
    expect(() => classifyPackedPath("dist/unexpected.bin")).toThrow("Unclassified");
    expect(() => summarizePack("test", parsePackJson(packJson({ unpackedSize: 99 })))).toThrow(
      "do not equal",
    );
  });
});

describe("manifest ownership", () => {
  const complete = [
    {
      path: "dist/main-renamed.js",
      kind: "javascript",
      owner: "core-initial",
      roles: ["core-initial"],
    },
    {
      path: "dist/worker-any-hash.js",
      kind: "javascript",
      owner: "worker-async",
      roles: ["worker-async"],
    },
    {
      path: "dist/runtime-any-hash.wasm",
      kind: "wasm",
      owner: "core-initial",
      roles: ["core-initial"],
    },
  ];

  it("rejects missing, duplicate, unclassified, and leaked assets", () => {
    expect(() => validateBundlerEvidence(evidence(complete.slice(0, 1)))).toThrow(
      "missing required worker-async",
    );
    expect(() => validateBundlerEvidence(evidence([...complete, complete[0]]))).toThrow(
      "duplicate asset",
    );
    expect(() =>
      validateBundlerEvidence(
        evidence([{ ...complete[0], owner: "unclassified" }, ...complete.slice(1)]),
      ),
    ).toThrow("missing path, kind, owner, or roles");
    expect(() =>
      validateBundlerEvidence(
        evidence([
          complete[0],
          { ...complete[1], roles: ["core-initial", "worker-async"] },
          complete[2],
        ]),
      ),
    ).toThrow("leaked into an initial entry");
  });

  it("rejects incomparable modes, externals, and eager imports", () => {
    const next = comparableEvidence("next");
    const vite = comparableEvidence("vite");
    const development = comparableEvidence("vite", {
      provenance: { ...vite.provenance, buildMode: "development" },
    });
    expect(() => validateComparableAttribution([next, development])).toThrow(
      "not a minified production browser build",
    );
    const externalized = comparableEvidence("vite", {
      provenance: { ...vite.provenance, externals: ["react"] },
    });
    expect(() => validateComparableAttribution([next, externalized])).toThrow(
      "incomparable externals",
    );
    const differentImports = comparableEvidence("vite", {
      attribution: vite.attribution.map((entry) => ({
        ...entry,
        eagerImports: ["@sheetwrite/core#createGrid"],
      })),
    });
    expect(() => validateComparableAttribution([next, differentImports])).toThrow(
      "eager imports differ",
    );
  });
});

function firstPaintEvidence(): Record<string, unknown> {
  const fixture = (bundler: "next" | "vite") => ({
    bundler,
    version: bundler === "next" ? "15.5.9" : "7.2.2",
    provenance: {
      buildMode: "production",
      minified: true,
      minifier: {
        name: bundler === "next" ? "next-swc" : "esbuild",
        version: bundler === "next" ? "15.5.9" : "0.25.12",
      },
      externals: [],
      target: "browser",
      sourceMaps: BUNDLER_SOURCE_MAP_MODE,
      attributionMethod: "source-map-generated-spans-with-explicit-opaque-assets-v2",
    },
    eagerImports: ["@sheetwrite/core#createGrid", "@sheetwrite/core#initSheetwrite"],
    baseline: {
      initialJavaScript: { rawBytes: 200_000, gzipBytes: 70_000, brotliBytes: 60_000 },
      timing: { samplesMs: new Array(10).fill(20), medianMs: 20, p95Ms: 20 },
      checksum: "a".repeat(64),
    },
    candidate: {
      initialJavaScript: { rawBytes: 160_000, gzipBytes: 56_000, brotliBytes: 50_000 },
      timing: { samplesMs: new Array(10).fill(19), medianMs: 19, p95Ms: 19 },
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
    fixtures: [fixture("next"), fixture("vite")],
  };
}

describe("first-paint counterfactual evidence", () => {
  it("admits complete comparable evidence only when both size and timing gates pass", () => {
    const evidence = firstPaintEvidence();
    expect(validateFirstPaintEvidence(evidence).fixtures).toHaveLength(2);
    expect(firstPaintGate(evidence)).toEqual({ admitted: true, reasons: [] });
  });

  it("rejects incomparable semantics, provenance, samples, and recorded deltas", () => {
    const mutations = [
      (evidence: Record<string, unknown>) => {
        const fixture = (evidence.fixtures as Array<Record<string, unknown>>)[0]!;
        (fixture.candidate as Record<string, unknown>).checksum = "b".repeat(64);
      },
      (evidence: Record<string, unknown>) => {
        const fixture = (evidence.fixtures as Array<Record<string, unknown>>)[0]!;
        (fixture.provenance as Record<string, unknown>).buildMode = "development";
      },
      (evidence: Record<string, unknown>) => {
        const fixture = (evidence.fixtures as Array<Record<string, unknown>>)[0]!;
        const candidate = fixture.candidate as Record<string, unknown>;
        (candidate.timing as Record<string, unknown>).samplesMs = [19];
      },
      (evidence: Record<string, unknown>) => {
        const fixture = (evidence.fixtures as Array<Record<string, unknown>>)[0]!;
        (fixture.delta as Record<string, unknown>).brotliBytes = 9_999;
      },
    ];
    for (const mutate of mutations) {
      const evidence = structuredClone(firstPaintEvidence());
      mutate(evidence);
      expect(() => validateFirstPaintEvidence(evidence)).toThrow();
    }
  });

  it("fails closed on either insufficient reduction or slower first paint", () => {
    const evidence = firstPaintEvidence();
    const vite = (evidence.fixtures as Array<Record<string, unknown>>)[1]!;
    const baseline = vite.baseline as Record<string, unknown>;
    const candidate = vite.candidate as Record<string, unknown>;
    candidate.initialJavaScript = {
      rawBytes: 210_000,
      gzipBytes: 75_000,
      brotliBytes: 62_000,
    };
    vite.delta = {
      rawBytes: -10_000,
      gzipBytes: -5_000,
      brotliBytes: -2_000,
      brotliPercent: (-2_000 / 60_000) * 100,
    };
    candidate.timing = {
      samplesMs: new Array(10).fill(21),
      medianMs: 21,
      p95Ms: 21,
    };
    baseline.timing = {
      samplesMs: new Array(10).fill(20),
      medianMs: 20,
      p95Ms: 20,
    };
    const decision = firstPaintGate(evidence);
    expect(decision.admitted).toBe(false);
    expect(decision.reasons).toContain("vite Brotli reduction is below 7680 bytes");
    expect(decision.reasons).toContain("vite Brotli reduction is below 10%");
    expect(decision.reasons).toContain("vite candidate median first paint is slower");
    expect(decision.reasons).toContain("vite candidate p95 first paint is slower");
  });
});
