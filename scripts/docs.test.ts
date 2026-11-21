import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { SITE_URL } from "../docs/src/lib/seo.js";
import {
  documentationLinkRoutes,
  functionFields,
  movedPageIssues,
  parseableDeclaration,
  prepareDeclarationShapes,
  renderEntryPage,
  renderSymbolPage,
  undocumentedApi,
} from "./docs-api.js";
import { parseFences, trackerReferenceIssues, unresolvedSiteLinks } from "./docs-content-checks.js";
import {
  landingBenchPayload,
  landingDownloads,
  PERFORMANCE_PAGES,
  runCompletionSummary,
  splitPerformancePages,
} from "./docs-performance.js";
import { adapterContractIssues } from "./docs.js";
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
    [
      {
        name: "commitReason",
        documentation: "What produced this commit — see {@link CommitReason}.",
      },
    ],
  ),
]);
const corePackage: ApiPackage = { name: "@sheetwrite/core", entryPoints: [coreEntry] };

describe("API reference pages", () => {
  it("links symbols and gives every member and overload row a unique anchor", async () => {
    const symbolPage = await renderSymbolPage(
      corePackage,
      coreEntry,
      exportNamed(coreEntry, "Grid"),
    );
    expect(renderEntryPage(corePackage, coreEntry)).toContain('href="/docs/api/core/grid/"');

    const anchors = [...symbolPage.matchAll(/\sid="([^"]+)"/gu)].map((match) => match[1]);
    expect(new Set(anchors).size).toBe(anchors.length);
    expect(anchors).toEqual(expect.arrayContaining(["applytransaction", "rendererkind"]));
    const members = [
      ...symbolPage.matchAll(/<article class="api-card api-member" id="([^"]+)"/gu),
    ].map((match) => match[1]);
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
    // Symbol sections sit under the page title (H2), member sections under their group (H4).
    expect(page.slice(0, page.indexOf("## Members"))).not.toMatch(/^### /m);
    expect(section(page, /<aside class="api-layout__aside"[\s\S]*?<\/aside>/)).toMatch(
      /^## Examples$/m,
    );
    const member = section(
      page,
      /<article class="api-card api-member" id="grid-apply-transaction"[\s\S]*?<\/article>/,
    );
    // Anchored to the line start: "##### Examples" would contain "#### Examples".
    expect(member).toMatch(
      /^#### Examples\n\n```ts compile\ngrid\.applyTransaction\(\{ patches: \[\] \}\);/m,
    );
    expect(member).toContain("[Renderer](/docs/api/core/grid/#grid-renderer-kind)");
    expect(page).not.toMatch(/@(?:example|see)\b/);
  });

  it("lists members, parameters and return values the reference shows without a description", async () => {
    const shape = apiExport(
      "CountShape",
      "interface",
      "interface CountShape {\n  documented: number;\n  bare: string;\n  call(x: number): void;\n  call(x: string): void;\n}",
      "CountShape summary.",
      [{ name: "documented", documentation: "Has docs." }],
    );
    const make = apiExport(
      "makeThing",
      "function",
      "(shape: CountShape, size: number, label?: string): number",
      "Makes a thing.\n@param size - How big.",
    );
    const run = apiExport("runThing", "function", "(): Promise<void>", "Runs a thing.");
    const entry = entryPoint(".", [shape, make, run]);
    // A re-export from a second entry point counts once.
    const adapter = entryPoint("./adapter", [make]);
    const manifest: PublicApiManifest = {
      formatVersion: 2,
      packages: [{ name: "@sheetwrite/core", entryPoints: [entry, adapter] }],
    };
    await prepareDeclarationShapes([shape, make, run].map((item) => parseableDeclaration(item)));
    expect(undocumentedApi(manifest)).toEqual([
      // `call` once for both overloads; `shape` has a documented type, but
      // `makeThing` tags `size`, so the hover panel would leave `shape` out;
      // `runThing` returns nothing to describe.
      {
        packageName: "@sheetwrite/core",
        members: ["CountShape.bare", "CountShape.call"],
        parameters: ["makeThing(label)", "makeThing(shape)"],
        returns: ["makeThing"],
      },
    ]);
    const runPage = await renderSymbolPage(manifest.packages[0]!, entry, run);
    expect(runPage).not.toContain("## Returns");
  });

  it("shows @throws on function pages and param, returns and throws as lines on member cards", async () => {
    const resolve = apiExport(
      "resolveLimits",
      "function",
      "(overrides?: object): object",
      "Merge limits.\n@param overrides Limits to change.\n@returns A frozen copy.\n@throws SheetwriteError with code `invalid-limits` when a value is negative.",
    );
    const backend = apiExport(
      "Backend",
      "interface",
      "interface Backend {\n  write(workbook: object): Promise<Uint8Array>;\n}",
      "A backend.",
      [
        {
          name: "write",
          documentation:
            "Write a workbook.\n@param workbook The workbook.\n@returns The file's bytes.\n@throws `TypeError` when it is closed.",
        },
      ],
    );
    const entry = entryPoint(".", [resolve, backend]);
    const pkg: ApiPackage = { name: "@sheetwrite/core", entryPoints: [entry] };
    const page = await renderSymbolPage(pkg, entry, resolve);
    expect(section(page, /## Throws[\s\S]*?<\/div>\n/)).toContain(
      "SheetwriteError with code <code>invalid-limits</code> when a value is negative.",
    );
    expect(section(page, /## Returns[\s\S]*?## Throws/)).not.toContain("SheetwriteError");
    const card = section(
      await renderSymbolPage(pkg, entry, backend),
      /<article class="api-card api-member"[\s\S]*?<\/article>/,
    );
    expect(card).toContain('<p class="api-card__doc">Write a workbook.</p>');
    expect(card).toContain("<dt>Parameter</dt><dd><code>workbook</code> The workbook.</dd>");
    expect(card).toContain("<dt>Returns</dt><dd>The file's bytes.</dd>");
    expect(card).toContain("<dt>Throws</dt><dd><code>TypeError</code> when it is closed.</dd>");
    expect(card).not.toContain("@param");
  });

  it("leaves wasm-bindgen glue off the count: InitOutput's members, and free() on generated classes", async () => {
    const output = apiExport(
      "InitOutput",
      "interface",
      "interface InitOutput {\n  readonly memory: WebAssembly.Memory;\n  readonly cellstore_new: () => number;\n}",
    );
    const generated = {
      ...apiExport("CellOut", "class", "class CellOut {\n  free(): void;\n}"),
      source: "pkg/sheetwrite_wasm.d.ts#L7",
    };
    const entry = entryPoint(".", [output, generated]);
    const pkg: ApiPackage = { name: "@sheetwrite/wasm", entryPoints: [entry] };
    const page = await renderSymbolPage(pkg, entry, output);
    expect(page).not.toContain("## Members");
    // The declaration still shows the whole type.
    expect(page).toContain("cellstore_new");
    const generatedPage = await renderSymbolPage(pkg, entry, generated);
    expect(generatedPage).toContain("Releases the object's WASM memory");
    // wasm-bindgen writes the source file at build time; the repository has no copy.
    expect(generatedPage).toContain(
      "<div><dt>Source</dt><dd><code>packages/wasm/pkg/sheetwrite_wasm.d.ts#L7</code> (generated at build time)</dd></div>",
    );
    expect(generatedPage).not.toContain("blob/develop/packages/wasm/pkg/");
    expect(undocumentedApi({ formatVersion: 2, packages: [pkg] })).toEqual([
      { packageName: "@sheetwrite/wasm", members: [], parameters: [], returns: [] },
    ]);
  });

  it("reads parameters and the return type from a recorded signature", () => {
    expect(
      functionFields(
        "<T>(map: Map<string, T>, pick?: (value: T, key: string) => boolean, ...rest: T[]): Promise<T[]>",
        "pickAll",
      ),
    ).toEqual({
      parameters: [
        { name: "map", type: "Map<string, T>", optional: false },
        { name: "pick", type: "(value: T, key: string) => boolean", optional: true },
        { name: "...rest", type: "T[]", optional: false },
      ],
      returns: "Promise<T[]>",
    });
  });

  it("links Source to a file in the repository, never to build output", async () => {
    const chartAnchor: ApiExport = {
      ...apiExport("ChartAnchor", "interface", "interface ChartAnchor { row: number; }"),
      // A re-export resolves to the declaration file of the package it comes from.
      source: "../core/dist/types/chart.d.ts#L7",
    };
    const chartsEntry = entryPoint(".", [chartAnchor]);
    const chartsPage = await renderSymbolPage(
      { name: "@sheetwrite/charts", entryPoints: [chartsEntry] },
      chartsEntry,
      chartAnchor,
    );
    // The link names the line that declares the symbol in the repository source.
    const chartSource = await readFile(
      resolve(import.meta.dir, "../packages/core/src/types/chart.ts"),
      "utf8",
    );
    const line =
      chartSource.split("\n").findIndex((text) => text.startsWith("export interface ChartAnchor")) +
      1;
    expect(line).toBeGreaterThan(0);
    expect(chartsPage).toContain(
      `<a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/types/chart.ts#L${line}"><code>packages/core/src/types/chart.ts#L${line}</code></a>`,
    );
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
    expect([
      ...headingAnchors('<table><tr id="fn-sum"><td>SUM</td></tr><tr id="fn-abs"></tr></table>'),
    ]).toEqual(["fn-sum", "fn-abs"]);
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

  it("rejects pull request and issue references in docs pages", () => {
    const document = (name: string, content: string) => ({
      path: resolve(import.meta.dir, "../docs/src/content/docs", name),
      content,
    });
    const documents = [
      document(
        "a.md",
        [
          "Sorting changed ([#393](https://github.com/chh-ay/sheetwrite/pull/393)).",
          "PR #186 measured memory.",
          "See [the issues](https://github.com/chh-ay/sheetwrite/issues/12) and (#624).",
          "Default limits (decision recorded in #228).",
        ].join("\n"),
      ),
      document(
        "b.md",
        "Sorting changed. See [the guide](#sorting), [step 1](#10-steps), `#REF!`, color #123456 and &#91;1&#93;.",
      ),
    ];
    expect(trackerReferenceIssues(documents)).toEqual([
      "docs/src/content/docs/a.md:1 cites the tracker ([#393]); describe the change instead",
      "docs/src/content/docs/a.md:1 cites the tracker (github.com/chh-ay/sheetwrite/pull); describe the change instead",
      "docs/src/content/docs/a.md:2 cites the tracker (PR #186); describe the change instead",
      "docs/src/content/docs/a.md:3 cites the tracker (github.com/chh-ay/sheetwrite/issues); describe the change instead",
      "docs/src/content/docs/a.md:3 cites the tracker ((#624)); describe the change instead",
      "docs/src/content/docs/a.md:4 cites the tracker (#228); describe the change instead",
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
  it("fails when GridOptions or the Vue emits drift from the contract", () => {
    const gridOptions = apiExport(
      "GridOptions",
      "interface",
      "interface GridOptions { uncoveredInput?: unknown; }",
      undefined,
      [{ name: "uncoveredInput", documentation: "Uncovered input." }],
    );
    const manifest: PublicApiManifest = {
      formatVersion: 2,
      packages: [
        { name: "@sheetwrite/core", entryPoints: [entryPoint(".", [gridOptions])] },
        { name: "@sheetwrite/vue", entryPoints: [entryPoint(".", [])] },
      ],
    };

    expect(adapterContractIssues(manifest)).toEqual(
      expect.arrayContaining([
        "GridOptions member uncoveredInput is not covered by the adapter documentation contract",
        "@sheetwrite/vue does not export SheetwriteGridEmits",
      ]),
    );
  });
});
