import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, readFile, rm } from "node:fs/promises";
import { join, relative, sep } from "node:path";

import { GENERATED_CONTENT_DIRECTORIES } from "../docs/src/lib/generated-content.js";
import { MOVED_HEADINGS } from "../docs/src/lib/moved-headings.js";
import { MOVED_PAGES, MOVED_SHOWCASES, REMOVED_API_PAGES } from "../docs/src/lib/moved-pages.js";
import { CAPABILITY_INVENTORY, CAPABILITY_OWNERS } from "../docs/src/showcases/capabilities.js";
import {
  collectCapabilityIssues,
  collectMissingCapabilityFiles,
  collectMovedShowcaseIssues,
} from "../docs/src/showcases/capability-validation.js";
import {
  collectCompatibilityIssues,
  collectMissingCompatibilityFiles,
} from "../docs/src/showcases/compatibility-validation.js";
import {
  COMPATIBILITY_FIXTURES,
  COMPATIBILITY_INVENTORY,
} from "../docs/src/showcases/compatibility.js";
import {
  consumerIndex,
  documentationLinkRoutes,
  movedPageIssues,
  parseableDeclaration,
  prepareDeclarationShapes,
  renderApiIndex,
  renderEntryPage,
  renderEntryPointInventory,
  renderMovedGuides,
  renderSymbolPage,
  symbolPagePath,
  undocumentedApi,
  unresolvedDocumentationLinks,
} from "./docs-api.js";
import {
  collectCompatibilityDigestIssues,
  compatibilityResults,
  publicCompatibilitySource,
  renderCompatibilityResults,
} from "./docs-compatibility.js";
import {
  contentPathForRoute,
  markdownDocuments,
  readReadmes,
  siteLinkIssues,
  trackerReferenceIssues,
  unresolvedCssTokens,
  validateMarkdown,
} from "./docs-content-checks.js";
import { expectedChangelogFeed } from "./docs-feed.js";
import { expectedLlmsFiles } from "./docs-llms.js";
import { entrySlug } from "./docs-paths.js";
import {
  renderEvidenceText,
  renderLandingBench,
  renderLandingStory,
  splitPerformancePages,
} from "./docs-performance.js";
import {
  contentRoot,
  docsContractPath,
  exists,
  type ExpectedFile,
  generatedDataRoot,
  generatedManifestPath,
  generatedPublicRoots,
  isGeneratedContent,
  type MarkdownDocument,
  MIGRATION_ROUTES,
  posix,
  repositoryRoot,
  stableJson,
} from "./docs-shared.js";
import { siteDataFiles } from "./docs-site-data.js";
import {
  loadFormulaContractInventory,
  loadFormulaReferenceEntries,
  renderExcelCoveragePage,
  renderFormulaFunctionPages,
} from "./formula-docs.js";
import { extractFigureAssets } from "./perf-figures.js";
import type { ApiExport, PublicApiAnalysis, PublicApiManifest } from "./public-api.js";
import { writeIfChanged } from "./script-io.js";

const REQUIRED_SEARCH_TERMS = [
  "rendererKind",
  "onGridChange",
  "applyTransaction",
  "SnapshotValidationError",
  "toXlsxWorkbook",
] as const;

const FORBIDDEN_NAMES = [
  "LegacyDataSource",
  "setXlsxBackend",
  "setXlsxImportBackend",
  "toXlsx(",
  "fromXlsx(",
] as const;

/**
 * Sheetwrite-owned adapter surface every framework package must document.
 * `inputs` mirrors `GRID_OPTION_POLICY` plus explicit WASM initialization, and
 * `vueEvents` mirrors `handlerEvents` in template casing; `docs.test.ts` checks
 * that casing and input-contract drift against `GridOptions`.
 */
const ADAPTER_DOC_CONTRACT = {
  packages: ["@sheetwrite/react", "@sheetwrite/svelte", "@sheetwrite/vue"],
  inputs: [
    "workbook",
    "data",
    "datasource",
    "datasourceStorage",
    "presentation",
    "editors",
    "renderer",
    "workerUrl",
    "renderers",
    "protectionResolver",
    "mutationPolicy",
    "transactionResourceLimits",
    "hyperlinkActivation",
    "addons",
    "theme",
    "readOnly",
    "config",
    "overscan",
    "minColumns",
    "wasmSource",
  ],
  handlerEvents: [
    "onGridChange",
    "onSelectionChange",
    "onViewportChange",
    "onEditBegin",
    "onEditCommit",
    "onSearch",
    "onActiveSheetChange",
    "onCommandStateChange",
    "onReady",
    "onInitializationError",
  ],
  vueEvents: [
    "grid-change",
    "selection-change",
    "viewport-change",
    "edit-begin",
    "edit-commit",
    "search",
    "active-sheet-change",
    "command-state-change",
    "ready",
    "initialization-error",
  ],
  readyReasons: ["initial", "input-reset", "renderer-reset"],
} as const;

/**
 * Every adapter package must document the canonical advanced inputs, event
 * surface, and readiness contract through its generated API pages: the
 * flattened props/emits interfaces must declare each member with source JSDoc,
 * and the core adapter entry must document exactly the implemented readiness
 * reasons.
 */
export function adapterContractIssues(manifest: PublicApiManifest): string[] {
  const failures: string[] = [];
  const export_of = (package_name: string, name: string): ApiExport | undefined =>
    manifest.packages
      .find((pkg) => pkg.name === package_name)
      ?.entryPoints.find((entry) => entry.subpath === ".")
      ?.exports.find((item) => item.name === name);

  const grid_options = export_of("@sheetwrite/core", "GridOptions");
  const expected_inputs = ADAPTER_DOC_CONTRACT.inputs.filter((name) => name !== "wasmSource");
  if (grid_options === undefined) {
    failures.push("@sheetwrite/core does not export GridOptions");
  } else {
    const implemented_inputs = new Set(grid_options.memberDocs.map((member) => member.name));
    for (const input of expected_inputs) {
      if (!implemented_inputs.has(input)) {
        failures.push(
          `GridOptions member ${input} is missing from the adapter documentation contract`,
        );
      }
    }
    for (const input of implemented_inputs) {
      if (!(expected_inputs as readonly string[]).includes(input)) {
        failures.push(
          `GridOptions member ${input} is not covered by the adapter documentation contract`,
        );
      }
    }
  }

  const require_members = (
    package_name: string,
    export_name: string,
    members: readonly string[],
  ): void => {
    const item = export_of(package_name, export_name);
    if (item === undefined) {
      failures.push(`${package_name} does not export ${export_name}`);
      return;
    }
    const documented = new Set(item.memberDocs.map((member) => member.name));
    for (const member of members) {
      if (
        !item.signature.includes(`${member}:`) &&
        !item.signature.includes(`${member}?:`) &&
        !item.signature.includes(`"${member}":`) &&
        !item.signature.includes(`"${member}"?:`)
      ) {
        failures.push(`${package_name} ${export_name} does not declare ${member}`);
      } else if (!documented.has(member)) {
        failures.push(`${package_name} ${export_name} member ${member} has no documentation`);
      }
    }
  };

  for (const package_name of ADAPTER_DOC_CONTRACT.packages) {
    require_members(package_name, "SheetwriteGridProps", ADAPTER_DOC_CONTRACT.inputs);
    if (package_name === "@sheetwrite/vue") {
      require_members(package_name, "SheetwriteGridEmits", ADAPTER_DOC_CONTRACT.vueEvents);
    } else {
      require_members(package_name, "SheetwriteGridProps", ADAPTER_DOC_CONTRACT.handlerEvents);
    }
    require_members(package_name, "GridReadyEvent", ["grid", "generation", "reason"]);
  }

  const adapter_entry = manifest.packages
    .find((pkg) => pkg.name === "@sheetwrite/core")
    ?.entryPoints.find((entry) => entry.subpath === "./adapter");
  const documented_reasons = new Set<string>();
  for (const name of ["GridReadyReason", "GridResetReason"]) {
    const item = adapter_entry?.exports.find((candidate) => candidate.name === name);
    for (const match of item?.signature.matchAll(/"([a-z-]+)"/g) ?? []) {
      documented_reasons.add(match[1] ?? "");
    }
  }
  const canonical_reasons: readonly string[] = ADAPTER_DOC_CONTRACT.readyReasons;
  if (documented_reasons.size === 0) {
    failures.push("@sheetwrite/core ./adapter does not document GridReadyReason");
  } else if (
    canonical_reasons.some((reason) => !documented_reasons.has(reason)) ||
    [...documented_reasons].some((literal) => !canonical_reasons.includes(literal))
  ) {
    failures.push(
      `GridReadyReason documents [${[...documented_reasons].sort().join(", ")}] but adapters implement [${canonical_reasons.join(", ")}]`,
    );
  }
  return failures;
}

export async function expectedGeneratedFiles(manifest: PublicApiManifest): Promise<ExpectedFile[]> {
  const compatibility_issues = [
    ...collectCompatibilityIssues(COMPATIBILITY_INVENTORY, COMPATIBILITY_FIXTURES),
    ...collectMissingCompatibilityFiles(COMPATIBILITY_INVENTORY, COMPATIBILITY_FIXTURES, (path) =>
      existsSync(join(repositoryRoot, path)),
    ),
    ...(await collectCompatibilityDigestIssues()),
  ];
  if (compatibility_issues.length > 0) throw new Error(compatibility_issues.join("\n"));
  const [formula_inventory, formula_reference_entries, published_compatibility_results] =
    await Promise.all([
      loadFormulaContractInventory(repositoryRoot),
      loadFormulaReferenceEntries(repositoryRoot),
      compatibilityResults(),
    ]);

  // Link resolution and entry pages read declaration shapes synchronously, so every
  // manifest declaration is parsed up front, in one batch.
  await prepareDeclarationShapes(
    manifest.packages.flatMap((pkg) =>
      pkg.entryPoints.flatMap((entry) => entry.exports.map((item) => parseableDeclaration(item))),
    ),
  );
  const documentation_link_issues = unresolvedDocumentationLinks(manifest);
  if (documentation_link_issues.length > 0) throw new Error(documentation_link_issues.join("\n"));

  const link_routes = documentationLinkRoutes(manifest);
  // "Referenced by" reads the whole API surface, so it is indexed once here
  // rather than per symbol page.
  const consumers = consumerIndex(manifest);
  const api_files: ExpectedFile[] = [
    { path: join(contentRoot, "api/index.md"), content: renderApiIndex(manifest) },
    { path: join(generatedDataRoot, "landing-bench.json"), content: await renderLandingBench() },
    { path: join(generatedDataRoot, "landing-story.html"), content: await renderLandingStory() },
  ];
  const symbol_owners = new Map<string, string>();
  for (const pkg of manifest.packages) {
    for (const entry of pkg.entryPoints) {
      api_files.push({
        path: join(contentRoot, `api/${entrySlug(pkg.name, entry.subpath)}.md`),
        content: renderEntryPage(pkg, entry, link_routes),
      });
      for (const item of entry.exports) {
        const symbol_path = join(contentRoot, `${symbolPagePath(pkg, entry, item)}.md`);
        const owner = `${pkg.name}|${entry.subpath}|${item.name}`;
        // Hosts and file systems that ignore letter case serve one page for two
        // paths that differ only in case, so owners are keyed case-folded.
        const folded_path = symbol_path.toLowerCase();
        const existing_owner = symbol_owners.get(folded_path);
        if (existing_owner !== undefined) {
          throw new Error(
            `API pages of ${existing_owner} and ${owner} fold to the same path ${symbol_path}`,
          );
        }
        symbol_owners.set(folded_path, owner);
        api_files.push({
          path: symbol_path,
          content: await renderSymbolPage(pkg, entry, item, link_routes, consumers),
        });
      }
    }
  }
  const export_count = manifest.packages.reduce(
    (count, pkg) =>
      count + pkg.entryPoints.reduce((entry_count, entry) => entry_count + entry.exports.length, 0),
    0,
  );
  const contract = {
    formatVersion: 2,
    generatedBy: "scripts/docs.ts",
    movedGuideRoutes: MIGRATION_ROUTES,
    movedPages: MOVED_PAGES,
    requiredSearchTerms: REQUIRED_SEARCH_TERMS,
    entryPointCount: manifest.packages.reduce((count, pkg) => count + pkg.entryPoints.length, 0),
    exportCount: export_count,
    symbolPageCount: export_count,
    apiSha256: createHash("sha256").update(JSON.stringify(manifest)).digest("hex"),
    compatibilitySha256: createHash("sha256")
      .update(JSON.stringify([COMPATIBILITY_INVENTORY, COMPATIBILITY_FIXTURES]))
      .digest("hex"),
    formulaContractSha256: createHash("sha256")
      .update(JSON.stringify(formula_inventory))
      .digest("hex"),
  };
  const formula_names = new Set<string>();
  if (
    !formula_inventory ||
    typeof formula_inventory !== "object" ||
    !("functions" in formula_inventory) ||
    !Array.isArray(formula_inventory.functions)
  ) {
    throw new Error("Formula inventory must contain functions");
  }
  const formulas: unknown[] = formula_inventory.functions;
  for (const formula of formulas) {
    if (
      !formula ||
      typeof formula !== "object" ||
      !("canonical" in formula) ||
      typeof formula.canonical !== "string" ||
      !("aliases" in formula) ||
      !Array.isArray(formula.aliases)
    ) {
      throw new Error("Formula inventory must contain canonical names and aliases");
    }
    formula_names.add(formula.canonical);
    for (const alias of formula.aliases) {
      if (typeof alias !== "string") throw new Error("Formula aliases must be strings");
      formula_names.add(alias);
    }
  }

  const formula_pages = renderFormulaFunctionPages(formula_inventory, formula_reference_entries);
  const excel_catalog: unknown = JSON.parse(
    await readFile(join(repositoryRoot, "scripts/excel-functions.json"), "utf8"),
  );
  const excel_coverage = renderExcelCoveragePage(formula_inventory, excel_catalog);
  const files: ExpectedFile[] = [
    ...api_files,
    {
      path: join(contentRoot, "reference/package-entry-points.md"),
      content: renderEntryPointInventory(manifest),
    },
    {
      path: join(contentRoot, "reference/moved-guides.md"),
      content: renderMovedGuides(),
    },
    {
      path: join(contentRoot, "reference/compatibility-results.md"),
      content: renderCompatibilityResults(),
    },
    ...formula_pages.map((page) => ({
      path: join(contentRoot, page.route),
      content: page.content,
    })),
    ...formula_pages.flatMap(({ table }) =>
      table === undefined
        ? []
        : [
            {
              path: join(generatedDataRoot, `formula-tables/${table.family}.html`),
              content: table.html,
            },
          ],
    ),
    { path: join(contentRoot, excel_coverage.route), content: excel_coverage.content },
    ...siteDataFiles(manifest, formula_pages),
    {
      path: join(generatedDataRoot, "formula-summary.json"),
      content: stableJson({ functionCount: formula_names.size }),
    },
    {
      path: join(generatedDataRoot, "compatibility.json"),
      content: stableJson({
        schemaVersion: 1,
        records: COMPATIBILITY_INVENTORY.map(({ evidence: _evidence, source, ...record }) => ({
          ...record,
          source: publicCompatibilitySource(source),
        })),
        fixtures: COMPATIBILITY_FIXTURES.map(({ path: _path, ...fixture }) => fixture),
      }),
    },
    {
      path: join(generatedDataRoot, "compatibility-results.json"),
      content: stableJson(published_compatibility_results),
    },
    // The landing shows the counts only; the full results ship with their own page.
    {
      path: join(generatedDataRoot, "compatibility-summary.json"),
      content: stableJson(published_compatibility_results.testSet),
    },
    // Each figure leaves its page for a static HTML asset, so the page's script carries a placeholder.
    ...splitPerformancePages(await renderEvidenceText()).flatMap((page) => {
      const { content, assets } = extractFigureAssets(page.slug, page.content);
      return [
        { path: join(contentRoot, page.route), content },
        ...assets.map((asset) => ({
          path: join(generatedDataRoot, `perf-figures/${asset.name}.html`),
          content: asset.html,
        })),
      ];
    }),
    { path: generatedManifestPath, content: stableJson(manifest) },
    { path: docsContractPath, content: stableJson(contract) },
  ];
  files.push(...(await expectedLlmsFiles(manifest, repositoryRoot, files)));
  files.push(expectedChangelogFeed());
  const unowned = files.filter(
    (file) => file.path.startsWith(`${contentRoot}${sep}`) && !isGeneratedContent(file.path),
  );
  if (unowned.length > 0) {
    throw new Error(
      `Generated pages outside GENERATED_CONTENT_DIRECTORIES and GENERATED_CONTENT_PAGES (add them there and to .gitignore): ${unowned.map((file) => posix(relative(repositoryRoot, file.path))).join(", ")}`,
    );
  }
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

/** Every file under `root`, recursively; empty when `root` does not exist. */
async function files_under(root: string): Promise<string[]> {
  if (!(await exists(root))) return [];
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name));
}

/**
 * Deletes files left in generated directories by an earlier generation whose
 * source is gone (a removed export's API page, a renamed data file), then the
 * directories that leaves empty.
 */
async function remove_stale_generated_files(expected: readonly ExpectedFile[]): Promise<void> {
  const keep = new Set(expected.map((file) => file.path));
  const roots = [
    generatedDataRoot,
    ...GENERATED_CONTENT_DIRECTORIES.map((directory) => join(contentRoot, directory)),
    ...generatedPublicRoots,
  ];
  for (const root of roots) {
    for (const path of await files_under(root)) {
      if (!keep.has(path)) await rm(path);
    }
    const directories = (await exists(root))
      ? (await readdir(root, { recursive: true, withFileTypes: true }))
          .filter((entry) => entry.isDirectory())
          .map((entry) => join(entry.parentPath, entry.name))
          .sort((left, right) => right.length - left.length)
      : [];
    for (const directory of directories) {
      if ((await readdir(directory)).length === 0) await rm(directory, { recursive: true });
    }
  }
}

/**
 * The documentation as the site builds it: authored pages from disk plus the
 * generated pages as the generator renders them now. Generated pages on disk
 * are ignored, so the check needs no earlier generation and a stale copy
 * cannot hide a broken link.
 */
async function site_documents(expected: readonly ExpectedFile[]): Promise<MarkdownDocument[]> {
  const authored = (await markdownDocuments(contentRoot)).filter(
    (document) => !isGeneratedContent(document.path),
  );
  const generated = expected.filter(
    (file) => file.path.startsWith(`${contentRoot}${sep}`) && /\.mdx?$/.test(file.path),
  );
  // The site inlines a formula table into the page that names it
  // (docs/src/islands/content.tsx), so the table's row ids are that page's anchors.
  const table_root = join(generatedDataRoot, "formula-tables");
  const tables = new Map(
    expected
      .filter((file) => file.path.startsWith(`${table_root}${sep}`))
      .map((file): [string, string] => [
        relative(table_root, file.path).replace(/\.html$/, ""),
        file.content,
      ]),
  );
  const with_tables = generated.map((file) => {
    const table = tables.get(/<FormulaReference family="([^"]+)">/.exec(file.content)?.[1] ?? "");
    return table === undefined ? file : { ...file, content: `${file.content}\n${table}` };
  });
  return [...authored, ...with_tables];
}

async function check_docs(
  manifest: PublicApiManifest,
  expected: readonly ExpectedFile[],
  api_issues: readonly { code: string; message: string }[],
): Promise<string[]> {
  const failures = api_issues.map((issue) => `${issue.code}: ${issue.message}`);

  for (const old_path of Object.keys(MIGRATION_ROUTES)) {
    if (await exists(join(repositoryRoot, old_path)))
      failures.push(`duplicate migrated guide remains: ${old_path}`);
  }

  const documents = await site_documents(expected);
  for (const route of Object.values(MIGRATION_ROUTES)) {
    if (contentPathForRoute(route, documents) === undefined) {
      failures.push(`migration route has no page: ${route}`);
    }
  }
  failures.push(...movedPageIssues(MOVED_PAGES, documents, MOVED_HEADINGS));
  failures.push(
    ...movedPageIssues(
      Object.fromEntries(
        Object.entries(REMOVED_API_PAGES).map(([from, to]) => [from, { to, anchors: {} }]),
      ),
      documents,
    ),
  );
  failures.push(...(await siteLinkIssues(documents)));
  failures.push(...trackerReferenceIssues(documents));
  const public_root = join(repositoryRoot, "docs/public");
  const generated_public_files = new Set(
    expected
      .filter((file) => file.path.startsWith(`${public_root}${sep}`))
      .map((file) => `/${posix(relative(public_root, file.path))}`),
  );
  failures.push(...(await validateMarkdown(documents, manifest, generated_public_files)));
  failures.push(...(await unresolvedCssTokens(join(repositoryRoot, "docs/src"))));
  failures.push(...adapterContractIssues(manifest));

  const searched_text = documents.map((document) => document.content).join("\n");
  for (const term of REQUIRED_SEARCH_TERMS) {
    if (!searched_text.includes(term)) failures.push(`required search term is absent: ${term}`);
  }
  const all_documentation = [...documents, ...(await readReadmes())];
  const removed_directory = ["examples", "site"].join("/");
  const removed_package = ["@sheetwrite", "example-site"].join("/");
  for (const document of all_documentation) {
    if (
      document.content.includes(removed_directory) ||
      document.content.includes(removed_package)
    ) {
      failures.push(
        `${posix(relative(repositoryRoot, document.path))} references the removed example site`,
      );
    }
    for (const forbidden of FORBIDDEN_NAMES) {
      if (document.content.includes(forbidden)) {
        failures.push(
          `${posix(relative(repositoryRoot, document.path))} names removed API ${forbidden}`,
        );
      }
    }
  }

  const api_page_keys = new Set(
    expected
      .filter(
        (file) =>
          file.path.startsWith(join(contentRoot, "api/")) &&
          file.path !== join(contentRoot, "api/index.md"),
      )
      .map((file) => file.path),
  );
  const entry_page_keys = new Set(
    manifest.packages.flatMap((pkg) =>
      pkg.entryPoints.map((entry) =>
        join(contentRoot, `api/${entrySlug(pkg.name, entry.subpath)}.md`),
      ),
    ),
  );
  const symbol_page_keys = new Set(
    manifest.packages.flatMap((pkg) =>
      pkg.entryPoints.flatMap((entry) =>
        entry.exports.map((item) => join(contentRoot, `${symbolPagePath(pkg, entry, item)}.md`)),
      ),
    ),
  );
  const entry_count = entry_page_keys.size;
  const export_count = manifest.packages.reduce(
    (count, pkg) =>
      count + pkg.entryPoints.reduce((subtotal, entry) => subtotal + entry.exports.length, 0),
    0,
  );
  if (symbol_page_keys.size !== export_count) {
    failures.push(
      `API symbol route coverage mismatch: expected ${export_count}, received ${symbol_page_keys.size}`,
    );
  }
  for (const symbol_page_path of symbol_page_keys) {
    if (!api_page_keys.has(symbol_page_path)) {
      failures.push(`generated API symbol page is missing: ${symbol_page_path}`);
    }
  }
  if (api_page_keys.size !== entry_count + symbol_page_keys.size) {
    failures.push(
      `API page coverage mismatch: expected ${entry_count + symbol_page_keys.size}, received ${api_page_keys.size}`,
    );
  }

  const api_index =
    expected.find((file) => file.path === join(contentRoot, "api/index.md"))?.content ?? "";
  for (const api_page_path of entry_page_keys) {
    const route = `/docs/${posix(relative(contentRoot, api_page_path)).replace(/\.md$/, "/")}`;
    // The index links entries from raw-HTML table rows; markdown links stay
    // recognized so prose references also satisfy the contract.
    if (!api_index.includes(`](${route})`) && !api_index.includes(`href="${route}"`)) {
      failures.push(`generated API entry page is missing from the API index: ${route}`);
    }
  }

  const navigation_source = await readFile(
    join(repositoryRoot, "docs/src/lib/navigation.ts"),
    "utf8",
  );
  if (!navigation_source.includes('href: "/docs/api/"')) {
    failures.push("generated API index is missing from the documentation navigation");
  }

  const test_pages = [
    join(repositoryRoot, "docs/src/routes/test.xlsx.tsx"),
    join(repositoryRoot, "docs/src/routes/test.collaboration.tsx"),
  ];
  for (const test_page of test_pages) {
    if (!(await exists(test_page))) {
      failures.push(`${posix(relative(repositoryRoot, test_page))} is missing`);
    } else if (!(await readFile(test_page, "utf8")).includes("noindex, nofollow")) {
      failures.push(`${posix(relative(repositoryRoot, test_page))} is not marked noindex`);
    }
  }
  return [...new Set(failures)].sort();
}

/** Analysis issues that leave no manifest to generate pages from. */
const FATAL_ANALYSIS_ISSUES: Readonly<Record<string, true>> = {
  "malformed-report": true,
  "parse-error": true,
  "unclassified-entry": true,
  "unresolved-entry": true,
};

/** Writes every generated docs file and removes the ones no source produces any more. */
export async function generateDocs(analysis: PublicApiAnalysis): Promise<string> {
  const fatal_issues = analysis.issues.filter(
    (issue) => FATAL_ANALYSIS_ISSUES[issue.code] === true,
  );
  if (fatal_issues.length > 0)
    throw new Error(fatal_issues.map((issue) => issue.message).join("\n"));
  const expected = await expectedGeneratedFiles(analysis.manifest);
  await remove_stale_generated_files(expected);
  for (const file of expected) await writeIfChanged(file.path, file.content);
  const entry_count = analysis.manifest.packages.reduce(
    (count, pkg) => count + pkg.entryPoints.length,
    0,
  );
  const symbol_count = analysis.manifest.packages.reduce(
    (count, pkg) =>
      count + pkg.entryPoints.reduce((subtotal, entry) => subtotal + entry.exports.length, 0),
    0,
  );
  const undocumented = undocumentedApi(analysis.manifest)
    .filter((api) => api.members.length + api.parameters.length + api.returns.length > 0)
    .map(
      (api) =>
        `  ${api.packageName}: ${api.members.length} members, ${api.parameters.length} parameters, ${api.returns.length} return values`,
    );
  return [
    `Generated ${entry_count} API entry-point indexes, ${symbol_count} symbol pages, and documentation contracts`,
    ...(undocumented.length === 0
      ? []
      : ["Shown without a description in the API reference:", ...undocumented]),
  ].join("\n");
}

// Keep this starter surface explicit: removing a symbol must not silently remove its docs gate.
const REQUIRED_API_EXAMPLES: Readonly<Record<string, readonly string[]>> = {
  "@sheetwrite/core": [
    "initSheetwrite",
    "createGrid",
    "Grid",
    "Grid.applyTransaction",
    "Grid.aggregate",
    "Grid.sortBy",
    "Grid.filterBy",
    "Grid.undo",
    "Grid.exportCsv",
    "Grid.exportXlsx",
    "GridOptions",
    "GridConfig",
    "ContextMenuItem",
    "SheetwriteStore",
    "SheetwriteStore.aggregate",
    "Transaction",
    "DataSource",
    "createRowBridge",
    "SyncCoordinator",
    "SyncCoordinator.recoverConflict",
    "PersistenceAdapter",
    "releaseEngineMemory",
    "fromXlsxTable",
    "toXlsxTable",
    "fromXlsxWorkbook",
    "toXlsxWorkbook",
  ],
  "@sheetwrite/react": ["Sheetwrite", "SheetwriteGrid"],
  "@sheetwrite/vue": ["Sheetwrite", "SheetwriteGrid"],
  "@sheetwrite/svelte": ["Sheetwrite", "SheetwriteGrid"],
  "@sheetwrite/xlsx": ["xlsxAddon"],
  "@sheetwrite/queries": ["loadQueryEngine"],
  "@sheetwrite/charts": ["createChartViewCache", "chartsAddon"],
  "@sheetwrite/formula-assist": ["formulaAssistAddon"],
  "@sheetwrite/wasm": ["load"],
  "@sheetwrite/formulas": ["load"],
};

function require_api_examples(manifest: PublicApiManifest): void {
  const failures: string[] = [];
  for (const [package_name, names] of Object.entries(REQUIRED_API_EXAMPLES)) {
    const entry = manifest.packages
      .find((pkg) => pkg.name === package_name)
      ?.entryPoints.find((candidate) => candidate.subpath === ".");
    for (const name of names) {
      const [symbol_name, member_name] = name.split(".");
      const api_export = entry?.exports.find((candidate) => candidate.name === symbol_name);
      const documentation =
        member_name === undefined
          ? api_export?.documentation
          : api_export?.memberDocs.find((member) => member.name === member_name)?.documentation;
      if (!/(?:^|\n)@example\s*\n[\s\S]*?```(?:ts|tsx)\s*\n[\s\S]+?```/.test(documentation ?? "")) {
        failures.push(`${package_name} ${name} requires an @example with a TypeScript code block`);
      }
    }
  }
  if (failures.length > 0) throw new Error(failures.join("\n"));
}

/**
 * Renders the generated docs in memory and checks them with the authored
 * pages: links, moved pages, examples, API coverage and the showcase
 * capability contract. Throws every failure at once.
 */
export async function verifyDocs(analysis: PublicApiAnalysis): Promise<string> {
  require_api_examples(analysis.manifest);
  const expected = await expectedGeneratedFiles(analysis.manifest);
  const failures = await check_docs(analysis.manifest, expected, analysis.issues);

  // The showcase capability contract gates the docs build: a capability
  // without an owner, route, browser contract, or shared binding must not ship.
  failures.push(
    ...collectCapabilityIssues(CAPABILITY_INVENTORY, CAPABILITY_OWNERS),
    ...collectMissingCapabilityFiles(CAPABILITY_INVENTORY, CAPABILITY_OWNERS, (path) =>
      existsSync(join(repositoryRoot, path)),
    ),
    ...collectMovedShowcaseIssues(MOVED_SHOWCASES, CAPABILITY_OWNERS),
  );
  if (failures.length > 0) throw new Error(failures.join("\n"));
  return "Documentation contract check passed";
}
