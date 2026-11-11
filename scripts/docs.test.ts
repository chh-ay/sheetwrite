import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  GENERATED_CONTENT_DIRECTORIES,
  GENERATED_CONTENT_PAGES,
} from "../docs/src/lib/generated-content.js";
import { SITE_URL } from "../docs/src/lib/seo.js";
import {
  documentationLinkRoutes,
  functionFields,
  movedPageIssues,
  renderEntryPage,
  renderSymbolPage,
  symbolDescription,
} from "./docs-api.js";
import { renderCompatibilityResults } from "./docs-compatibility.js";
import { parseFences, unresolvedSiteLinks } from "./docs-content-checks.js";
import {
  landingBenchPayload,
  landingDownloads,
  PERFORMANCE_PAGES,
  runCompletionSummary,
  splitPerformancePages,
  validateDataArtifact,
} from "./docs-performance.js";
import { ADAPTER_DOC_CONTRACT, adapterContractIssues } from "./docs.js";
import { headingAnchors } from "./markdown-anchors.js";
import { extractFigureAssets, perfFigure } from "./perf-figures.js";
import type { ApiEntryPoint, ApiExport, ApiPackage, PublicApiManifest } from "./public-api.js";
import { PUBLISHABLE_PACKAGE_ORDER } from "./workspace-tooling.js";

function apiExport(
  name: string,
  kind: string,
  signature: string,
  documentation = `${name} summary.`,
  memberDocs: ApiExport["memberDocs"] = [],
): ApiExport {
  return {
    name,
    kind,
    signature,
    owners: ["src/index.ts"],
    source: "src/index.ts#L1",
    jsDocTags: [],
    documentation,
    memberDocs,
  };
}

function entryPoint(subpath: string, exports: ApiExport[]): ApiEntryPoint {
  return {
    subpath,
    target: "./dist/index.d.ts",
    source: "src/index.ts",
    kind: "typescript",
    classification: "supported",
    exports,
  };
}

function exportNamed(entry: ApiEntryPoint, name: string): ApiExport {
  const found = entry.exports.find((item) => item.name === name);
  if (found === undefined) throw new Error(`fixture has no export ${name}`);
  return found;
}

function section(page: string, pattern: RegExp): string {
  return pattern.exec(page)?.[0] ?? "";
}

const coreEntry = entryPoint(".", [
  apiExport(
    "Grid",
    "interface",
    'interface Grid { applyTransaction(tx: unknown): unknown; rendererKind(): "canvas" | "worker"; parse(x: string): number; parse(x: number): number; }',
    "Imperative grid handle.",
    [
      {
        name: "applyTransaction",
        documentation: "Applies a committed transaction to the {@link Grid}. Bypasses history.",
      },
    ],
  ),
  apiExport("CommitReason", "type", 'type CommitReason = "api" | "edit-enter";'),
  apiExport(
    "ChangeEvent",
    "interface",
    "interface ChangeEvent { commitReason: CommitReason; }",
    "Committed transaction event.",
    [{ name: "commitReason", documentation: "What produced this commit — see {@link CommitReason}." }],
  ),
]);
const corePackage: ApiPackage = { name: "@sheetwrite/core", entryPoints: [coreEntry] };

describe("API reference pages", () => {
  it("links symbols and gives every member and overload row a unique anchor", async () => {
    const symbolPage = await renderSymbolPage(corePackage, coreEntry, exportNamed(coreEntry, "Grid"));
    expect(renderEntryPage(corePackage, coreEntry)).toContain('href="/docs/api/core/grid/"');

    const anchors = [...symbolPage.matchAll(/\sid="([^"]+)"/gu)].map((match) => match[1]);
    expect(new Set(anchors).size).toBe(anchors.length);
    expect(anchors).toEqual(expect.arrayContaining(["applytransaction", "rendererkind"]));
    const members = [...symbolPage.matchAll(/<details class="api-member" id="([^"]+)"/gu)].map(
      (match) => match[1],
    );
    expect(members.filter((id) => id?.startsWith("grid-parse"))).toHaveLength(2);
    expect(members).toContain("grid-parse");
    expect(symbolPage).toContain("Bypasses history.");
    expect(symbolPage).toContain('<a href="/docs/api/core/grid/"><code>Grid</code></a>');
    const changeEventPage = await renderSymbolPage(
      corePackage,
      coreEntry,
      exportNamed(coreEntry, "ChangeEvent"),
    );
    expect(changeEventPage).toContain(
      '<a href="/docs/api/core/commit-reason/"><code>CommitReason</code></a>',
    );
  });

  it("renders examples and related links on symbols and member rows", async () => {
    const grid: ApiExport = {
      ...exportNamed(coreEntry, "Grid"),
      documentation: [
        "Imperative grid handle.",
        "@example",
        "```tsx",
        "const view = <div />;",
        "```",
        "@see {@link CommitReason | Commit reasons}",
        "@see https://example.com/guide",
      ].join("\n"),
      memberDocs: [
        {
          name: "applyTransaction",
          documentation: [
            "Apply one transaction.",
            "@example",
            "```ts",
            "grid.applyTransaction({ patches: [] });",
            "```",
            "@see {@link Grid.rendererKind | Renderer}",
          ].join("\n"),
        },
      ],
    };
    const entry = entryPoint(".", [grid, ...coreEntry.exports.slice(1)]);
    const pkg = { ...corePackage, entryPoints: [entry] };
    const routes = documentationLinkRoutes({ formatVersion: 2, packages: [pkg] });

    const page = await renderSymbolPage(pkg, entry, grid, routes);
    expect(page).toContain("```tsx compile\nconst view = <div />;\n```");
    expect(page).toContain("[Commit reasons](/docs/api/core/commit-reason/)");
    expect(page).toContain("[https://example.com/guide](https://example.com/guide)");
    // Symbol sections sit under the page title (H2), member sections under Members (H3).
    expect(page.slice(0, page.indexOf("## Members"))).not.toMatch(/^### /m);
    expect(section(page, /<aside class="api-layout__aside"[\s\S]*?<\/aside>/)).toMatch(
      /^## Examples$/m,
    );
    const member = section(
      page,
      /<details class="api-member" id="grid-apply-transaction"[\s\S]*?<\/details>/,
    );
    expect(member).toContain(
      "### Examples\n\n```ts compile\ngrid.applyTransaction({ patches: [] });",
    );
    expect(member).toContain("[Renderer](/docs/api/core/grid/#grid-renderer-kind)");
    expect(page).not.toMatch(/@(?:example|see)\b/);
  });

  it("links an expanded union member to the alias that names it", async () => {
    const aliasExports = () => [
      apiExport("STORAGE_MODES", "variable", 'readonly ["memory", "session"]'),
      apiExport("StorageMode", "type", "export type StorageMode = (typeof STORAGE_MODES)[number];"),
    ];
    const options = apiExport(
      "StorageOptions",
      "interface",
      'interface StorageOptions {\n  mode: "memory" | "session";\n  storage?: StorageMode;\n}',
    );
    const entry = entryPoint(".", [...aliasExports(), options]);
    const pkg: ApiPackage = {
      name: "@sheetwrite/core",
      entryPoints: [entry, entryPoint("./adapter", aliasExports())],
    };
    const routes = documentationLinkRoutes({ formatVersion: 2, packages: [pkg] });

    const page = await renderSymbolPage(pkg, entry, options, routes);

    const memberRow = section(
      page,
      /<details class="api-member" id="storage-options-mode"[\s\S]*?<\/details>/,
    );
    // The member row names the alias of its own entry point, not the adapter's re-export.
    expect(memberRow).toContain(
      '<a href="/docs/api/core/storage-mode/"><code>StorageMode</code></a>',
    );
    expect(memberRow).not.toContain('"memory"');
    // The full expansion stays in the collapsed Declaration section.
    expect(section(page, /<details class="api-declaration"[\s\S]*?<\/details>/)).toContain(
      'mode: "memory" | "session"',
    );
    expect(page).not.toContain("core-adapter/storage-mode");
  });

  it("describes a symbol by kind and package, clipped on a word", () => {
    const summary = "Chart families that the document model supports.";
    const core = symbolDescription("ChartKind", "type", "@sheetwrite/core", summary);
    expect(core).toBe(`ChartKind type in @sheetwrite/core: ${summary}`);
    expect(core).not.toBe(symbolDescription("ChartKind", "type", "@sheetwrite/charts", summary));

    const long = symbolDescription(
      "Grid",
      "interface",
      "@sheetwrite/core",
      `The imperative grid handle. ${"It reads, edits and renders a workbook. ".repeat(8)}`,
    );
    expect(long.length).toBeLessThanOrEqual(160);
    expect(long).toMatch(/\S…$/);
  });

  it.each([
    [
      "(host: HTMLElement, opts: GridOptions): Grid",
      [
        { name: "host", type: "HTMLElement", optional: false },
        { name: "opts", type: "GridOptions", optional: false },
      ],
      "Grid",
    ],
    [
      "<T>(map: Map<string, T>, pick?: (value: T, key: string) => boolean, ...rest: T[]): Promise<T[]>",
      [
        { name: "map", type: "Map<string, T>", optional: false },
        { name: "pick", type: "(value: T, key: string) => boolean", optional: true },
        { name: "...rest", type: "T[]", optional: false },
      ],
      "Promise<T[]>",
    ],
  ])("reads function fields from %s", (signature, parameters, returns) => {
    expect(functionFields(signature, "fn")).toEqual({ parameters, returns });
  });
});

describe("documentation content", () => {
  it("reads fences the way the site's Markdown parser does", () => {
    const content = [
      "````md compile",
      "```ts",
      "inner",
      "```",
      "````",
      "",
      "~~~ts compile",
      "const value: number = 'text';",
      "~~~",
      "",
      "Inline ```code``` is not a fence.",
    ].join("\n");

    expect(parseFences(content)).toEqual([
      { language: "md", meta: "compile", code: "```ts\ninner\n```", line: 1 },
      { language: "ts", meta: "compile", code: "const value: number = 'text';", line: 7 },
    ]);
    expect([...headingAnchors("## Example\n\n## Example\n\n## Example\n")]).toEqual([
      "example",
      "example-1",
      "example-2",
    ]);
  });

  it("keeps published package README links valid outside the monorepo", async () => {
    const root = resolve(import.meta.dir, "..");
    const allowed = [`${SITE_URL}/`, "https://github.com/chh-ay/sheetwrite/"];
    for (const name of PUBLISHABLE_PACKAGE_ORDER) {
      const directory = name.slice("@sheetwrite/".length);
      const readme = await readFile(resolve(root, "packages", directory, "README.md"), "utf8");
      for (const [, link] of readme.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
        // The link is in the compared value, so a failure names it.
        expect({ link, allowed: allowed.some((prefix) => link?.startsWith(prefix)) }).toEqual({
          link,
          allowed: true,
        });
      }
    }
  });

  it("keeps every page the generator owns out of git", async () => {
    const ignored = new Set(
      (await readFile(resolve(import.meta.dir, "../.gitignore"), "utf8")).split("\n"),
    );
    const owned = [
      ...GENERATED_CONTENT_DIRECTORIES.map((directory) => `${directory}/`),
      ...GENERATED_CONTENT_PAGES,
    ];
    expect(owned.filter((path) => !ignored.has(`docs/src/content/docs/${path}`))).toEqual([]);
  });

  it("leaves the page title as the compatibility results page's only H1", () => {
    // The docs shell renders the frontmatter title as the H1.
    expect(renderCompatibilityResults()).not.toMatch(/^# /m);
  });

  it("rejects moved pages, moved headings and site links that resolve nowhere", () => {
    const contentRoot = resolve(import.meta.dir, "../docs/src/content/docs");
    const documents = [
      { path: `${contentRoot}/features/grid/search.md`, content: "## Replace\n\nText.\n" },
      { path: `${contentRoot}/guides/kept.md`, content: "Kept.\n" },
    ];
    const moved = {
      "/docs/guides/old/": {
        to: "/docs/features/grid/search/",
        anchors: { replace: "/docs/features/grid/search/#replace" },
      },
    };
    expect(movedPageIssues(moved, documents)).toEqual([]);

    const keptContent = {
      "/docs/guides/kept/": {
        to: "/docs/features/grid/search/",
        anchors: { gone: "/docs/features/grid/search/#gone" },
      },
    };
    expect(movedPageIssues(keptContent, documents)).toEqual([
      "moved page still has content: /docs/guides/kept/",
      "moved page /docs/guides/kept/#gone forwards to a missing target: /docs/features/grid/search/#gone",
    ]);
    const headings = {
      "/docs/features/grid/search/": {
        replace: "/docs/guides/kept/",
        gone: "/docs/guides/kept/#missing",
      },
    };
    expect(movedPageIssues({}, documents, headings)).toEqual([
      "moved heading is still on its page: /docs/features/grid/search/#replace",
      "moved heading /docs/features/grid/search/#gone forwards to a missing target: /docs/guides/kept/#missing",
    ]);

    const links = [
      "/docs/guides/old/",
      "/docs/missing/",
      "/docs/features/grid/search/#nope",
      "/docs/features/grid/search/#replace",
    ].map((link) => ({ source: "README.md", link }));
    expect(unresolvedSiteLinks(links, documents, moved)).toEqual([
      "README.md links moved page /docs/guides/old/; link /docs/features/grid/search/ instead",
      "README.md links missing page /docs/missing/",
      "README.md links missing anchor /docs/features/grid/search/#nope",
    ]);
  });
});

describe("landing benchmark data", () => {
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
  const benchEvidence = (results: ReturnType<typeof benchResult>[], scenarios = ["a", "b"]) => ({
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
      engineVersions: { sheetwrite: "0.4.0", handsontable: "18.1.2" },
      rounds: 2,
      launchAttempts: [],
    },
    config: { engines: ["sheetwrite", "handsontable"], rows: [1_000, 1_000_000], scenarios },
    results,
  });
  const payloadOf = (evidence: ReturnType<typeof benchEvidence>) =>
    JSON.parse(landingBenchPayload({ evidence, source: "x" }));

  it("rejects a data capture whose engine blocks are empty", async () => {
    const committed = JSON.parse(
      await readFile(resolve(import.meta.dir, "../bench/results/data-results.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(typeof validateDataArtifact(committed)).toBe("object");
    expect(typeof validateDataArtifact({ ...committed, sheetwrite: {}, handsontable: {} })).toBe(
      "string",
    );
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
    const payload = payloadOf(benchEvidence(results));
    // The 1M size has zero full-round pairs and must be omitted, not NaN.
    expect(payload.sizes).toEqual([
      expect.objectContaining({
        size: 1_000,
        comparedScenarios: 1,
        medianRatio: 5,
        handsontableIncomplete: 1,
      }),
    ]);
    expect(payload.heroStats).toMatchObject({ millionRowScenarios: 2, millionRowMedianMs: 2 });

    // No comparable pairs downgrades to the placeholder: null must never reach the landing.
    const none = landingBenchPayload({ evidence: benchEvidence(results.slice(0, 4)), source: "x" });
    expect(JSON.parse(none).available).toBe(false);
    expect(none).not.toContain("null");
  });

  it("takes the mean of the two middle rounds as the median of an even sample", () => {
    const payload = payloadOf(
      benchEvidence(
        [
          benchResult("sheetwrite", "a", 1, 1_000, 1),
          benchResult("sheetwrite", "a", 2, 1_000, 3),
          benchResult("handsontable", "a", 1, 1_000, 4),
          benchResult("handsontable", "a", 2, 1_000, 8),
          benchResult("sheetwrite", "a", 1, 1_000_000, 1),
          benchResult("sheetwrite", "a", 2, 1_000_000, 3),
        ],
        ["a"],
      ),
    );

    expect(payload.sizes[0]).toMatchObject({ size: 1_000, medianRatio: 3 });
    expect(payload.heroStats).toMatchObject({ millionRowMedianMs: 2 });
  });

  it("publishes download sizes only when every part is known", () => {
    const firstLoad = (javascript: number, wasm: number, css: number) => ({
      "bundler.vite.coreInitial.javascript.brotliBytes": { actual: javascript },
      "bundler.vite.coreInitial.wasm.brotliBytes": { actual: wasm },
      "bundler.vite.coreInitial.css.brotliBytes": { actual: css },
    });
    const engines = [
      { engine: "default", wasm: { brotliBytes: 250 } },
      { engine: "full", wasm: { brotliBytes: 340 } },
    ];
    const downloads = landingDownloads(firstLoad(130, 256, 2), engines);
    expect(downloads).toEqual({
      coreFirstLoadBrotliBytes: 388,
      defaultEngineBrotliBytes: 250,
      fullEngineBrotliBytes: 340,
    });

    // A partial report would understate the download, so the landing shows none.
    const { "bundler.vite.coreInitial.css.brotliBytes": _css, ...noCss } = firstLoad(1, 1, 1);
    expect(landingDownloads(noCss, engines)).toBeUndefined();
    expect(landingDownloads(firstLoad(130, 256, 2), engines.slice(0, 1))).toBeUndefined();
    expect(landingDownloads(firstLoad(130, Number.NaN, 2), engines)).toBeUndefined();

    // Sizes are published even when no benchmark capture is available.
    const missing = { available: false as const, reason: "x", source: "x", reproduction: "x" };
    expect(JSON.parse(landingBenchPayload(missing, downloads))).toEqual({
      available: false,
      reason: "x",
      downloads,
    });
  });
});

describe("performance pages", () => {
  const evidence = PERFORMANCE_PAGES.flatMap((page) => page.sections)
    .map((heading) => `## ${heading}\n\n${heading} body.\n`)
    .join("\n");
  const pagesOf = (markdown: string) =>
    new Map(splitPerformancePages(markdown).map((page) => [page.route, page.content]));

  it("splits sections onto their pages and rejects a section no page lists", () => {
    const pages = pagesOf(evidence);
    expect(pages.get("performance/memory.md")).toContain("## Grid lifetime and trimMemory");
    expect(pages.get("performance/index.md")).toContain("](/docs/performance/memory/)");
    expect(() => splitPerformancePages(`${evidence}\n## New benchmark\n\nBody.\n`)).toThrow(
      "performance section has no page: New benchmark",
    );
  });

  it("lifts a one-section page's headings to sit right under its title", () => {
    const fenced = "```md\n### Not a heading\n<h4>Literal</h4>\n```\n";
    const pages = pagesOf(
      evidence
        .replace(
          "Formula engine benchmark body.\n",
          `### Scale\n\n<h4>Card</h4>\n\n#### Detail\n\n${fenced}`,
        )
        .replace("Runtime resource ownership body.\n", "### Owners\n"),
    );

    const formula = pages.get("performance/formula-engine.md") ?? "";
    // A one-section page takes its heading from its title.
    expect(formula).not.toContain("## Formula engine benchmark");
    expect(formula).toMatch(/^## Scale$/m);
    expect(formula).toContain("<h3>Card</h3>");
    expect(formula).toMatch(/^### Detail$/m);
    expect(formula).toContain(fenced);
    // A page with several sections keeps their H2s, so nothing moves.
    expect(pages.get("performance/memory.md")).toMatch(/^### Owners$/m);
  });

  it("moves every figure out of its page into a static asset, leaving a placeholder", () => {
    const figure = perfFigure({
      id: "sort",
      title: "Median sort time",
      unit: "ms",
      scale: "log",
      rowHeader: "Rows",
      groups: [
        {
          label: "Linux",
          rows: [{ label: "1k rows", bars: [{ label: "", role: "measured", stat: { value: 2 } }] }],
        },
      ],
    });
    const page = `Intro.\n\n${figure}\n\nAfter.\n`;
    const { content, assets } = extractFigureAssets("data-engine", page);
    expect(content).toBe(
      'Intro.\n\n<PerfFigure name="data-engine--sort">\n</PerfFigure>\n\nAfter.\n',
    );
    expect(assets.map((asset) => asset.name)).toEqual(["data-engine--sort"]);
    expect(assets[0]?.html).toStartWith('<figure class="perf-bars"');
    expect(() => extractFigureAssets("data-engine", `${page}${figure}`)).toThrow(
      "two figures on performance/data-engine share the id sort",
    );
  });
});

describe("adapter documentation contract", () => {
  const documented = (names: readonly string[]) =>
    names.map((name) => ({ name, documentation: `${name} documentation.` }));
  const propsSignature = (members: readonly string[]) =>
    `export interface SheetwriteGridProps { ${members
      .map((name) => (name.includes("-") ? `"${name}"?: unknown;` : `${name}?: unknown;`))
      .join(" ")} }`;
  const props = (members: readonly string[]) =>
    apiExport("SheetwriteGridProps", "interface", propsSignature(members), undefined, documented(members));
  const readyEvent = () =>
    apiExport(
      "GridReadyEvent",
      "interface",
      "export interface GridReadyEvent { grid: Grid; generation: number; reason: GridReadyReason; }",
      undefined,
      documented(["grid", "generation", "reason"]),
    );
  const { inputs, handlerEvents, vueEvents } = ADAPTER_DOC_CONTRACT;
  const optionInputs = inputs.filter((name) => name !== "wasmSource");

  const conformingManifest = (): PublicApiManifest => ({
    formatVersion: 2,
    packages: [
      {
        name: "@sheetwrite/core",
        entryPoints: [
          entryPoint(".", [
            apiExport(
              "GridOptions",
              "interface",
              propsSignature(optionInputs),
              undefined,
              documented(optionInputs),
            ),
          ]),
          entryPoint("./adapter", [
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
        entryPoints: [entryPoint(".", [props([...inputs, ...handlerEvents]), readyEvent()])],
      })),
      {
        name: "@sheetwrite/vue",
        entryPoints: [
          entryPoint(".", [
            props([...inputs]),
            apiExport(
              "SheetwriteGridEmits",
              "interface",
              `export interface SheetwriteGridEmits { ${vueEvents
                .map((name) => `"${name}": unknown;`)
                .join(" ")} }`,
              undefined,
              documented(vueEvents),
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
    expect([...vueEvents] as string[]).toEqual(handlerEvents.map(kebabOf));
  });

  it("fails when GridOptions or the Vue emits drift from the contract", () => {
    const manifest = conformingManifest();
    const [core, , , vue] = manifest.packages;
    const [coreRoot] = core?.entryPoints ?? [];
    const [vueRoot] = vue?.entryPoints ?? [];
    if (coreRoot === undefined || vueRoot === undefined) throw new Error("fixture shape changed");
    exportNamed(coreRoot, "GridOptions").memberDocs.push({
      name: "uncoveredInput",
      documentation: "Uncovered input.",
    });
    vueRoot.exports = vueRoot.exports.filter((item) => item.name !== "SheetwriteGridEmits");

    expect(adapterContractIssues(manifest)).toEqual(
      expect.arrayContaining([
        "GridOptions member uncoveredInput is not covered by the adapter documentation contract",
        "@sheetwrite/vue does not export SheetwriteGridEmits",
      ]),
    );
  });
});
