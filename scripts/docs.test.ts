import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  ADAPTER_DOC_CONTRACT,
  adapterContractIssues,
  documentationLinkRoutes,
  landingBenchPayload,
  renderEntryPage,
  renderSymbolPage,
  runCompletionSummary,
} from "./docs.js";
import type { ApiEntryPoint, ApiExport, ApiPackage, PublicApiManifest } from "./public-api.js";
import { PUBLISHABLE_PACKAGE_ORDER } from "./workspace-tooling.js";

const coreEntry: ApiEntryPoint = {
  subpath: ".",
  target: "./dist/index.d.ts",
  source: "src/index.ts",
  kind: "typescript",
  classification: "supported",
  exports: [
    {
      name: "Grid",
      kind: "interface",
      signature:
        'interface Grid { applyTransaction(tx: unknown): unknown; rendererKind(): "canvas" | "worker"; }',
      owners: ["src/types/grid.ts"],
      source: "src/types/grid.ts#L10",
      jsDocTags: [],
      documentation: "Imperative grid handle.",
      memberDocs: [
        {
          name: "applyTransaction",
          documentation: "Applies a committed transaction to the {@link Grid}. Bypasses history.",
        },
      ],
    },
    {
      name: "CommitReason",
      kind: "type",
      signature: 'type CommitReason = "api" | "edit-enter";',
      owners: ["src/types/document.ts"],
      source: "src/types/document.ts#L207",
      jsDocTags: [],
      documentation: "Classifies the producer of a committed transaction.",
      memberDocs: [],
    },
    {
      name: "ChangeEvent",
      kind: "interface",
      signature: "interface ChangeEvent { commitReason: CommitReason; }",
      owners: ["src/types/transaction.ts"],
      source: "src/types/transaction.ts#L160",
      jsDocTags: [],
      documentation: "Committed transaction event.",
      memberDocs: [
        {
          name: "commitReason",
          documentation: "What produced this commit — see {@link CommitReason}.",
        },
      ],
    },
  ],
};
const corePackage: ApiPackage = {
  name: "@sheetwrite/core",
  entryPoints: [coreEntry],
};

describe("documentation generation", () => {
  it("links entry indexes to documented symbols with unique member anchors", async () => {
    const entryPage = renderEntryPage(corePackage, coreEntry);
    const symbolPage = await renderSymbolPage(corePackage, coreEntry, coreEntry.exports[0]!);
    expect(entryPage).toContain('href="/docs/api/core/grid/"');

    const anchors = [...symbolPage.matchAll(/\sid="([^"]+)"/gu)].map((match) => match[1]!);
    expect(new Set(anchors).size).toBe(anchors.length);
    expect(anchors).toEqual(expect.arrayContaining(["applytransaction", "rendererkind"]));
    expect(symbolPage).toContain("Imperative grid handle.");
    expect(symbolPage).toContain("Applies a committed transaction to the");
    expect(symbolPage).toContain("Bypasses history.");
    expect(symbolPage).toContain('<a href="/docs/api/core/grid/"><code>Grid</code></a>');
    const changeEvent = coreEntry.exports.find((item) => item.name === "ChangeEvent")!;
    const changeEventPage = await renderSymbolPage(corePackage, coreEntry, changeEvent);
    expect(changeEventPage).toContain(
      '<a href="/docs/api/core/commit-reason/"><code>CommitReason</code></a>',
    );
  });

  it("keeps published package README links valid outside the monorepo", async () => {
    const root = resolve(import.meta.dir, "..");
    for (const name of PUBLISHABLE_PACKAGE_ORDER) {
      const directory = name.slice("@sheetwrite/".length);
      const readme = await readFile(resolve(root, "packages", directory, "README.md"), "utf8");
      const links = [...readme.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map((match) => match[1]!);
      for (const link of links) {
        expect(link).toMatch(
          /^https:\/\/(?:sheetwrite\.vercel\.app\/|github\.com\/chh-ay\/sheetwrite\/)/,
        );
      }
    }
  });

  it("never double-counts failed runs in the completion summary", () => {
    const results = [
      ...Array.from({ length: 5 }, () => ({ status: "success" })),
      { status: "failed" },
      { status: "failed" },
    ];
    // results[] already contains the failures; adding failedKeys on top
    // published 1120/1140 for a 1120-cell matrix.
    expect(runCompletionSummary(results)).toEqual({ successes: 5, total: 7, failures: 2 });
    expect(runCompletionSummary([])).toEqual({ successes: 0, total: 0, failures: 0 });
  });

  const benchResult = (
    engine: string,
    scenarioId: string,
    round: number,
    rows: number,
    medianMs: number,
    status = "success",
  ) => ({
    engine,
    scenarioId,
    round,
    rows,
    status,
    medianMs,
    p95Ms: medianMs * 1.1,
    madMs: 0.01,
    memory: { beforeBytes: 1_000_000, afterBytes: 2_000_000, deltaBytes: 1_000_000 },
    validation: [],
  });
  const benchEvidence = (results: ReturnType<typeof benchResult>[]) => ({
    protocolVersion: 1,
    metadata: {
      commit: "c".repeat(40),
      dirty: false,
      timestamp: "2026-07-17T00:00:00.000Z",
      bunVersion: "1",
      nodeVersion: "1",
      browserVersion: "149",
      os: "linux",
      arch: "x64",
      cpu: "test",
      rounds: 2,
      launchAttempts: [],
    },
    config: {
      engines: ["sheetwrite", "handsontable"],
      rows: [1_000, 1_000_000],
      scenarios: ["a", "b"],
    },
    results,
  });

  it("omits partial-round pairs and never publishes non-finite landing values", () => {
    const results = [
      // scenario a at 1k: Handsontable completes only 1 of 2 rounds.
      benchResult("sheetwrite", "a", 1, 1_000, 1),
      benchResult("sheetwrite", "a", 2, 1_000, 1),
      benchResult("handsontable", "a", 1, 1_000, 10),
      benchResult("handsontable", "a", 2, 1_000, 10, "failed"),
      // scenario b at 1k: full-round pair with a 5x gap.
      benchResult("sheetwrite", "b", 1, 1_000, 1),
      benchResult("sheetwrite", "b", 2, 1_000, 1),
      benchResult("handsontable", "b", 1, 1_000, 5),
      benchResult("handsontable", "b", 2, 1_000, 5),
      // 1M: Sheetwrite full rounds, no Handsontable at all.
      benchResult("sheetwrite", "a", 1, 1_000_000, 2),
      benchResult("sheetwrite", "a", 2, 1_000_000, 2),
      benchResult("sheetwrite", "b", 1, 1_000_000, 2),
      benchResult("sheetwrite", "b", 2, 1_000_000, 2),
    ];
    const payload = JSON.parse(
      landingBenchPayload({ evidence: benchEvidence(results), source: "x" }),
    );
    expect(payload.available).toBe(true);
    // The 1M size has zero full-round pairs and must be omitted, not NaN.
    expect(payload.sizes).toHaveLength(1);
    expect(payload.sizes[0]).toMatchObject({
      size: 1_000,
      comparedScenarios: 1,
      medianRatio: 5,
      handsontableIncomplete: 1,
    });
    expect(payload.heroStats).toMatchObject({ millionRowScenarios: 2, millionRowMedianMs: 2 });

    // A structurally valid artifact with no comparable pairs downgrades to the
    // placeholder payload - null must never reach the landing.
    const none = landingBenchPayload({
      evidence: benchEvidence(results.slice(0, 4)),
      source: "x",
    });
    expect(JSON.parse(none).available).toBe(false);
    expect(none).not.toContain("null");
  });
});
describe("adapter documentation contract", () => {
  const memberDocs = (names: readonly string[]) =>
    names.map((name) => ({ name, documentation: `${name} documentation.` }));

  const apiExport = (
    name: string,
    kind: string,
    signature: string,
    documented: readonly string[] = [],
  ) => ({
    name,
    kind,
    signature,
    owners: ["src/index.ts"],
    source: "src/index.ts#L1",
    jsDocTags: [],
    documentation: `${name} summary.`,
    memberDocs: memberDocs(documented),
  });

  const entry = (subpath: string, exports: ReturnType<typeof apiExport>[]): ApiEntryPoint => ({
    subpath,
    target: "./dist/index.d.ts",
    source: "src/index.ts",
    kind: "typescript",
    classification: "supported",
    exports,
  });

  const propsSignature = (members: readonly string[]) =>
    `export interface SheetwriteGridProps { ${members
      .map((name) => (name.includes("-") ? `"${name}"?: unknown;` : `${name}?: unknown;`))
      .join(" ")} }`;

  const readyEvent = () =>
    apiExport(
      "GridReadyEvent",
      "interface",
      "export interface GridReadyEvent { grid: Grid; generation: number; reason: GridReadyReason; }",
      ["grid", "generation", "reason"],
    );

  const conformingManifest = (): PublicApiManifest => ({
    formatVersion: 2,
    packages: [
      {
        name: "@sheetwrite/core",
        entryPoints: [
          entry(".", [
            apiExport(
              "GridOptions",
              "interface",
              propsSignature(ADAPTER_DOC_CONTRACT.inputs.filter((name) => name !== "wasmSource")),
              ADAPTER_DOC_CONTRACT.inputs.filter((name) => name !== "wasmSource"),
            ),
          ]),
          entry("./adapter", [
            apiExport(
              "GridReadyReason",
              "type",
              'export type GridReadyReason = "initial" | GridResetReason;',
            ),
            apiExport(
              "GridResetReason",
              "type",
              'export type GridResetReason = "input-reset" | "renderer-reset";',
            ),
          ]),
        ],
      },
      ...(["@sheetwrite/react", "@sheetwrite/svelte"] as const).map((name) => ({
        name,
        entryPoints: [
          entry(".", [
            apiExport(
              "SheetwriteGridProps",
              "interface",
              propsSignature([
                ...ADAPTER_DOC_CONTRACT.inputs,
                ...ADAPTER_DOC_CONTRACT.handlerEvents,
              ]),
              [...ADAPTER_DOC_CONTRACT.inputs, ...ADAPTER_DOC_CONTRACT.handlerEvents],
            ),
            readyEvent(),
          ]),
        ],
      })),
      {
        name: "@sheetwrite/vue",
        entryPoints: [
          entry(".", [
            apiExport(
              "SheetwriteGridProps",
              "interface",
              propsSignature([...ADAPTER_DOC_CONTRACT.inputs]),
              [...ADAPTER_DOC_CONTRACT.inputs],
            ),
            apiExport(
              "SheetwriteGridEmits",
              "interface",
              `export interface SheetwriteGridEmits { ${ADAPTER_DOC_CONTRACT.vueEvents
                .map((name) => `"${name}": unknown;`)
                .join(" ")} }`,
              [...ADAPTER_DOC_CONTRACT.vueEvents],
            ),
            readyEvent(),
          ]),
        ],
      },
    ],
  });

  it("mirrors canonical event casing", () => {
    const kebabOf = (handler: string) =>
      handler
        .replace(/^on/, "")
        .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
        .toLowerCase();
    expect([...ADAPTER_DOC_CONTRACT.vueEvents] as string[]).toEqual(
      ADAPTER_DOC_CONTRACT.handlerEvents.map(kebabOf),
    );
  });

  it("fails when GridOptions and the adapter input contract drift", () => {
    const manifest = conformingManifest();
    const options = manifest.packages[0]?.entryPoints
      .find((entry) => entry.subpath === ".")
      ?.exports.find((item) => item.name === "GridOptions");
    if (options === undefined) throw new Error("fixture shape changed");
    options.memberDocs.push({ name: "uncoveredInput", documentation: "Uncovered input." });
    expect(adapterContractIssues(manifest)).toContain(
      "GridOptions member uncoveredInput is not covered by the adapter documentation contract",
    );
  });

  it("fails when the Vue emits contract is missing", () => {
    const manifest = conformingManifest();
    const vue = manifest.packages[3];
    if (vue === undefined) throw new Error("fixture shape changed");
    vue.entryPoints[0]!.exports = vue.entryPoints[0]!.exports.filter(
      (item) => item.name !== "SheetwriteGridEmits",
    );
    expect(adapterContractIssues(manifest)).toContain(
      "@sheetwrite/vue does not export SheetwriteGridEmits",
    );
  });
});
describe("API symbol page reading experience", () => {
  const apiExport = (
    name: string,
    kind: string,
    signature: string,
    documentation = `${name} summary.`,
  ): ApiExport => ({
    name,
    kind,
    signature,
    owners: ["src/index.ts"],
    source: "src/index.ts#L1",
    jsDocTags: [],
    documentation,
    memberDocs: [],
  });

  const entryPoint = (subpath: string, exports: ApiExport[]): ApiEntryPoint => ({
    subpath,
    target: "./dist/index.d.ts",
    source: "src/index.ts",
    kind: "typescript",
    classification: "supported",
    exports,
  });

  const storageEntry = () =>
    entryPoint(".", [
      apiExport(
        "STORAGE_MODES",
        "variable",
        'readonly ["memory", "session"]',
        "Every storage mode.",
      ),
      apiExport("StorageMode", "type", "export type StorageMode = (typeof STORAGE_MODES)[number];"),
      apiExport(
        "StorageOptions",
        "interface",
        [
          "interface StorageOptions {",
          '  mode: "memory" | "session";',
          "  storage?: StorageMode;",
          "}",
        ].join("\n"),
      ),
    ]);

  it("links an expanded union member to the alias that names it", async () => {
    const entry = storageEntry();
    const adapter = entryPoint("./adapter", [
      apiExport(
        "STORAGE_MODES",
        "variable",
        'readonly ["memory", "session"]',
        "Every storage mode.",
      ),
      apiExport("StorageMode", "type", "export type StorageMode = (typeof STORAGE_MODES)[number];"),
    ]);
    const pkg: ApiPackage = { name: "@sheetwrite/core", entryPoints: [entry, adapter] };
    const routes = documentationLinkRoutes({ formatVersion: 2, packages: [pkg] });
    const options = entry.exports.find((item) => item.name === "StorageOptions");
    if (options === undefined) throw new Error("fixture shape changed");

    const page = await renderSymbolPage(pkg, entry, options, routes);

    const memberRow =
      /<details class="api-member" id="storage-options-mode"[\s\S]*?<\/details>/.exec(page)?.[0] ??
      "";
    const declaration = /<details class="api-declaration"[\s\S]*?<\/details>/.exec(page)?.[0] ?? "";
    // The checker prints the expansion; the member row names the alias and links its
    // own entry point, not the adapter's re-export of the same name.
    expect(memberRow).toContain(
      '<a href="/docs/api/core/storage-mode/"><code>StorageMode</code></a>',
    );
    expect(memberRow).toContain("mode: StorageMode;");
    expect(memberRow).not.toContain('"memory"');
    // The full expansion stays available in the collapsed Declaration section.
    expect(declaration).toContain('mode: "memory" | "session"');
    expect(page).not.toContain("core-adapter/storage-mode");
  });
});
