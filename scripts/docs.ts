import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, readFile, rm } from "node:fs/promises";
import { join, relative, sep } from "node:path";

import { MOVED_HEADINGS } from "../docs/src/lib/moved-headings.js";
import { MOVED_PAGES } from "../docs/src/lib/moved-pages.js";
import { CAPABILITY_INVENTORY, CAPABILITY_OWNERS } from "../docs/src/showcases/capabilities.js";
import {
  collectCapabilityIssues,
  collectMissingCapabilityFiles,
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
  anchor,
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
  unresolvedCssTokens,
  validateMarkdown,
} from "./docs-content-checks.js";
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
  GENERATED_CONTENT_DIRECTORIES,
  generatedManifestPath,
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
export const ADAPTER_DOC_CONTRACT = {
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
  const exportOf = (packageName: string, name: string): ApiExport | undefined =>
    manifest.packages
      .find((pkg) => pkg.name === packageName)
      ?.entryPoints.find((entry) => entry.subpath === ".")
      ?.exports.find((item) => item.name === name);

  const gridOptions = exportOf("@sheetwrite/core", "GridOptions");
  const expectedInputs = ADAPTER_DOC_CONTRACT.inputs.filter((name) => name !== "wasmSource");
  if (gridOptions === undefined) {
    failures.push("@sheetwrite/core does not export GridOptions");
  } else {
    const implementedInputs = new Set(gridOptions.memberDocs.map((member) => member.name));
    for (const input of expectedInputs) {
      if (!implementedInputs.has(input)) {
        failures.push(
          `GridOptions member ${input} is missing from the adapter documentation contract`,
        );
      }
    }
    for (const input of implementedInputs) {
      if (!(expectedInputs as readonly string[]).includes(input)) {
        failures.push(
          `GridOptions member ${input} is not covered by the adapter documentation contract`,
        );
      }
    }
  }

  const requireMembers = (
    packageName: string,
    exportName: string,
    members: readonly string[],
  ): void => {
    const item = exportOf(packageName, exportName);
    if (item === undefined) {
      failures.push(`${packageName} does not export ${exportName}`);
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
        failures.push(`${packageName} ${exportName} does not declare ${member}`);
      } else if (!documented.has(member)) {
        failures.push(`${packageName} ${exportName} member ${member} has no documentation`);
      }
    }
  };

  for (const packageName of ADAPTER_DOC_CONTRACT.packages) {
    requireMembers(packageName, "SheetwriteGridProps", ADAPTER_DOC_CONTRACT.inputs);
    if (packageName === "@sheetwrite/vue") {
      requireMembers(packageName, "SheetwriteGridEmits", ADAPTER_DOC_CONTRACT.vueEvents);
    } else {
      requireMembers(packageName, "SheetwriteGridProps", ADAPTER_DOC_CONTRACT.handlerEvents);
    }
    requireMembers(packageName, "GridReadyEvent", ["grid", "generation", "reason"]);
  }

  const adapterEntry = manifest.packages
    .find((pkg) => pkg.name === "@sheetwrite/core")
    ?.entryPoints.find((entry) => entry.subpath === "./adapter");
  const documentedReasons = new Set<string>();
  for (const name of ["GridReadyReason", "GridResetReason"]) {
    const item = adapterEntry?.exports.find((candidate) => candidate.name === name);
    for (const match of item?.signature.matchAll(/"([a-z-]+)"/g) ?? []) {
      documentedReasons.add(match[1] ?? "");
    }
  }
  const canonicalReasons: readonly string[] = ADAPTER_DOC_CONTRACT.readyReasons;
  if (documentedReasons.size === 0) {
    failures.push("@sheetwrite/core ./adapter does not document GridReadyReason");
  } else if (
    canonicalReasons.some((reason) => !documentedReasons.has(reason)) ||
    [...documentedReasons].some((literal) => !canonicalReasons.includes(literal))
  ) {
    failures.push(
      `GridReadyReason documents [${[...documentedReasons].sort().join(", ")}] but adapters implement [${canonicalReasons.join(", ")}]`,
    );
  }
  return failures;
}

export async function expectedGeneratedFiles(manifest: PublicApiManifest): Promise<ExpectedFile[]> {
  const compatibilityIssues = [
    ...collectCompatibilityIssues(COMPATIBILITY_INVENTORY, COMPATIBILITY_FIXTURES),
    ...collectMissingCompatibilityFiles(COMPATIBILITY_INVENTORY, COMPATIBILITY_FIXTURES, (path) =>
      existsSync(join(repositoryRoot, path)),
    ),
    ...(await collectCompatibilityDigestIssues()),
  ];
  if (compatibilityIssues.length > 0) throw new Error(compatibilityIssues.join("\n"));
  const [formulaInventory, formulaReferenceEntries, publishedCompatibilityResults] =
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
  const documentationLinkIssues = unresolvedDocumentationLinks(manifest);
  if (documentationLinkIssues.length > 0) throw new Error(documentationLinkIssues.join("\n"));

  const linkRoutes = documentationLinkRoutes(manifest);
  // "Referenced by" reads repository manifests and the whole API surface, so it is
  // indexed once here rather than per symbol page.
  const consumers = await consumerIndex(manifest);
  const apiFiles: ExpectedFile[] = [
    { path: join(contentRoot, "api/index.md"), content: renderApiIndex(manifest) },
    { path: join(generatedDataRoot, "landing-bench.json"), content: await renderLandingBench() },
    { path: join(generatedDataRoot, "landing-story.json"), content: await renderLandingStory() },
  ];
  const symbolOwners = new Map<string, string>();
  for (const pkg of manifest.packages) {
    for (const entry of pkg.entryPoints) {
      apiFiles.push({
        path: join(contentRoot, `api/${entrySlug(pkg.name, entry.subpath)}.md`),
        content: renderEntryPage(pkg, entry, linkRoutes),
      });
      for (const item of entry.exports) {
        const symbolPath = join(
          contentRoot,
          `api/${entrySlug(pkg.name, entry.subpath)}/${anchor(item.name)}.md`,
        );
        const owner = `${pkg.name}|${entry.subpath}|${item.name}`;
        const existingOwner = symbolOwners.get(symbolPath);
        if (existingOwner !== undefined) {
          throw new Error(`API symbol route collision: ${existingOwner} and ${owner}`);
        }
        symbolOwners.set(symbolPath, owner);
        apiFiles.push({
          path: symbolPath,
          content: await renderSymbolPage(pkg, entry, item, linkRoutes, consumers),
        });
      }
    }
  }
  const exportCount = manifest.packages.reduce(
    (count, pkg) =>
      count + pkg.entryPoints.reduce((entryCount, entry) => entryCount + entry.exports.length, 0),
    0,
  );
  const contract = {
    formatVersion: 2,
    generatedBy: "scripts/docs.ts",
    movedGuideRoutes: MIGRATION_ROUTES,
    movedPages: MOVED_PAGES,
    requiredSearchTerms: REQUIRED_SEARCH_TERMS,
    entryPointCount: manifest.packages.reduce((count, pkg) => count + pkg.entryPoints.length, 0),
    exportCount,
    symbolPageCount: exportCount,
    apiSha256: createHash("sha256").update(JSON.stringify(manifest)).digest("hex"),
    compatibilitySha256: createHash("sha256")
      .update(JSON.stringify([COMPATIBILITY_INVENTORY, COMPATIBILITY_FIXTURES]))
      .digest("hex"),
    formulaContractSha256: createHash("sha256")
      .update(JSON.stringify(formulaInventory))
      .digest("hex"),
  };
  const formulaNames = new Set<string>();
  if (
    !formulaInventory ||
    typeof formulaInventory !== "object" ||
    !("functions" in formulaInventory) ||
    !Array.isArray(formulaInventory.functions)
  ) {
    throw new Error("Formula inventory must contain functions");
  }
  const formulas: unknown[] = formulaInventory.functions;
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
    formulaNames.add(formula.canonical);
    for (const alias of formula.aliases) {
      if (typeof alias !== "string") throw new Error("Formula aliases must be strings");
      formulaNames.add(alias);
    }
  }

  const formulaPages = renderFormulaFunctionPages(formulaInventory, formulaReferenceEntries);
  const excelCatalog: unknown = JSON.parse(
    await readFile(join(repositoryRoot, "scripts/excel-functions.json"), "utf8"),
  );
  const excelCoverage = renderExcelCoveragePage(formulaInventory, excelCatalog);
  const files: ExpectedFile[] = [
    ...apiFiles,
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
    ...formulaPages.map((page) => ({ path: join(contentRoot, page.route), content: page.content })),
    ...formulaPages.flatMap(({ table }) =>
      table === undefined
        ? []
        : [
            {
              path: join(generatedDataRoot, `formula-tables/${table.family}.html`),
              content: table.html,
            },
          ],
    ),
    { path: join(contentRoot, excelCoverage.route), content: excelCoverage.content },
    ...siteDataFiles(manifest, formulaPages),
    {
      path: join(generatedDataRoot, "formula-summary.json"),
      content: stableJson({ functionCount: formulaNames.size }),
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
      content: stableJson(publishedCompatibilityResults),
    },
    // The landing shows the counts only; the full results ship with their own page.
    {
      path: join(generatedDataRoot, "compatibility-summary.json"),
      content: stableJson(publishedCompatibilityResults.testSet),
    },
    ...splitPerformancePages(await renderEvidenceText()).map((page) => ({
      path: join(contentRoot, page.route),
      content: page.content,
    })),
    { path: generatedManifestPath, content: stableJson(manifest) },
    { path: docsContractPath, content: stableJson(contract) },
  ];
  files.push(...(await expectedLlmsFiles(manifest, repositoryRoot, files)));
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
async function filesUnder(root: string): Promise<string[]> {
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
async function removeStaleGeneratedFiles(expected: readonly ExpectedFile[]): Promise<void> {
  const keep = new Set(expected.map((file) => file.path));
  const roots = [
    generatedDataRoot,
    ...GENERATED_CONTENT_DIRECTORIES.map((directory) => join(contentRoot, directory)),
  ];
  for (const root of roots) {
    for (const path of await filesUnder(root)) {
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
async function siteDocuments(expected: readonly ExpectedFile[]): Promise<MarkdownDocument[]> {
  const authored = (await markdownDocuments(contentRoot)).filter(
    (document) => !isGeneratedContent(document.path),
  );
  const generated = expected.filter(
    (file) => file.path.startsWith(`${contentRoot}${sep}`) && /\.mdx?$/.test(file.path),
  );
  return [...authored, ...generated];
}

async function checkDocs(
  manifest: PublicApiManifest,
  expected: readonly ExpectedFile[],
  apiIssues: readonly { code: string; message: string }[],
): Promise<string[]> {
  const failures = apiIssues.map((issue) => `${issue.code}: ${issue.message}`);

  for (const oldPath of Object.keys(MIGRATION_ROUTES)) {
    if (await exists(join(repositoryRoot, oldPath)))
      failures.push(`duplicate migrated guide remains: ${oldPath}`);
  }

  const documents = await siteDocuments(expected);
  for (const route of Object.values(MIGRATION_ROUTES)) {
    if (contentPathForRoute(route, documents) === undefined) {
      failures.push(`migration route has no page: ${route}`);
    }
  }
  failures.push(...movedPageIssues(MOVED_PAGES, documents, MOVED_HEADINGS));
  failures.push(...(await siteLinkIssues(documents)));
  failures.push(...(await validateMarkdown(documents, manifest)));
  failures.push(...(await unresolvedCssTokens(join(repositoryRoot, "docs/src"))));
  failures.push(...adapterContractIssues(manifest));

  const searchedText = documents.map((document) => document.content).join("\n");
  for (const term of REQUIRED_SEARCH_TERMS) {
    if (!searchedText.includes(term)) failures.push(`required search term is absent: ${term}`);
  }
  const allDocumentation = [...documents, ...(await readReadmes())];
  const removedDirectory = ["examples", "site"].join("/");
  const removedPackage = ["@sheetwrite", "example-site"].join("/");
  for (const document of allDocumentation) {
    if (document.content.includes(removedDirectory) || document.content.includes(removedPackage)) {
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

  const apiPageKeys = new Set(
    expected
      .filter(
        (file) =>
          file.path.startsWith(join(contentRoot, "api/")) &&
          file.path !== join(contentRoot, "api/index.md"),
      )
      .map((file) => file.path),
  );
  const entryPageKeys = new Set(
    manifest.packages.flatMap((pkg) =>
      pkg.entryPoints.map((entry) =>
        join(contentRoot, `api/${entrySlug(pkg.name, entry.subpath)}.md`),
      ),
    ),
  );
  const symbolPageKeys = new Set(
    manifest.packages.flatMap((pkg) =>
      pkg.entryPoints.flatMap((entry) =>
        entry.exports.map((item) =>
          join(contentRoot, `api/${entrySlug(pkg.name, entry.subpath)}/${anchor(item.name)}.md`),
        ),
      ),
    ),
  );
  const entryCount = entryPageKeys.size;
  const exportCount = manifest.packages.reduce(
    (count, pkg) =>
      count + pkg.entryPoints.reduce((subtotal, entry) => subtotal + entry.exports.length, 0),
    0,
  );
  if (symbolPageKeys.size !== exportCount) {
    failures.push(
      `API symbol route coverage mismatch: expected ${exportCount}, received ${symbolPageKeys.size}`,
    );
  }
  for (const symbolPagePath of symbolPageKeys) {
    if (!apiPageKeys.has(symbolPagePath)) {
      failures.push(`generated API symbol page is missing: ${symbolPagePath}`);
    }
  }
  if (apiPageKeys.size !== entryCount + symbolPageKeys.size) {
    failures.push(
      `API page coverage mismatch: expected ${entryCount + symbolPageKeys.size}, received ${apiPageKeys.size}`,
    );
  }

  const apiIndex =
    expected.find((file) => file.path === join(contentRoot, "api/index.md"))?.content ?? "";
  for (const apiPagePath of entryPageKeys) {
    const route = `/docs/${posix(relative(contentRoot, apiPagePath)).replace(/\.md$/, "/")}`;
    // The index links entries from raw-HTML table rows; markdown links stay
    // recognized so prose references also satisfy the contract.
    if (!apiIndex.includes(`](${route})`) && !apiIndex.includes(`href="${route}"`)) {
      failures.push(`generated API entry page is missing from the API index: ${route}`);
    }
  }

  const navigationSource = await readFile(
    join(repositoryRoot, "docs/src/lib/navigation.ts"),
    "utf8",
  );
  if (!navigationSource.includes('href: "/docs/api/"')) {
    failures.push("generated API index is missing from the documentation navigation");
  }

  const testPages = [
    join(repositoryRoot, "docs/src/routes/test.xlsx.tsx"),
    join(repositoryRoot, "docs/src/routes/test.collaboration.tsx"),
  ];
  for (const testPage of testPages) {
    if (!(await exists(testPage))) {
      failures.push(`${posix(relative(repositoryRoot, testPage))} is missing`);
    } else if (!(await readFile(testPage, "utf8")).includes("noindex, nofollow")) {
      failures.push(`${posix(relative(repositoryRoot, testPage))} is not marked noindex`);
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
  const fatalIssues = analysis.issues.filter((issue) => FATAL_ANALYSIS_ISSUES[issue.code] === true);
  if (fatalIssues.length > 0) throw new Error(fatalIssues.map((issue) => issue.message).join("\n"));
  const expected = await expectedGeneratedFiles(analysis.manifest);
  await removeStaleGeneratedFiles(expected);
  for (const file of expected) await writeIfChanged(file.path, file.content);
  const entryCount = analysis.manifest.packages.reduce(
    (count, pkg) => count + pkg.entryPoints.length,
    0,
  );
  const symbolCount = analysis.manifest.packages.reduce(
    (count, pkg) =>
      count + pkg.entryPoints.reduce((subtotal, entry) => subtotal + entry.exports.length, 0),
    0,
  );
  return `Generated ${entryCount} API entry-point indexes, ${symbolCount} symbol pages, and documentation contracts`;
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
  "@sheetwrite/wasm": ["load"],
  "@sheetwrite/formulas": ["load"],
};

function requireApiExamples(manifest: PublicApiManifest): void {
  const failures: string[] = [];
  for (const [packageName, names] of Object.entries(REQUIRED_API_EXAMPLES)) {
    const entry = manifest.packages
      .find((pkg) => pkg.name === packageName)
      ?.entryPoints.find((candidate) => candidate.subpath === ".");
    for (const name of names) {
      const [symbolName, memberName] = name.split(".");
      const apiExport = entry?.exports.find((candidate) => candidate.name === symbolName);
      const documentation =
        memberName === undefined
          ? apiExport?.documentation
          : apiExport?.memberDocs.find((member) => member.name === memberName)?.documentation;
      if (!/(?:^|\n)@example\s*\n[\s\S]*?```(?:ts|tsx)\s*\n[\s\S]+?```/.test(documentation ?? "")) {
        failures.push(`${packageName} ${name} requires an @example with a TypeScript code block`);
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
  requireApiExamples(analysis.manifest);
  const expected = await expectedGeneratedFiles(analysis.manifest);
  const failures = await checkDocs(analysis.manifest, expected, analysis.issues);

  // The showcase capability contract gates the docs build: a capability
  // without an owner, route, browser contract, or shared binding must not ship.
  failures.push(
    ...collectCapabilityIssues(CAPABILITY_INVENTORY, CAPABILITY_OWNERS),
    ...collectMissingCapabilityFiles(CAPABILITY_INVENTORY, CAPABILITY_OWNERS, (path) =>
      existsSync(join(repositoryRoot, path)),
    ),
  );
  if (failures.length > 0) throw new Error(failures.join("\n"));
  return "Documentation contract check passed";
}
