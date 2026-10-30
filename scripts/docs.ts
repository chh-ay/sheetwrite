import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { access, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, normalize, relative, resolve, sep } from "node:path";

import {
  isCallSignatureDeclaration,
  isClassDeclaration,
  isConstructorDeclaration,
  isConstructSignatureDeclaration,
  isIndexSignatureDeclaration,
  isInterfaceDeclaration,
  isTypeAliasDeclaration,
  isTypeLiteralNode,
  isUnionTypeNode,
  type Node,
  type SourceFile,
} from "typescript/unstable/ast";
import { API, type Diagnostic, type Project } from "typescript/unstable/async";

import { validateEngineVersions } from "../bench/src/engine-versions.js";
import { MOVED_HEADINGS, MOVED_PAGES, type MovedPage } from "../docs/src/lib/moved-pages.js";
import { DOCS_NAVIGATION, navigationPages } from "../docs/src/lib/navigation.js";
import {
  collectFenceHovers,
  formatDeclaration,
  formatTypeExpression,
  isHighQualityHover,
} from "../docs/src/lib/sheetwrite-code-hovers.js";
import { SheetwriteTypeEngine } from "../docs/src/lib/sheetwrite-type-engine.js";
import { CAPABILITY_INVENTORY, CAPABILITY_OWNERS } from "../docs/src/showcases/capabilities.js";
import {
  collectCapabilityIssues,
  collectMissingCapabilityFiles,
} from "../docs/src/showcases/capability-validation.js";
import {
  buildCompatibilityResults,
  type CompatibilityResults,
} from "../docs/src/showcases/compatibility-results.js";
import {
  collectCompatibilityIssues,
  collectMissingCompatibilityFiles,
} from "../docs/src/showcases/compatibility-validation.js";
import {
  COMPATIBILITY_FIXTURES,
  COMPATIBILITY_INVENTORY,
  type CompatibilityFixture,
  type CompatibilityRecord,
} from "../docs/src/showcases/compatibility.js";
import {
  benchLinearScale,
  benchLogScale,
  benchScaleFigure,
  type BenchScale,
} from "./bench-figures.js";
import { compareReviewedObservation } from "./conformance/compare.js";
import { loadCorpus } from "./conformance/corpus.js";
import { readConformanceManifest } from "./conformance/generate.js";
import { runOffline } from "./conformance/offline.js";
import { expectedLlmsFiles } from "./docs-llms.js";
import {
  allMeasurements,
  evidenceHeadline,
  formatCaptureTime,
  formatCount,
  formatMb,
  formatMs,
  formatSpeedup,
  html,
  provenanceList,
  readableId,
  readableText,
  shortHash,
} from "./evidence-format.js";
import {
  formulaFamilyNavigation,
  loadFormulaContractInventory,
  renderFormulaFunctionPages,
} from "./formula-docs.js";
import {
  renderFullEngineEvidence,
  validateFullEngineArtifact,
  validateMatchedEngineArtifact,
} from "./full-engine-docs.js";
import {
  type ApiEntryPoint,
  type ApiExport,
  type ApiPackage,
  analyzePublicApi,
  type PublicApiManifest,
} from "./public-api.js";
import {
  formatMetricDelta,
  formatMetricDisplay,
  type Metric,
  type SizeHistory,
  type SizeReport,
  validateSizeHistory,
} from "./size-report.js";

const repositoryRoot = resolve(import.meta.dir, "..");
const contentRoot = join(repositoryRoot, "docs/src/content/docs");
const generatedDataRoot = join(repositoryRoot, "docs/src/generated");
const generatedManifestPath = join(generatedDataRoot, "public-api.json");
const docsContractPath = join(generatedDataRoot, "docs-contract.json");

export const MIGRATION_ROUTES = {
  "docs/README.md": "/docs/start/installation/",
  "docs/getting-started.md": "/docs/start/installation/",
  "docs/concepts.md": "/docs/concepts/runtime-ownership/",
  "docs/configuration.md": "/docs/features/grid/options-and-presentation/",
  "docs/framework-integration.md": "/docs/frameworks/lifecycle/",
  "docs/interaction.md": "/docs/features/grid/selection-and-keyboard/",
  "docs/data-operations.md": "/docs/features/data/data-operations/",
  "docs/formulas.md": "/docs/features/formulas/authoring-and-references/",
  "docs/collaboration.md": "/docs/features/collaboration/",
  "docs/worker-rendering.md": "/docs/features/worker-rendering/",
  "docs/styling.md": "/docs/features/formatting/styles/",
  "docs/accessibility.md": "/docs/features/accessibility/",
} as const;

const PACKAGE_DIRECTORIES: Readonly<Record<string, string>> = {
  "@sheetwrite/charts": "packages/charts",
  "@sheetwrite/core": "packages/core",
  "@sheetwrite/formulas": "packages/formulas",
  "@sheetwrite/react": "packages/react",
  "@sheetwrite/svelte": "packages/svelte",
  "@sheetwrite/vue": "packages/vue",
  "@sheetwrite/wasm": "packages/wasm",
  "@sheetwrite/xlsx": "packages/xlsx",
};

const REQUIRED_SEARCH_TARGETS = [
  { term: "rendererKind", packageName: "@sheetwrite/core", subpath: ".", owner: "Grid" },
  {
    term: "onGridChange",
    packageName: "@sheetwrite/core",
    subpath: "./adapter",
    owner: "GridAdapterEventHandlers",
  },
  { term: "applyTransaction", packageName: "@sheetwrite/core", subpath: ".", owner: "Grid" },
  { term: "getCellAtPoint", packageName: "@sheetwrite/core", subpath: ".", owner: "Grid" },
] as const;

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

interface ExpectedFile {
  path: string;
  content: string;
}

interface MarkdownDocument {
  path: string;
  content: string;
}

interface Fence {
  language: string;
  meta: string;
  code: string;
  line: number;
}

function posix(path: string): string {
  return path.split(sep).join("/");
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}
let compatibilityResultsPromise: Promise<CompatibilityResults> | undefined;

function compatibilityResults(): Promise<CompatibilityResults> {
  compatibilityResultsPromise ??= (async () => {
    const testDirectory = join(repositoryRoot, "test/conformance");
    const paths = {
      manifest: join(testDirectory, "corpus.manifest.json"),
      inventory: join(testDirectory, "formula-contract.inventory.json"),
      captures: join(repositoryRoot, "scripts/conformance/captures"),
    };
    const [corpus, manifest, packageJson] = await Promise.all([
      loadCorpus(join(testDirectory, "corpus.json"), paths),
      readConformanceManifest(paths.manifest),
      readFile(join(repositoryRoot, "packages/core/package.json"), "utf8").then(
        (content) => JSON.parse(content) as { version: string },
      ),
    ]);
    const offline = await runOffline(corpus, paths);
    return buildCompatibilityResults({
      corpus,
      manifest,
      offline,
      libraryVersion: packageJson.version,
      compareObservation: compareReviewedObservation,
    });
  })();
  return compatibilityResultsPromise;
}

export function entrySlug(packageName: string, subpath: string): string {
  const packageSlug = packageName.replace("@sheetwrite/", "");
  if (subpath === ".") return packageSlug;
  return `${packageSlug}-${subpath.replace(/^\.\//, "").replace(/[^a-zA-Z0-9]+/g, "-")}`;
}

function packageSourcePath(packageName: string, source: string): string {
  const separator = source.indexOf("#");
  const file = separator === -1 ? source : source.slice(0, separator);
  const fragment = separator === -1 ? undefined : source.slice(separator + 1);
  const packageDirectory = PACKAGE_DIRECTORIES[packageName];
  if (packageDirectory === undefined) return source;
  const normalized = posix(normalize(join(packageDirectory, file)));
  return fragment === undefined ? normalized : `${normalized}#${fragment}`;
}

function entryLabel(pkg: ApiPackage, entry: ApiEntryPoint): string {
  return entry.subpath === "." ? pkg.name : `${pkg.name}/${entry.subpath.slice(2)}`;
}

function frontmatter(title: string, description: string): string {
  return `---\ntitle: ${JSON.stringify(title)}\ndescription: ${JSON.stringify(description)}\n---\n\n`;
}

interface DeclarationMember {
  name: string;
  signature: string;
}

interface DeclarationShape {
  formatted: string;
  members: DeclarationMember[];
  variants: string[];
}

interface DocumentationLinkCandidate {
  readonly packageName: string;
  readonly entry: ApiEntryPoint;
  readonly route: string;
  readonly item: ApiExport;
}

type DocumentationLinkRoutes = ReadonlyMap<string, readonly DocumentationLinkCandidate[]>;

export function documentationLinkRoutes(manifest: PublicApiManifest): DocumentationLinkRoutes {
  const routes = new Map<string, DocumentationLinkCandidate[]>();
  for (const pkg of manifest.packages) {
    for (const entry of pkg.entryPoints) {
      for (const item of entry.exports) {
        const candidates = routes.get(item.name) ?? [];
        candidates.push({
          packageName: pkg.name,
          entry,
          route: symbolRoute(pkg, entry, item),
          item,
        });
        routes.set(item.name, candidates);
      }
    }
  }
  return routes;
}

function uniqueDocumentationCandidate(
  routes: DocumentationLinkRoutes,
  packageName: string,
  target: string,
): DocumentationLinkCandidate | undefined {
  const candidates = routes.get(target) ?? [];
  const packageCandidates = candidates.filter((candidate) => candidate.packageName === packageName);
  if (packageCandidates.length === 1) return packageCandidates[0];
  return candidates.length === 1 ? candidates[0] : undefined;
}

/**
 * The same symbol is re-exported from several entry points, so a reference resolves to
 * the page's own entry first, then its package, then an unambiguous match anywhere.
 */
function closestCandidate<
  T extends { readonly packageName: string; readonly entry: ApiEntryPoint },
>(candidates: readonly T[], packageName: string, entry: ApiEntryPoint): T | undefined {
  const local = candidates.filter(
    (candidate) => candidate.packageName === packageName && candidate.entry === entry,
  );
  const samePackage = candidates.filter((candidate) => candidate.packageName === packageName);
  return [local, samePackage, candidates].find((group) => group.length === 1)?.[0];
}

function hasRenderedMember(item: ApiExport, memberName: string): boolean {
  return declarationShape(parseableDeclaration(item)).members.some(
    (member) => member.name === memberName,
  );
}

function documentationLinkRoute(
  pkg: ApiPackage,
  entry: ApiEntryPoint,
  item: ApiExport,
  target: string,
  routes: DocumentationLinkRoutes,
): string | undefined {
  if (/^(?:https?:\/\/|\/docs\/)/.test(target)) return target;
  const targetParts = target.split(".");
  if (targetParts.length > 2) return undefined;
  const [ownerName, memberName] = targetParts;
  if (memberName !== undefined) {
    const localOwner = entry.exports.find((candidate) => candidate.name === ownerName);
    const owner =
      localOwner === undefined
        ? uniqueDocumentationCandidate(routes, pkg.name, ownerName ?? "")
        : {
            packageName: pkg.name,
            entry,
            route: symbolRoute(pkg, entry, localOwner),
            item: localOwner,
          };
    return owner === undefined || !hasRenderedMember(owner.item, memberName)
      ? undefined
      : `${owner.route}#${anchor(ownerName ?? "")}-${anchor(memberName)}`;
  }
  const local = entry.exports.find((candidate) => candidate.name === target);
  if (local !== undefined) return symbolRoute(pkg, entry, local);
  if (hasRenderedMember(item, target)) {
    return `${symbolRoute(pkg, entry, item)}#${anchor(item.name)}-${anchor(target)}`;
  }
  return uniqueDocumentationCandidate(routes, pkg.name, target)?.route;
}

export function unresolvedDocumentationLinks(manifest: PublicApiManifest): string[] {
  const routes = documentationLinkRoutes(manifest);
  const issues: string[] = [];
  for (const pkg of manifest.packages) {
    for (const entry of pkg.entryPoints) {
      for (const item of entry.exports) {
        const documentation = [
          item.documentation,
          ...item.memberDocs.map((member) => member.documentation),
        ];
        for (const source of documentation) {
          for (const match of source.matchAll(/\{@link\s+([^\s|}]+)/g)) {
            const target = match[1] ?? "";
            if (documentationLinkRoute(pkg, entry, item, target, routes) === undefined) {
              issues.push(
                `${pkg.name} ${entry.subpath} ${item.name} has unresolved documentation link ${target}`,
              );
            }
          }
        }
      }
    }
  }
  return issues;
}

/**
 * JSDoc body, examples and related links. `headingLevel` places the Examples
 * and See also headings one level below whatever holds the text: 2 for a
 * symbol page's opening summary (under the page title), 3 for a member's
 * documentation (under Members), so heading levels never skip.
 */
function documentationSections(
  documentation: string,
  pkg: ApiPackage,
  entry: ApiEntryPoint,
  item: ApiExport,
  routes: DocumentationLinkRoutes,
  headingLevel: 2 | 3,
): string {
  const heading = "#".repeat(headingLevel);
  const sections = documentation.split(/(?:^|\n)@(example|see)\b\s*\n?/);
  const body = [sections[0]?.trim() ?? ""];
  const examples: string[] = [];
  const related: string[] = [];
  for (let index = 1; index < sections.length; index += 2) {
    const tag = sections[index];
    const value = sections[index + 1]?.trim() ?? "";
    if (tag === "example") {
      examples.push(value.replace(/^```(ts|tsx)(?:\s+compile)?\s*$/gm, "```$1 compile"));
    } else if (tag === "see") {
      const link = /^\{@link\s+([^\s|}]+)(?:\s*\|\s*([^}]+))?\}$/.exec(value);
      const target = link?.[1] ?? value;
      const label = link?.[2]?.trim() || target;
      const route = documentationLinkRoute(pkg, entry, item, target, routes);
      related.push(route === undefined ? `- ${value}` : `- [${label}](${route})`);
    }
  }
  if (examples.length > 0) body.push(`${heading} Examples`, ...examples);
  if (related.length > 0) body.push(`${heading} See also`, related.join("\n"));
  return body.join("\n\n");
}

function documentationMarkdown(
  pkg: ApiPackage,
  entry: ApiEntryPoint,
  item: ApiExport,
  routes: DocumentationLinkRoutes = new Map(),
  source = item.documentation,
  headingLevel: 2 | 3 = 3,
): string {
  const documentation =
    source.trim() || "Source summary unavailable; docs:check rejects this omission.";
  return documentationSections(documentation, pkg, entry, item, routes, headingLevel).replace(
    /\{@link\s+([^\s|}]+)(?:\s*\|\s*([^}]+))?\}/g,
    (_match, target: string, label: string | undefined) => {
      const text = label?.trim() || target;
      const route = documentationLinkRoute(pkg, entry, item, target, routes);
      return route === undefined ? `\`${text}\`` : `[\`${text}\`](${route})`;
    },
  );
}

function memberDocumentationHtml(
  pkg: ApiPackage,
  entry: ApiEntryPoint,
  item: ApiExport,
  documentation: string,
  routes: DocumentationLinkRoutes,
): string {
  return html(documentation).replace(
    /\{@link\s+([^\s|}]+)(?:\s*\|\s*([^}]+))?\}/g,
    (_match, target: string, label: string | undefined) => {
      const text = label?.trim() || target;
      const route = documentationLinkRoute(pkg, entry, item, target, routes);
      return route === undefined
        ? `<code>${text}</code>`
        : `<a href="${route}"><code>${text}</code></a>`;
    },
  );
}

function compactSummary(markdown: string): string {
  const plain = markdown
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[`*_~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const firstSentence = /^.{24,240}?[.!?](?=\s|$)/.exec(plain)?.[0];
  if (firstSentence !== undefined) return firstSentence;
  if (plain.length <= 220) return plain;
  const clipped = plain.slice(0, 217);
  return `${clipped.slice(0, clipped.lastIndexOf(" "))}…`;
}

/** Search results show about this many characters of a description. */
const SEARCH_DESCRIPTION_MAX = 160;

/**
 * The search and social description of one API symbol page: the symbol, its
 * kind and its package, then the JSDoc summary. The lead keeps a type that
 * two packages re-export from sharing one description. A long result is
 * clipped on a word; a short one stays short, as its JSDoc is.
 */
export function symbolDescription(
  name: string,
  kind: string,
  packageLabel: string,
  summary: string,
): string {
  const text = `${name} ${kind} in ${packageLabel}: ${summary}`;
  if (text.length <= SEARCH_DESCRIPTION_MAX) return text;

  const clipped = text.slice(0, SEARCH_DESCRIPTION_MAX - 1);
  return `${clipped.slice(0, clipped.lastIndexOf(" ")).replace(/[,;:]$/, "")}…`;
}

const KIND_LABELS: Readonly<Record<string, string>> = {
  class: "Classes",
  enum: "Enums",
  function: "Functions",
  interface: "Interfaces",
  type: "Types",
  variable: "Variables",
};

function anchor(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const DECLARATION_KEYWORD =
  /^(?:declare|export|abstract|interface|type|class|enum|function|const|let|var|namespace)\b/;

/** Member lists longer than this get an anchor index at the top of the page. */
const MEMBER_INDEX_MINIMUM = 6;
/** References listed per group before the remainder is summarized. */
const REFERENCE_DISPLAY_LIMIT = 12;

/** Bare call-signature or type strings from the checker are not statements; wrap them so the TS parser and printer cannot mangle them. */
function parseableDeclaration(item: Pick<ApiExport, "name" | "signature">): string {
  const signature = item.signature.trim();
  if (DECLARATION_KEYWORD.test(signature)) return signature;
  if (signature.startsWith("<") || signature.startsWith("(")) {
    return `declare function ${item.name}${signature};`;
  }
  return `declare const ${item.name}: ${signature};`;
}

/**
 * Declaration shapes keyed by signature text. The TypeScript 7 API only parses files that
 * belong to a project, so shapes are parsed in batches by {@link prepareDeclarationShapes}
 * and then read synchronously by the link resolution and page renderers.
 */
const declarationShapes = new Map<string, DeclarationShape>();

/**
 * Parse declarations with the TypeScript 7 API: each signature becomes a file in a scratch
 * inferred project, printed by its emitter and read back as `typescript/unstable/ast` nodes.
 */
async function prepareDeclarationShapes(signatures: Iterable<string>): Promise<void> {
  const pending = [...new Set(signatures)].filter((signature) => !declarationShapes.has(signature));
  if (pending.length === 0) return;
  const directory = await mkdtemp(join(tmpdir(), "sheetwrite-declarations-"));
  const api = new API({ cwd: directory });
  try {
    const declarations: Array<{ signature: string; path: string }> = [];
    for (const [index, signature] of pending.entries()) {
      const path = join(directory, `declaration-${index}.d.ts`);
      await writeFile(path, signature);
      declarations.push({ signature, path });
    }
    const snapshot = await api.updateSnapshot({
      openFiles: declarations.map((declaration) => declaration.path),
    });
    try {
      let project: Project | undefined;
      for (const declaration of declarations) {
        project ??= await snapshot.getDefaultProjectForFile(declaration.path);
        if (project === undefined) {
          throw new Error("TypeScript 7 could not open the scratch declaration project");
        }
        declarationShapes.set(
          declaration.signature,
          await readDeclarationShape(project, declaration.path, declaration.signature),
        );
      }
    } finally {
      await snapshot.dispose();
    }
  } finally {
    await api.close();
    await rm(directory, { force: true, recursive: true });
  }
}

async function readDeclarationShape(
  project: Project,
  path: string,
  signature: string,
): Promise<DeclarationShape> {
  const sourceFile = await project.program.getSourceFile(path);
  const declaration = sourceFile?.statements[0];
  if (sourceFile === undefined || declaration === undefined) {
    return { formatted: signature, members: [], variants: [] };
  }
  const memberNodes: readonly Node[] =
    isInterfaceDeclaration(declaration) || isClassDeclaration(declaration)
      ? declaration.members
      : isTypeAliasDeclaration(declaration) && isTypeLiteralNode(declaration.type)
        ? declaration.type.members
        : [];
  return {
    formatted: await project.emitter.printNode(declaration),
    members: memberNodes.map((member, index) => ({
      name: declarationMemberName(member, index, sourceFile),
      signature: member.getText(sourceFile).replace(/\s+/g, " ").trim(),
    })),
    variants:
      isTypeAliasDeclaration(declaration) && isUnionTypeNode(declaration.type)
        ? declaration.type.types.map((variant) =>
            variant.getText(sourceFile).replace(/\s+/g, " ").trim(),
          )
        : [],
  };
}

function declarationMemberName(member: Node, index: number, sourceFile: SourceFile): string {
  const named = member as Node & { name?: Node };
  if (named.name !== undefined) {
    return named.name.getText(sourceFile).replace(/^["']|["']$/g, "");
  }
  if (isConstructorDeclaration(member)) return "constructor";
  if (isCallSignatureDeclaration(member)) return "call";
  if (isConstructSignatureDeclaration(member)) return "new";
  if (isIndexSignatureDeclaration(member)) return "index";
  return `member-${index + 1}`;
}

function declarationShape(signature: string): DeclarationShape {
  return declarationShapes.get(signature) ?? { formatted: signature, members: [], variants: [] };
}

/**
 * Split `text` on `separator` where it is not nested in brackets and not inside a
 * string literal. Member signatures are one-liners, so a single scan is enough.
 */
function splitTopLevel(text: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | undefined;
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index] ?? "";
    if (quote !== undefined) {
      if (character === quote && text[index - 1] !== "\\") quote = undefined;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
    } else if (character === "(" || character === "[" || character === "{") {
      depth += 1;
    } else if (character === ")" || character === "]" || character === "}") {
      depth -= 1;
    } else if (character === separator && depth === 0) {
      parts.push(text.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

interface MemberTypeParts {
  /** Everything up to and including the member's top-level colon. */
  readonly prefix: string;
  /** The declared type, without the statement terminator. */
  readonly type: string;
  readonly terminated: boolean;
}

/**
 * The declared type of a member row. Only a colon outside brackets and string
 * literals separates the member prefix from its type.
 */
function memberTypeParts(signature: string): MemberTypeParts | undefined {
  const parts = splitTopLevel(signature, ":");
  if (parts.length < 2) return undefined;
  const rest = parts.slice(1).join(":").trim();
  const terminated = rest.endsWith(";");
  return {
    prefix: `${parts[0] ?? ""}:`,
    type: terminated ? rest.slice(0, -1).trim() : rest,
    terminated,
  };
}

/** Order- and duplicate-insensitive identity of a string-literal union. */
function literalUnionKey(literals: readonly string[]): string {
  return [...new Set(literals)].sort().join("\u0000");
}

function stringLiteralUnionVariants(type: string): string[] | undefined {
  const variants = splitTopLevel(type, "|").map((variant) => variant.trim());
  if (variants.length < 2) return undefined;
  if (!variants.every((variant) => /^"(?:[^"\\]|\\.)*"$/.test(variant))) return undefined;
  return variants.map((variant) => variant.slice(1, -1));
}

interface UnionAlias {
  readonly name: string;
  readonly route: string;
}

/**
 * The checker expands an aliased union at every use site, so `code: SheetwriteErrorCode`
 * prints as its literals. This index maps that expansion back to the alias that names
 * it: an alias qualifies when its declaration is a string-literal union, or the
 * `(typeof SOME_EXPORTED_ARRAY)[number]` form whose array holds the same literals.
 */
async function unionAliasIndex(
  pkg: ApiPackage,
  entry: ApiEntryPoint,
  routes: DocumentationLinkRoutes,
): Promise<Map<string, UnionAlias>> {
  const candidates = [...routes.values()].flat().filter(({ item }) => item.kind === "type");
  if (candidates.length === 0) return new Map();
  await prepareDeclarationShapes(candidates.map(({ item }) => parseableDeclaration(item)));
  const byLiteralSet = new Map<
    string,
    Array<UnionAlias & { entry: ApiEntryPoint; packageName: string }>
  >();
  for (const candidate of candidates) {
    const shape = declarationShape(parseableDeclaration(candidate.item));
    let literals: string[] | undefined;
    if (shape.variants.length > 0) {
      literals = stringLiteralUnionVariants(shape.variants.join(" | "));
    } else {
      const indirect = /^\(typeof\s+([A-Za-z0-9_$]+)\)\[\s*number\s*\]$/.exec(
        candidate.item.signature
          .replace(/^[^=]*=/, "")
          .replace(/;\s*$/, "")
          .trim(),
      );
      const source =
        indirect === null
          ? undefined
          : closestCandidate(
              routes.get(indirect[1] ?? "") ?? [],
              candidate.packageName,
              candidate.entry,
            );
      literals =
        source === undefined
          ? undefined
          : (source.item.signature.match(/"((?:[^"\\]|\\.)*)"/g) ?? []).map((value) =>
              value.slice(1, -1),
            );
    }
    if (literals === undefined || literals.length < 2) continue;
    const key = literalUnionKey(literals);
    const resolved = byLiteralSet.get(key) ?? [];
    resolved.push({
      name: candidate.item.name,
      route: candidate.route,
      entry: candidate.entry,
      packageName: candidate.packageName,
    });
    byLiteralSet.set(key, resolved);
  }
  const aliases = new Map<string, UnionAlias>();
  for (const [key, resolved] of byLiteralSet) {
    const chosen = closestCandidate(resolved, pkg.name, entry);
    if (chosen !== undefined) aliases.set(key, { name: chosen.name, route: chosen.route });
  }
  return aliases;
}

interface WorkspaceDependent {
  readonly name: string;
  readonly kind: "dependency" | "peer" | "optional" | "dev";
}

interface SymbolReference {
  readonly packageName: string;
  readonly name: string;
  readonly route: string;
}

interface WorkspaceManifest {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

/** Declaration order is precedence: a package that both depends on and dev-depends on
 * another workspace reports the runtime edge, which is what a reader needs. */
const DEPENDENCY_KINDS: ReadonlyArray<
  readonly [WorkspaceDependent["kind"], keyof WorkspaceManifest]
> = [
  ["dependency", "dependencies"],
  ["optional", "optionalDependencies"],
  ["peer", "peerDependencies"],
  ["dev", "devDependencies"],
];

async function workspaceManifests(): Promise<WorkspaceManifest[]> {
  const root = JSON.parse(await readFile(join(repositoryRoot, "package.json"), "utf8")) as {
    workspaces?: string[];
  };
  const directories: string[] = [];
  for (const workspace of root.workspaces ?? []) {
    if (!workspace.endsWith("/*")) {
      directories.push(join(repositoryRoot, workspace));
      continue;
    }
    const parent = join(repositoryRoot, workspace.slice(0, -2));
    if (!(await exists(parent))) continue;
    for (const entry of await readdir(parent, { withFileTypes: true })) {
      if (entry.isDirectory()) directories.push(join(parent, entry.name));
    }
  }
  const manifests: WorkspaceManifest[] = [];
  for (const directory of directories) {
    const path = join(directory, "package.json");
    if (!(await exists(path))) continue;
    manifests.push(JSON.parse(await readFile(path, "utf8")) as WorkspaceManifest);
  }
  return manifests;
}

/**
 * Reverse indexes behind "Referenced by", built once per generation: the workspace
 * packages that depend on each package, and the documented exports whose declaration
 * names a symbol. Both come from repository manifests, so the section never claims a
 * consumer the repository cannot show.
 */
export interface ConsumerIndex {
  readonly dependents: ReadonlyMap<string, readonly WorkspaceDependent[]>;
  readonly references: ReadonlyMap<string, readonly SymbolReference[]>;
}

const EMPTY_CONSUMER_INDEX: ConsumerIndex = { dependents: new Map(), references: new Map() };

async function consumerIndex(manifest: PublicApiManifest): Promise<ConsumerIndex> {
  const dependents = new Map<string, WorkspaceDependent[]>();
  for (const workspace of await workspaceManifests()) {
    if (workspace.name === undefined) continue;
    const declared = new Map<string, WorkspaceDependent["kind"]>();
    for (const [kind, field] of DEPENDENCY_KINDS) {
      for (const dependency of Object.keys(workspace[field] ?? {})) {
        if (!declared.has(dependency)) declared.set(dependency, kind);
      }
    }
    for (const [dependency, kind] of declared) {
      if (dependency === workspace.name) continue;
      dependents.set(dependency, [
        ...(dependents.get(dependency) ?? []),
        { name: workspace.name, kind },
      ]);
    }
  }
  for (const list of dependents.values()) {
    list.sort((left, right) => left.name.localeCompare(right.name));
  }

  const references = new Map<string, SymbolReference[]>();
  for (const pkg of manifest.packages) {
    for (const entry of pkg.entryPoints) {
      for (const item of entry.exports) {
        const named = new Set<string>();
        for (const match of item.signature.matchAll(/[A-Za-z_$][A-Za-z0-9_$]*/g)) {
          const name = match[0] ?? "";
          if (name === item.name || named.has(name)) continue;
          named.add(name);
          references.set(name, [
            ...(references.get(name) ?? []),
            { packageName: pkg.name, name: item.name, route: symbolRoute(pkg, entry, item) },
          ]);
        }
      }
    }
  }
  return { dependents, references };
}

function renderReferencedBy(pkg: ApiPackage, item: ApiExport, consumers: ConsumerIndex): string {
  const dependents = consumers.dependents.get(pkg.name) ?? [];
  const references = (consumers.references.get(item.name) ?? []).filter(
    (reference) => !(reference.packageName === pkg.name && reference.name === item.name),
  );
  const body = [
    "## Referenced by",
    "",
    '<div class="api-consumers" data-pagefind-ignore>',
    `<p class="api-consumers-label">Workspace packages depending on <code>${html(pkg.name)}</code></p>`,
    "",
    '<ul class="api-consumer-list">',
  ];
  for (const dependent of dependents) {
    body.push(
      `<li><code>${html(dependent.name)}</code><span class="api-consumer-kind">${dependent.kind}</span></li>`,
    );
  }
  if (dependents.length === 0) body.push("<li>None.</li>");
  body.push(
    "</ul>",
    "",
    `<p class="api-consumers-label">Public exports naming <code>${html(item.name)}</code></p>`,
    "",
    '<ul class="api-consumer-list">',
  );
  for (const reference of references.slice(0, REFERENCE_DISPLAY_LIMIT)) {
    body.push(
      `<li><a href="${reference.route}"><code>${html(reference.name)}</code></a><span class="api-consumer-kind">${html(reference.packageName)}</span></li>`,
    );
  }
  if (references.length === 0) body.push("<li>None.</li>");
  if (references.length > REFERENCE_DISPLAY_LIMIT) {
    body.push(
      `<li class="api-consumer-more">and ${references.length - REFERENCE_DISPLAY_LIMIT} more</li>`,
    );
  }
  body.push("</ul>", "</div>", "");
  return body.join("\n");
}

async function renderDeclaration(signature: string, expanded: boolean): Promise<string> {
  // Pretty-printed so long unions wrap per variant instead of scrolling; no
  // fence title - the surrounding "Declaration" heading already names it.
  const formatted = await formatDeclaration(signature);
  if (expanded) {
    return [
      '<div class="api-declaration-open" data-pagefind-ignore>',
      "",
      "```ts generated",
      formatted,
      "```",
      "",
      "</div>",
    ].join("\n");
  }
  return [
    '<details class="api-declaration" data-pagefind-ignore>',
    "<summary>View full TypeScript declaration</summary>",
    "",
    "```ts generated",
    formatted,
    "```",
    "",
    "</details>",
  ].join("\n");
}

/**
 * Member rows plus an anchor index for long lists. Members start collapsed;
 * explicit fragment navigation reveals its target through the docs shell.
 */
function renderMembers(
  pkg: ApiPackage,
  entry: ApiEntryPoint,
  item: ApiExport,
  members: readonly DeclarationMember[],
  routes: DocumentationLinkRoutes,
  aliases: ReadonlyMap<string, UnionAlias>,
): { index: string; list: string } {
  const searchTargets = new Set<string>(
    REQUIRED_SEARCH_TARGETS.filter(
      (target) =>
        target.packageName === pkg.name &&
        target.subpath === entry.subpath &&
        target.owner === item.name,
    ).map(({ term }) => term),
  );
  const memberDocs = new Map(item.memberDocs.map((member) => [member.name, member.documentation]));
  const documented = new Set<string>();
  const indexLinks: string[] = [];
  const indexed = new Set<string>();
  const rows = members.map((member, index) => {
    const id = `${anchor(item.name)}-${anchor(member.name) || index + 1}`;
    if (!indexed.has(id)) {
      indexed.add(id);
      indexLinks.push(`<a href="#${id}"><code>${html(member.name)}</code></a>`);
    }
    const searchAnchor = searchTargets.has(member.name)
      ? `<h3 id="${member.name.toLowerCase()}" class="api-search-anchor">${html(member.name)}</h3>`
      : "";
    // Overload rows repeat a member name; the merged documentation renders once,
    // on the first row.
    const documentation = documented.has(member.name) ? undefined : memberDocs.get(member.name);
    if (documentation !== undefined) documented.add(member.name);
    const summary =
      documentation === undefined ? "" : compactSummary(documentation.split(/\n@/)[0] ?? "");
    const summaryDoc =
      documentation === undefined
        ? ""
        : ` <span class="api-member-summary">${memberDocumentationHtml(pkg, entry, item, summary, routes)}</span>`;
    const parts = memberTypeParts(member.signature);
    const variants = parts === undefined ? undefined : stringLiteralUnionVariants(parts.type);
    const alias = variants === undefined ? undefined : aliases.get(literalUnionKey(variants));
    // The alias names the type; its expansion stays in the Declaration section.
    const signature =
      alias === undefined || parts === undefined
        ? member.signature
        : `${parts.prefix} ${alias.name}${parts.terminated ? ";" : ""}`;
    const aliasChip =
      alias === undefined
        ? ""
        : ` <span class="api-member-alias"><a href="${alias.route}"><code>${html(alias.name)}</code></a></span>`;
    return [
      searchAnchor,
      `<details class="api-member" id="${id}" data-pagefind-weight="${searchTargets.has(member.name) ? "10" : "1"}">`,
      `<summary><code>${html(member.name)}</code>${aliasChip}${summaryDoc}</summary>`,
      "",
      // A fenced block so member signatures get real syntax highlighting.
      "```ts generated",
      signature,
      "```",
      "",
      // Skip the body paragraph when it would only restate the summary line.
      ...(documentation === undefined ||
      documentation.replace(/`/g, "").replace(/\s+/g, " ").trim() === summary
        ? []
        : [
            /(?:^|\n)@(example|see)\b/.test(documentation)
              ? `${documentationMarkdown(pkg, entry, item, routes, documentation)}\n`
              : `<p class="api-member-doc">${memberDocumentationHtml(pkg, entry, item, documentation, routes)}</p>`,
          ]),
      "</details>",
    ].join("\n");
  });
  return {
    index:
      members.length <= MEMBER_INDEX_MINIMUM
        ? ""
        : [
            '<nav class="api-member-index" aria-label="Member index" data-pagefind-ignore>',
            ...indexLinks,
            "</nav>",
          ].join("\n"),
    list: [
      `## Members <span class="api-count" data-pagefind-ignore>${members.length}</span>`,
      "",
      '<div class="api-member-list">',
      ...rows,
      "</div>",
    ].join("\n"),
  };
}

function symbolRoute(pkg: ApiPackage, entry: ApiEntryPoint, item: ApiExport): string {
  return `/docs/api/${entrySlug(pkg.name, entry.subpath)}/${anchor(item.name)}/`;
}

export async function renderSymbolPage(
  pkg: ApiPackage,
  entry: ApiEntryPoint,
  item: ApiExport,
  routes: DocumentationLinkRoutes = new Map(),
  consumers: ConsumerIndex = EMPTY_CONSUMER_INDEX,
): Promise<string> {
  const label = entryLabel(pkg, entry);
  const source = packageSourcePath(pkg.name, item.source);
  const summary = documentationMarkdown(pkg, entry, item, routes, item.documentation, 2);
  const declaration = parseableDeclaration(item);
  await prepareDeclarationShapes([declaration]);
  const shape = declarationShape(declaration);
  const description = symbolDescription(item.name, item.kind, label, compactSummary(summary));
  const aliases = await unionAliasIndex(pkg, entry, routes);
  const body = [
    frontmatter(`${item.name} | ${label}`, description).trimEnd(),
    `<!-- api-export:${pkg.name}|${entry.subpath}|${item.name} -->`,
    `<div class="api-pagehead"><a class="api-backlink" href="/docs/api/${entrySlug(pkg.name, entry.subpath)}/">${html(label)}</a><span class="api-status" data-kind="${item.kind}">${item.kind}</span></div>`,
    "",
    summary,
    "",
    '<dl class="api-metadata" data-pagefind-ignore>',
    `<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/${html(source)}"><code>${html(source)}</code></a></dd></div>`,
    "</dl>",
    "",
  ];
  if (shape.members.length > 0) {
    const members = renderMembers(pkg, entry, item, shape.members, routes, aliases);
    if (members.index.length > 0) body.push(members.index, "");
    body.push(members.list, "");
  }

  // A variants section earns its space only for structured unions; scalar
  // unions read best inline in the (expanded) declaration, where identifiers
  // are highlighted, hoverable, and linked.
  const structuredVariants = shape.variants.some((variant) => variant.includes("{"))
    ? shape.variants
    : [];
  if (structuredVariants.length > 0) {
    body.push(
      `## Variants <span class="api-count" data-pagefind-ignore>${structuredVariants.length}</span>`,
      "",
      '<div class="api-variant-list" data-pagefind-ignore>',
    );
    for (const variant of structuredVariants) {
      const formatted = await formatTypeExpression(variant);
      body.push('<div class="api-variant">', "", "```ts generated", formatted, "```", "", "</div>");
    }
    body.push("</div>", "");
  }

  // One consistent model: the code section is always "Declaration", always
  // pretty-printed. It collapses only when Members/Variants already tell the
  // story above it; otherwise it is the page's primary content and expands.
  body.push(
    "## Declaration",
    "",
    await renderDeclaration(
      // `declare` is parser scaffolding, not information a reader needs.
      shape.formatted.replace(/^declare /, ""),
      shape.members.length === 0 && structuredVariants.length === 0,
    ),
    "",
    renderReferencedBy(pkg, item, consumers),
  );
  return `${body.join("\n").trimEnd()}\n`;
}

export function renderEntryPage(
  pkg: ApiPackage,
  entry: ApiEntryPoint,
  routes: DocumentationLinkRoutes = new Map(),
): string {
  const label = entryLabel(pkg, entry);
  const status =
    entry.classification === "supported"
      ? "Supported public entry point"
      : entry.classification === "internal"
        ? "Internal/transitive entry point; application code normally does not import it directly"
        : entry.classification === "test-only"
          ? "Testing-only public entry point"
          : "CSS or binary asset entry point";
  const body = [
    frontmatter(label, `API reference for ${label}.`).trimEnd(),
    `<span class="api-status" data-status="${entry.classification}">${entry.classification}</span>`,
    "",
    `**${status}.** Import this entry point as \`${label}\`.`,
    "",
    '<dl class="api-metadata" data-pagefind-ignore>',
    `<div><dt>Declaration target</dt><dd><code>${html(entry.target)}</code></dd></div>`,
    `<div><dt>Exports</dt><dd>${entry.exports.length}</dd></div>`,
    "</dl>",
    "",
  ];
  if (entry.source !== undefined) {
    body.push(`Source entry: \`${packageSourcePath(pkg.name, entry.source)}\``, "");
  }
  if (entry.kind === "asset") {
    body.push(
      "This package export is an asset rather than a TypeScript module. It is tracked here so package drift cannot bypass documentation review.",
      "",
    );
  } else if (entry.exports.length === 0) {
    body.push("This TypeScript entry point intentionally exports no named symbols.", "");
  } else {
    const groups = Map.groupBy(entry.exports, (item) => item.kind);
    body.push("## Exported symbols", "");
    for (const [kind, items] of [...groups].sort(([left], [right]) => left.localeCompare(right))) {
      body.push(
        `### ${KIND_LABELS[kind] ?? `${kind}s`} <span class="api-count" data-pagefind-ignore>${items.length}</span>`,
        "",
        '<div class="api-symbol-grid">',
        ...items.map((item) => {
          const summary = compactSummary(documentationMarkdown(pkg, entry, item, routes));
          return [
            `<a class="api-symbol-card" href="${symbolRoute(pkg, entry, item)}">`,
            `<span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="${item.kind}" aria-hidden="true">${item.kind.charAt(0).toUpperCase()}</span><code>${html(item.name)}</code></span>`,
            `<span class="api-symbol-card__desc">${html(summary)}</span>`,
            "</a>",
          ].join("");
        }),
        "</div>",
        "",
      );
    }
  }
  return `${body.join("\n").trimEnd()}\n`;
}

function renderApiIndex(manifest: PublicApiManifest): string {
  const lines = [
    frontmatter(
      "API reference",
      "Generated reference for every classified Sheetwrite package entry point.",
    ).trimEnd(),
    "The package `exports` maps define this inventory. Supported, internal, asset, and testing-only entry points are classified explicitly; generated pages use declaration signatures and source JSDoc.",
    "",
  ];
  for (const pkg of manifest.packages) {
    lines.push(
      `## ${pkg.name}`,
      "",
      '<table class="api-entry-table">',
      "<thead><tr><th>Entry point</th><th>Classification</th><th>Symbols</th></tr></thead>",
      "<tbody>",
      ...pkg.entryPoints.map(
        (entry) =>
          `<tr><td><a href="/docs/api/${entrySlug(pkg.name, entry.subpath)}/"><code>${html(entryLabel(pkg, entry))}</code></a></td><td><span class="api-status" data-status="${entry.classification}">${entry.classification}</span></td><td>${entry.exports.length}</td></tr>`,
      ),
      "</tbody>",
      "</table>",
      "",
    );
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

function renderEntryPointInventory(manifest: PublicApiManifest): string {
  const lines = [
    frontmatter(
      "Package entry-point inventory",
      "Compiler-backed classification of every publishable Sheetwrite package export.",
    ).trimEnd(),
    "> Generated from package `exports` maps by `bun run docs:generate`.",
    "",
    "| Package entry point | Target | Classification | API page |",
    "| --- | --- | --- | --- |",
  ];
  for (const pkg of manifest.packages) {
    for (const entry of pkg.entryPoints) {
      lines.push(
        `| \`${entryLabel(pkg, entry)}\` | \`${entry.target}\` | ${entry.classification} | [Reference](/docs/api/${entrySlug(pkg.name, entry.subpath)}/) |`,
      );
    }
  }
  return `${lines.join("\n")}\n`;
}

function renderMovedGuides(): string {
  const lines = [
    frontmatter(
      "Moved pages",
      "Where each moved documentation page and each former repository guide lives now.",
    ).trimEnd(),
    "Old addresses keep working: each one opens its new page. A link to a heading of an old page opens the page that holds that heading now.",
    "",
    "## Moved documentation pages",
    "",
    "| Old address | New address |",
    "| --- | --- |",
    ...Object.entries(MOVED_PAGES).map(
      ([oldRoute, page]) => `| \`${oldRoute}\` | [${page.to}](${page.to}) |`,
    ),
    "",
    "## Former repository guides",
    "",
    "Each guide that was a file in the repository has a page in the docs site.",
    "",
    '<div class="sw-next-links sw-moved-guides">',
  ];
  const guides = new Map<string, string[]>();
  for (const [oldPath, route] of Object.entries(MIGRATION_ROUTES)) {
    guides.set(route, [...(guides.get(route) ?? []), oldPath]);
  }
  for (const [route, oldPaths] of guides) {
    const title = readableId(route.split("/").filter(Boolean).at(-1) ?? route);
    lines.push(
      `<a href="${html(route)}"><strong>${html(title)}</strong>${oldPaths.map((path) => `<code>${html(path)}</code>`).join("")}</a>`,
    );
  }
  lines.push("</div>");
  return `${lines.join("\n")}\n`;
}

/**
 * Every moved page must forward to a page and heading that exist, and must not
 * also keep its own content (the old address would then never forward).
 */
export function movedPageIssues(
  movedPages: Readonly<Record<string, MovedPage>>,
  documents: readonly MarkdownDocument[],
  movedHeadings: Readonly<Record<string, Readonly<Record<string, string>>>> = {},
): string[] {
  const failures: string[] = [];
  const anchorsOf = (route: string): Set<string> | undefined => {
    const path = contentPathForRoute(route, documents);
    const document = documents.find((item) => item.path === path);
    return document === undefined ? undefined : headingAnchors(document.content);
  };
  const resolves = (link: string): boolean => {
    const [route = "", fragment] = link.split("#", 2);
    const anchors = anchorsOf(route);
    if (anchors === undefined) return false;
    return fragment === undefined || anchors.has(fragment);
  };
  for (const [oldRoute, page] of Object.entries(movedPages)) {
    if (contentPathForRoute(oldRoute, documents) !== undefined) {
      failures.push(`moved page still has content: ${oldRoute}`);
    }
    if (!resolves(page.to))
      failures.push(`moved page ${oldRoute} forwards to a missing page: ${page.to}`);
    for (const [anchor, target] of Object.entries(page.anchors)) {
      if (!resolves(target)) {
        failures.push(`moved page ${oldRoute}#${anchor} forwards to a missing target: ${target}`);
      }
    }
  }
  // A heading that left a page which kept its address: the heading must be
  // gone from that page, or forwarding would take readers away from it.
  for (const [route, headings] of Object.entries(movedHeadings)) {
    const kept = anchorsOf(route);
    if (kept === undefined) {
      failures.push(`moved headings name a missing page: ${route}`);
      continue;
    }
    for (const [anchor, target] of Object.entries(headings)) {
      if (kept.has(anchor)) failures.push(`moved heading is still on its page: ${route}#${anchor}`);
      if (!resolves(target)) {
        failures.push(`moved heading ${route}#${anchor} forwards to a missing target: ${target}`);
      }
    }
  }
  return failures;
}

interface SiteLink {
  readonly source: string;
  readonly link: string;
}

/**
 * Docs links that the Markdown check does not see must also resolve: they name
 * a page that exists (not an old moved address) and, with a fragment, a
 * heading on that page.
 */
export function unresolvedSiteLinks(
  links: readonly SiteLink[],
  documents: readonly MarkdownDocument[],
  movedPages: Readonly<Record<string, MovedPage>> = MOVED_PAGES,
): string[] {
  const failures: string[] = [];
  for (const { source, link } of links) {
    const [route = "", fragment] = link.split("#", 2);
    if (route === "/docs/") continue;
    if (movedPages[route] !== undefined) {
      failures.push(`${source} links moved page ${link}; link ${movedPages[route]?.to} instead`);
      continue;
    }
    const path = contentPathForRoute(route, documents);
    if (path === undefined) {
      failures.push(`${source} links missing page ${link}`);
      continue;
    }
    const document = documents.find((item) => item.path === path);
    if (fragment !== undefined && fragment.length > 0 && document !== undefined) {
      if (!headingAnchors(document.content).has(fragment)) {
        failures.push(`${source} links missing anchor ${link}`);
      }
    }
  }
  return failures;
}

async function routeComponentFiles(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await routeComponentFiles(path)));
    else if (/\.tsx?$/.test(entry.name)) files.push(path);
  }
  return files;
}

/** README files, the sidebar, and site components all link docs pages. */
async function siteLinkIssues(documents: readonly MarkdownDocument[]): Promise<string[]> {
  const links: SiteLink[] = [];
  for (const readme of await readReadmes()) {
    const source = posix(relative(repositoryRoot, readme.path));
    for (const match of readme.content.matchAll(
      /https:\/\/sheetwrite\.vercel\.app(\/docs\/[^\s)"'<>`]*)/g,
    )) {
      links.push({ source, link: match[1] ?? "" });
    }
  }
  for (const page of navigationPages(DOCS_NAVIGATION.flatMap((section) => section.items))) {
    if (page.href.startsWith("/docs/")) {
      links.push({ source: "docs/src/lib/navigation.ts", link: page.href });
    }
  }
  for (const path of await routeComponentFiles(join(repositoryRoot, "docs/src"))) {
    const source = posix(relative(repositoryRoot, path));
    // The moved-page map names old addresses on purpose.
    if (source === "docs/src/lib/moved-pages.ts") continue;
    const content = await readFile(path, "utf8");
    for (const match of content.matchAll(/_splat: "([^"]+)"/g)) {
      links.push({ source, link: `/docs/${match[1]}/` });
    }
    // Any whole string literal that names a docs page: href, to, guideHref, and data tables.
    for (const match of content.matchAll(/["'`](\/docs\/[a-z0-9/#.-]+)["'`]/g)) {
      links.push({ source, link: match[1] ?? "" });
    }
  }
  return unresolvedSiteLinks(links, documents);
}

interface EvidenceState {
  available: false;
  reason: string;
  source: string;
  reproduction: string;
}

interface RenderEvidenceResult {
  engine: string;
  scenarioId: string;
  round: number;
  rows: number;
  status: string;
  medianMs: number;
  p95Ms: number;
  madMs: number;
  memory: { beforeBytes: number; afterBytes: number; deltaBytes: number };
  validation: Array<{ passed: boolean }>;
  /** Recorded only on failures: where the scenario stopped and what it reported. */
  stage?: string;
  errorClass?: string;
  message?: string;
}

interface ValidatedRenderEvidence {
  protocolVersion: number;
  metadata: {
    commit: string;
    dirty: boolean;
    timestamp: string;
    bunVersion: string;
    nodeVersion: string;
    browserVersion: string;
    os: string;
    arch: string;
    cpu: string;
    engineVersions: Readonly<Record<"sheetwrite" | "handsontable", string>>;
    rounds: number;
    launchAttempts: Array<{ success: boolean }>;
  };
  config: { engines: string[]; rows: number[]; scenarios: string[] };
  results: RenderEvidenceResult[];
  completeness?: { failedKeys: string[]; missingKeys: string[]; complete: boolean };
}

interface CaptureMeta {
  commit: string;
  dirty: boolean;
  timestamp: string;
}

function captureMetaOf(value: Record<string, unknown>): CaptureMeta | undefined {
  const raw = value.metadata ?? value.meta;
  if (raw === null || typeof raw !== "object") return undefined;
  const meta = raw as Record<string, unknown>;
  if (
    typeof meta.commit !== "string" ||
    meta.dirty !== false ||
    typeof meta.timestamp !== "string" ||
    !Number.isFinite(Date.parse(meta.timestamp))
  ) {
    return undefined;
  }
  return { commit: meta.commit, dirty: meta.dirty, timestamp: meta.timestamp };
}

/**
 * Landing-page benchmark summary. Each engine is aggregated across rounds
 * like the evidence page, then ratios pair per scenario - never a
 * ratio of cross-scenario medians. Real numbers only: when the artifact is
 * missing or invalid the landing renders a "run the protocol" placeholder.
 */
async function renderLandingBench(): Promise<string> {
  const sizeReport = JSON.parse(
    await readFile(join(repositoryRoot, "scripts/size-report.json"), "utf8"),
  ) as Pick<SizeReport, "metrics">;
  const fullEngine = await loadEvidence(
    "bench/results/full-engine-results.json",
    "bun run --filter @sheetwrite/bench bench:formula:engines",
    validateFullEngineArtifact,
  );
  return landingBenchPayload(
    await loadEvidence(
      "bench/results/render-scale.json",
      "bun run --filter @sheetwrite/bench bench:render:scale",
      validateRenderArtifact,
    ),
    "evidence" in fullEngine
      ? landingDownloads(sizeReport.metrics, fullEngine.evidence.engines)
      : undefined,
  );
}

/** Download sizes on the landing page, Brotli-compressed as browsers fetch them. */
export interface LandingDownloads {
  /** JavaScript, WASM and CSS of `@sheetwrite/core` in a Vite production build. */
  coreFirstLoadBrotliBytes: number;
  defaultEngineBrotliBytes: number;
  fullEngineBrotliBytes: number;
}

const CORE_FIRST_LOAD_METRICS = ["javascript", "wasm", "css"].map(
  (kind) => `bundler.vite.coreInitial.${kind}.brotliBytes`,
);

/** A size the landing can show: present and a finite number of bytes. */
function isKnownBytes(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value);
}

/**
 * Reads the landing download sizes from the size report and the engine
 * artifact. Any missing or non-finite part yields `undefined`: a partial sum
 * would understate the download.
 */
export function landingDownloads(
  metrics: Readonly<Record<string, Pick<Metric, "actual">>>,
  engines: ReadonlyArray<{ engine: string; wasm: { brotliBytes: number } }>,
): LandingDownloads | undefined {
  const firstLoad = CORE_FIRST_LOAD_METRICS.map((key) => metrics[key]?.actual);
  const defaultEngine = engines.find((entry) => entry.engine === "default")?.wasm.brotliBytes;
  const fullEngine = engines.find((entry) => entry.engine === "full")?.wasm.brotliBytes;

  if (!firstLoad.every(isKnownBytes) || !isKnownBytes(defaultEngine) || !isKnownBytes(fullEngine)) {
    return undefined;
  }

  return {
    coreFirstLoadBrotliBytes: firstLoad.reduce((sum, bytes) => sum + bytes, 0),
    defaultEngineBrotliBytes: defaultEngine,
    fullEngineBrotliBytes: fullEngine,
  };
}

/** Pure payload builder, exported so the finite/fallback contract is testable. */
export function landingBenchPayload(
  scale: { evidence: ValidatedRenderEvidence; source: string } | EvidenceState,
  downloads?: LandingDownloads,
): string {
  const round1 = (value: number): number => Math.round(value * 10) / 10;
  // Download sizes do not depend on the benchmark, so both payloads carry them.
  const downloadsField = downloads ? { downloads } : {};
  const unavailable = (reason: string): string =>
    `${JSON.stringify({ available: false, reason, ...downloadsField }, null, 2)}\n`;
  if (!("evidence" in scale)) return unavailable(scale.reason);
  const { evidence } = scale;
  const mid = (values: number[]): number => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)] ?? Number.NaN;
  };
  const successes = (size: number, engine: string, scenario: string): RenderEvidenceResult[] =>
    evidence.results.filter(
      (result) =>
        result.rows === size &&
        result.engine === engine &&
        result.scenarioId === scenario &&
        result.status === "success",
    );

  // Sizes with zero full-round pairs are omitted rather than emitted as NaN
  // (JSON.stringify silently turns NaN into null and the landing would render
  // it as a number).
  const sizes = evidence.config.rows.flatMap((size) => {
    const ratios: Array<{ scenario: string; ratio: number }> = [];
    let handsontableIncomplete = 0;
    for (const scenario of evidence.config.scenarios) {
      const ours = successes(size, "sheetwrite", scenario);
      const theirs = successes(size, "handsontable", scenario);
      // Round-aware: a bucket with fewer successes than the declared round
      // count is incomplete, and only full-round pairs enter the ratios.
      if (theirs.length < evidence.metadata.rounds) handsontableIncomplete += 1;
      if (ours.length < evidence.metadata.rounds || theirs.length < evidence.metadata.rounds)
        continue;
      ratios.push({
        scenario,
        ratio: mid(theirs.map((r) => r.medianMs)) / mid(ours.map((r) => r.medianMs)),
      });
    }
    if (ratios.length === 0) return [];
    const best = ratios.reduce((a, b) => (b.ratio > a.ratio ? b : a));
    return [
      {
        size,
        comparedScenarios: ratios.length,
        medianRatio: round1(mid(ratios.map((r) => r.ratio))),
        bestRatio: round1(best.ratio),
        bestScenario: best.scenario,
        handsontableIncomplete,
      },
    ];
  });
  const scenarioMedians: number[] = [];
  const scenarioHeaps: number[] = [];
  for (const scenario of evidence.config.scenarios) {
    const bucket = successes(1_000_000, "sheetwrite", scenario);
    // Hero stats hold the same full-round bar as the ratio pairs.
    if (bucket.length < evidence.metadata.rounds) continue;
    scenarioMedians.push(mid(bucket.map((r) => r.medianMs)));
    scenarioHeaps.push(mid(bucket.map((r) => r.memory.afterBytes)));
  }
  const heroStats = {
    millionRowScenarios: scenarioMedians.length,
    millionRowMedianMs: round1(mid(scenarioMedians)),
    millionRowHeapMb: Math.round(mid(scenarioHeaps) / 1_000_000),
  };
  const displayed = [
    ...sizes.flatMap((entry) => [entry.medianRatio, entry.bestRatio]),
    heroStats.millionRowMedianMs,
    heroStats.millionRowHeapMb,
  ];

  // Never publish a payload whose displayed values are not all finite: a
  // structurally valid artifact with no comparable pairs must fall back to
  // the "run the protocol" placeholder, not render null.
  if (sizes.length === 0 || displayed.some((value) => !Number.isFinite(value))) {
    return unavailable("artifact has no full-round engine pairs to compare");
  }
  const payload = {
    available: true,
    capture: {
      commit: evidence.metadata.commit,
      timestamp: evidence.metadata.timestamp,
      browser: `Chromium ${evidence.metadata.browserVersion}`,
      rounds: evidence.metadata.rounds,
      engineVersions: evidence.metadata.engineVersions,
    },
    heroStats,
    sizes,
    ...downloadsField,
  };
  return `${JSON.stringify(payload, null, 2)}\n`;
}

async function loadEvidence<T>(
  relPath: string,
  reproduction: string,
  validate: (value: Record<string, unknown>) => T | string,
): Promise<{ evidence: T; source: string } | EvidenceState> {
  const path = join(repositoryRoot, relPath);
  const source = posix(relative(repositoryRoot, path));
  if (!(await exists(path)))
    return { available: false, reason: "artifact is missing", source, reproduction };
  try {
    const value = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
    if (captureMetaOf(value) === undefined) {
      return {
        available: false,
        reason:
          "artifact has no clean-tree protocol stamp (commit, timestamp, dirty=false), so freshness cannot be established",
        source,
        reproduction,
      };
    }
    const evidence = validate(value);
    if (typeof evidence === "string") {
      return { available: false, reason: evidence, source, reproduction };
    }
    return { evidence, source };
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    return {
      available: false,
      reason: `artifact could not be validated: ${error.message}`,
      source,
      reproduction,
    };
  }
}

function validateRenderArtifact(value: Record<string, unknown>): ValidatedRenderEvidence | string {
  const artifact = value as unknown as Partial<ValidatedRenderEvidence>;
  const metadata = artifact.metadata;
  const config = artifact.config;
  const results = artifact.results;
  if (
    artifact.protocolVersion !== 1 ||
    metadata === undefined ||
    !Number.isInteger(metadata.rounds) ||
    metadata.rounds < 1 ||
    !Array.isArray(metadata.launchAttempts) ||
    !metadata.launchAttempts.every((attempt) => attempt.success === true) ||
    config === undefined ||
    !Array.isArray(config.engines) ||
    !Array.isArray(config.rows) ||
    !Array.isArray(config.scenarios) ||
    !Array.isArray(results)
  ) {
    return "artifact does not match controlled render protocol version 1";
  }
  validateEngineVersions(metadata.engineVersions, ["sheetwrite", "handsontable"]);

  // Failed cells are allowed - the page reports them as crashes.
  // Failed cells legitimately carry null samples; only successes must be finite.
  const valid = results.every(
    (result) =>
      result.status !== "success" ||
      (Number.isFinite(result.medianMs) &&
        Number.isFinite(result.p95Ms) &&
        Number.isFinite(result.memory?.afterBytes) &&
        Array.isArray(result.validation)),
  );
  if (!valid) return "controlled render results carry non-finite samples";
  return artifact as ValidatedRenderEvidence;
}

interface CorePathsEvidence {
  schemaVersion: number;
  protocol: string;
  mode: string;
  metadata: CaptureMeta;
  toolchain: { bun: string; nodeCompat: string; cpu: string };
  methodology: { timing: string; scope: string };
  scale: Record<string, number>;
  scenarios: Array<{
    id: string;
    unit: string;
    samplesMs: number[];
    timing: { median: number; p95: number; iters: number };
    counters: Record<string, number>;
    observations?: Record<string, string>;
    variants?: Array<{
      id: string;
      samplesMs: number[];
      timing: { median: number; p95: number; iters: number };
    }>;
    validation: string;
  }>;
}

/**
 * Full-mode core-path capture. The artifact is written by `bench:core-paths`;
 * each reported scenario needs finite timings and a written validation
 * checkpoint to be publishable.
 */
function validateCorePathsArtifact(value: Record<string, unknown>): CorePathsEvidence | string {
  const artifact = value as unknown as Partial<CorePathsEvidence>;
  if (
    artifact.schemaVersion !== 1 ||
    artifact.protocol !== "sheetwrite-core-paths-v1" ||
    artifact.mode !== "full"
  ) {
    return "artifact is not a full-mode core-path capture";
  }
  if (!Array.isArray(artifact.scenarios) || artifact.scenarios.length === 0) {
    return "artifact carries no core-path scenarios";
  }
  for (const scenario of artifact.scenarios) {
    const timings = [scenario.timing, ...(scenario.variants ?? []).map((entry) => entry.timing)];
    if (
      typeof scenario.unit !== "string" ||
      scenario.unit.length === 0 ||
      typeof scenario.validation !== "string" ||
      scenario.validation.length === 0 ||
      timings.some(
        (timing) =>
          !Number.isFinite(timing?.median) ||
          !Number.isFinite(timing?.p95) ||
          !Number.isInteger(timing?.iters) ||
          timing.iters < 1,
      )
    ) {
      return "core-path scenarios carry an unvalidated or non-finite timing";
    }
  }
  return artifact as CorePathsEvidence;
}

interface XlsxEvidence {
  protocol: string;
  mode: string;
  metadata: CaptureMeta & {
    engineVersions: Readonly<Record<"sheetwrite" | "exceljs", string>>;
  };
  rounds: number;
  maxBaselineRatio: number;
  fixture: { path: string; bytes: number; sha256: string; producer: string };
  toolchain: { bun: string; node: string; cpu: string; baselineCommit?: string };
  summaries: Array<{
    engine: string;
    operation: string;
    scenario: string;
    durationMs: { median: number; p95: number; iters: number };
    maxRssBytes: { median: number; p95: number; max: number };
  }>;
  comparisons: Array<{
    operation: string;
    scenario: string;
    medianWallRatio: number;
    peakRssRatio: number;
  }>;
}

function validateXlsxArtifact(value: Record<string, unknown>): XlsxEvidence | string {
  const artifact = value as unknown as Partial<XlsxEvidence>;
  if (artifact.protocol !== "sheetwrite-xlsx-codec-v1" || artifact.mode !== "full") {
    return "artifact is not a full-mode XLSX codec capture";
  }
  validateEngineVersions(artifact.metadata?.engineVersions, ["sheetwrite", "exceljs"]);
  if (!/^[0-9a-f]{40}$/u.test(artifact.toolchain?.baselineCommit ?? "")) {
    return "XLSX comparison is missing its measured baseline commit";
  }
  const rounds = artifact.rounds;
  if (
    typeof rounds !== "number" ||
    !Number.isInteger(rounds) ||
    rounds < 1 ||
    !Array.isArray(artifact.summaries) ||
    artifact.summaries.length === 0 ||
    !Array.isArray(artifact.comparisons)
  ) {
    return "XLSX capture is missing its rounds, summaries, or comparisons";
  }
  if (
    artifact.summaries.some(
      (summary) =>
        !Number.isFinite(summary?.durationMs?.median) ||
        !Number.isFinite(summary?.durationMs?.p95) ||
        !Number.isFinite(summary?.maxRssBytes?.max),
    )
  ) {
    return "XLSX summaries carry non-finite samples";
  }
  return artifact as XlsxEvidence;
}

interface DataEvidence {
  protocolVersion: number;
  mode: string;
  meta: CaptureMeta & {
    bun: string;
    engineVersions: Readonly<Record<"sheetwrite" | "handsontable", string>>;
  };
  sheetwrite: Record<
    string,
    { rows: number; stats: Record<string, { median: number; p95: number }> }
  >;
  handsontable: Record<
    string,
    { rows: number; stats: Record<string, { median: number; p95: number }> }
  >;
}

function validateDataArtifact(value: Record<string, unknown>): DataEvidence | string {
  const artifact = value as unknown as Partial<DataEvidence>;
  if (artifact.protocolVersion !== 1 || artifact.mode !== "full") {
    return "artifact is not a full-mode data protocol capture";
  }
  validateEngineVersions(artifact.meta?.engineVersions, ["sheetwrite", "handsontable"]);
  for (const engine of ["sheetwrite", "handsontable"] as const) {
    const block = artifact[engine];
    if (block === undefined || typeof block !== "object") return `artifact lacks ${engine} results`;
    for (const entry of Object.values(block)) {
      for (const stat of Object.values(entry.stats)) {
        if (!Number.isFinite(stat.median) || !Number.isFinite(stat.p95)) {
          return "data medians carry non-finite samples";
        }
      }
    }
  }
  return artifact as DataEvidence;
}

interface FormulaEvidence {
  protocolVersion: number;
  mode: string;
  meta: CaptureMeta;
  workloads: Array<{ id: string; size: number; stat: { median: number; p95: number } }>;
  memory: Array<{ formulas: number; wasmDeltaBytes: number }>;
}

function validateFormulaArtifact(value: Record<string, unknown>): FormulaEvidence | string {
  const artifact = value as unknown as Partial<FormulaEvidence>;
  if (artifact.protocolVersion !== 1 || artifact.mode !== "full") {
    return "artifact is not a full-mode formula protocol capture";
  }
  if (!Array.isArray(artifact.workloads) || artifact.workloads.length === 0) {
    return "artifact carries no formula workloads";
  }
  if (
    !artifact.workloads.every(
      (workload) => Number.isFinite(workload.stat?.median) && Number.isFinite(workload.stat?.p95),
    )
  ) {
    return "formula workloads carry non-finite samples";
  }
  return artifact as FormulaEvidence;
}

const BENCH_SIZES = [1_000, 10_000, 100_000, 1_000_000] as const;
const BENCH_ENGINE_LABELS = { sheetwrite: "Sheetwrite", handsontable: "Handsontable" } as const;
type BenchEngine = keyof typeof BENCH_ENGINE_LABELS;

function fmtRows(rows: number): string {
  return rows >= 1_000_000 ? `${rows / 1_000_000}M` : `${rows / 1_000}k`;
}

interface BenchPairStat {
  main: number;
  faded: number;
}

function benchPairRow(
  label: string,
  ours: BenchPairStat | undefined,
  theirs: BenchPairStat | undefined,
  fmt: (value: number) => string,
  betterChip: [string, string],
  pct: (value: number) => string,
  fadedBar = true,
): string {
  const bar = (engine: BenchEngine, stats: BenchPairStat | undefined): string => {
    if (stats === undefined) {
      return (
        `<div class="bench-bar" data-engine="${engine}" data-crashed="">` +
        `<span class="bench-bar__engine">${BENCH_ENGINE_LABELS[engine]}</span>` +
        `<span class="bench-crash">did not complete</span>` +
        `</div>`
      );
    }
    return (
      `<div class="bench-bar" data-engine="${engine}">` +
      `<span class="bench-bar__engine">${BENCH_ENGINE_LABELS[engine]}</span>` +
      `<span class="bench-bar__track" aria-hidden="true">` +
      // A faded tail only renders when it can extend past the fill (speed
      // p95 >= median); memory deltas sit under the footprint and would hide.
      (fadedBar ? `<i class="bench-bar__spread" style="width:${pct(stats.faded)}"></i>` : "") +
      `<i class="bench-bar__fill" style="width:${pct(stats.main)}"></i></span>` +
      `<span class="bench-bar__value"><b class="bench-num" data-stat="median">${fmt(stats.main)}</b><b class="bench-num" data-stat="p95">${fmt(stats.faded)}</b></span>` +
      `</div>`
    );
  };
  let chip: string;
  let outcome: string;
  if (ours === undefined || theirs === undefined) {
    outcome = ours === undefined ? "crashed" : "solo";
    chip =
      ours === undefined
        ? '<span class="bench-viz__ratio" data-kind="crashed">Sheetwrite did not complete</span>'
        : '<span class="bench-viz__ratio" data-kind="solo">only Sheetwrite completed</span>';
  } else {
    const faster = theirs.main >= ours.main;
    const ratio = formatSpeedup(faster ? theirs.main / ours.main : ours.main / theirs.main);
    outcome = faster ? "faster" : "slower";
    chip = `<span class="bench-viz__ratio"><strong>${ratio}</strong> ${faster ? betterChip[0] : betterChip[1]}</span>`;
  }
  return [
    `<div class="bench-viz__row" data-outcome="${outcome}">`,
    `<div class="bench-viz__head"><span class="bench-viz__label" title="${html(label)}">${html(readableId(label))}</span>${chip}</div>`,
    bar("sheetwrite", ours),
    bar("handsontable", theirs),
    "</div>",
  ].join("\n");
}

function benchPanel(
  size: number,
  metric: "speed" | "memory",
  rows: string[],
  note: string,
  scale: BenchScale,
): string {
  return [
    `<section class="bench-panel bench-ruled" data-size="${size}" data-metric="${metric}" style="--bench-segs:${scale.segments}">`,
    `<div class="bench-viz__scale"><span class="bench-viz__lead">interaction</span><span class="bench-viz__axis-note">${note}</span><span class="bench-viz__legend">${
      metric === "speed"
        ? '<i class="bench-legend-swatch" data-kind="median"></i>median<i class="bench-legend-swatch" data-kind="p95"></i>p95'
        : '<i class="bench-legend-swatch" data-kind="median"></i><span>footprint</span><span class="bench-viz__legend-note">faded = change</span>'
    }</span></div>`,
    scale.ruler,
    ...rows,
    "</section>",
  ].join("\n");
}

function benchMethod(
  summary: string,
  paragraphs: string[],
  entries: Array<[string, string]>,
): string {
  return [
    '<details class="bench-method" data-pagefind-ignore>',
    `<summary>${summary}</summary>`,
    '<div class="bench-method__body">',
    ...paragraphs.map((paragraph) => `<p>${paragraph}</p>`),
    "<dl>",
    ...entries.map(([term, def]) => `<div><dt><code>${term}</code></dt><dd>${def}</dd></div>`),
    "</dl>",
    "</div>",
    "</details>",
  ].join("\n");
}

const RENDER_METHOD = benchMethod(
  "Methodology - what each scenario does",
  [
    "Live grid in controlled headless Chromium. Ten counterbalanced rounds; all fourteen scenarios run warm per mount, and the fixture is rebuilt after any failure so crashes cannot leak state. Every scenario must prove its effect (scroll really moved, editor really opened, rows really changed) or it fails.",
    "Each measured sample repeats one logical action until it covers at least 100 ms of measured time, so timer resolution and scheduler jitter cannot decide a sample. Every raw sample is retained in the artifact.",
    "Bright = median round, faded = p95 round. <strong>Did not complete</strong> = recorded crash, timeout, or failed checkpoint - never a timing. The failure table names the stage and the recorded error behind every missing cell.",
  ],
  [
    [
      "scroll-down.top-left",
      "From the origin, jump-scroll 50 px down: a fresh row band enters the viewport and must paint.",
    ],
    [
      "scroll-down.middle",
      "The same 50 px jump starting from the vertical middle of the scroll range.",
    ],
    [
      "scroll-smooth.same-window",
      "Scroll 1 px without changing the visible row window: pure repaint cost, zero new data.",
    ],
    ["scroll-right.top-left", "Jump-scroll 50 px right: a fresh column band paints."],
    ["edit-open.top-left", "Select a cell near the origin and open its editor."],
    ["edit-open.middle", "Open the editor on the center cell of the workbook."],
    [
      "edit-open.bottom-right",
      "Open the editor on the last row and column - the far end of every index.",
    ],
    ["edit-commit.middle", "Commit a typed value into the center cell and paint the result."],
    ["altering.insert-5-rows-top", "Insert five rows at the top: every following row reindexes."],
    ["altering.remove-5-rows-top", "Remove those five rows again - the inverse reindex."],
    [
      "arrow-down.top-left",
      "Move the selection one cell down with the arrow key, including the selection overlay repaint.",
    ],
    ["arrow-right.middle", "Arrow-key selection move at the workbook center."],
    ["formatted-paint.top-left", "Repaint a viewport dense with per-cell formatting."],
    [
      "merge-heavy.paint",
      "Repaint a viewport dense with merged ranges; Sheetwrite additionally proves it builds exactly one merge revision index.",
    ],
  ],
);

const DATA_METHOD = benchMethod(
  "Methodology - what each operation does",
  [
    "Identical columnar datasets, per-operation warmup and iteration plans. Fresh instance per ingest; window reads rotate offsets to defeat caches; sort and filter reset between runs; Handsontable edits run with rendering suspended so only its data path is timed.",
    "Memory = JS-heap delta around one ingest in an isolated subprocess, plus Sheetwrite's WASM linear-memory delta.",
  ],
  [
    ["ingest", "Load the full dataset into a fresh engine instance."],
    ["windowRead", "Read a 50x5 cell window at a rotating offset that sweeps the whole sheet."],
    ["edit", "1,000 single-cell edits."],
    ["sort", "Sort by the numeric amount column."],
    ["filter", "Substring filter over the city column."],
    ["aggregate", "Numeric aggregation over the amount column."],
  ],
);

const FORMULA_METHOD = benchMethod(
  "Methodology - what each workload does",
  [
    "Each workload builds a fresh WASM cell-store of the named dependency shape and times the recalculation from one action - usually a single edit. Sizes are formula-cell counts; bright = median, faded = p95.",
  ],
  [
    ["linear-chain", "A chain A1 -> A2 -> ... -> AN; editing the head recomputes the full depth."],
    ["wide-fan-out-edit", "One scalar feeds N dependent formulas; edit the scalar."],
    ["diamond-edit", "Fan-out that reconverges (diamond graph); edit the apex."],
    ["shared-range-edit", "N formulas aggregate one shared range; edit one cell inside it."],
    ["distinct-range-edit", "Each formula owns its own range; one edit recomputes only its owner."],
    ["cross-sheet-range-edit", "Summary-sheet formulas range over another sheet; edit the source."],
    [
      "scalar-edit-affects-N",
      "One scalar edit invalidating exactly N dependents; N=0 touches an unrelated cell, so it prices pure dependency lookup.",
    ],
    ["topology-remove-add", "Remove and re-add rows so the dependency graph itself changes shape."],
    ["cycles", "Introduce a reference cycle; detection and cycle-error propagation."],
    [
      "removed-sheet-ref",
      "Formulas referencing a deleted sheet must all degrade to reference errors.",
    ],
    ["error-propagation", "An error value (=1/0) flows through every dependent."],
    [
      "criteria-range-edit",
      "Criteria-style aggregation (SUMIF shape) over 100k cells; edit inside the criteria range.",
    ],
    [
      "lookup-range-edit",
      "Lookup-shape formulas over 100k cells; edit inside the looked-up range.",
    ],
  ],
);

function renderBenchWidget(evidence: ValidatedRenderEvidence): string {
  const mid = (values: number[]): number => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)] ?? Number.NaN;
  };
  const sizes = BENCH_SIZES.filter((size) => evidence.config.rows.includes(size));
  const parts: string[] = ['<figure class="bench-viz bench-widget" data-pagefind-ignore>'];
  for (const size of sizes) {
    parts.push(
      // No checked attribute: hydrated React treats it as a controlled input
      // and reverts user toggles. Default state (100k/speed) lives in CSS.
      `<input type="radio" name="bench-size" id="bench-size-${size}">`,
    );
  }
  parts.push(
    '<input type="radio" name="bench-metric" id="bench-metric-speed">',
    '<input type="radio" name="bench-metric" id="bench-metric-memory">',
    '<div class="bench-widget__tabs">',
    '<div class="bench-tabs" aria-label="Workbook size">',
    ...sizes.map((size) => `<label for="bench-size-${size}">${fmtRows(size)} rows</label>`),
    "</div>",
    '<div class="bench-tabs bench-tabs--metric" aria-label="Metric">',
    '<label for="bench-metric-speed">Speed</label>',
    '<label for="bench-metric-memory">Memory</label>',
    "</div>",
    "</div>",
  );
  for (const size of sizes) {
    const byScenario = new Map<string, Map<string, RenderEvidenceResult[]>>();
    for (const result of evidence.results) {
      if (result.rows !== size || result.status !== "success") continue;
      const engines =
        byScenario.get(result.scenarioId) ?? new Map<string, RenderEvidenceResult[]>();
      byScenario.set(result.scenarioId, engines);
      const bucket = engines.get(result.engine) ?? [];
      engines.set(result.engine, bucket);
      bucket.push(result);
    }
    type Pair = [string, BenchPairStat | undefined, BenchPairStat | undefined];
    const speedPairs: Pair[] = [];
    const memoryPairs: Pair[] = [];
    for (const scenario of evidence.config.scenarios) {
      const engines = byScenario.get(scenario);
      const ours = engines?.get("sheetwrite");
      const theirs = engines?.get("handsontable");
      const speedStat = (bucket?: RenderEvidenceResult[]): BenchPairStat | undefined =>
        bucket?.length
          ? { main: mid(bucket.map((r) => r.medianMs)), faded: mid(bucket.map((r) => r.p95Ms)) }
          : undefined;
      const memoryStat = (bucket?: RenderEvidenceResult[]): BenchPairStat | undefined =>
        bucket?.length
          ? {
              main: mid(bucket.map((r) => r.memory.afterBytes)),
              faded: mid(bucket.map((r) => Math.max(0, r.memory.deltaBytes))),
            }
          : undefined;
      speedPairs.push([scenario, speedStat(ours), speedStat(theirs)]);
      memoryPairs.push([scenario, memoryStat(ours), memoryStat(theirs)]);
    }
    const speedScale = benchLogScale(
      speedPairs.flatMap(([, a, b]) => [a, b].flatMap((s) => (s ? [s.main, s.faded] : []))),
    );
    const memoryScale = benchLinearScale(
      memoryPairs.flatMap(([, a, b]) => [a, b].flatMap((s) => (s ? [s.main] : []))),
      formatMb,
    );
    const speedRows = speedPairs.map(([scenario, a, b]) =>
      benchPairRow(scenario, a, b, formatMs, ["faster", "slower"], speedScale.pct),
    );
    const memoryRows = memoryPairs.map(([scenario, a, b]) =>
      benchPairRow(scenario, a, b, formatMb, ["leaner", "heavier"], memoryScale.pct, false),
    );
    parts.push(
      benchPanel(
        size,
        "speed",
        speedRows,
        "log scale — every tick is 10× — shorter is faster",
        speedScale,
      ),
      benchPanel(
        size,
        "memory",
        memoryRows,
        "renderer heap after interaction — linear — shorter is leaner",
        memoryScale,
      ),
    );
  }
  parts.push(
    "<figcaption>Every bar in a panel shares the ruler's scale (speed is logarithmic - each tick is 10x), so lengths compare across rows as well as within them. Bright numbers are the median run; faded numbers are the p95 run (speed) or the interaction's heap delta (memory). Rows marked as not completed are runs the engine could not finish - the recorded failure (crash, timeout, or failed correctness checkpoint) lives in the raw artifact.</figcaption>",
    "</figure>",
  );
  return parts.join("\n");
}

/**
 * Run-completion arithmetic for the evidence headline. `results` already
 * contains failed entries - failedKeys must never be added on top.
 */
export function runCompletionSummary(results: ReadonlyArray<{ status: string }>): {
  successes: number;
  total: number;
  failures: number;
} {
  const successes = results.filter((result) => result.status === "success").length;
  return { successes, total: results.length, failures: results.length - successes };
}

interface EvidenceCapture {
  readonly label: string;
  readonly source: string;
  readonly meta: CaptureMeta;
}

/** Every loaded artifact states its capture stamp as either `meta` or `metadata`. */
type CapturedEvidence =
  | { evidence: { meta?: CaptureMeta; metadata?: CaptureMeta }; source: string }
  | EvidenceState;

/**
 * Release captures run before the version bump, so they record the previous
 * release's package version. Each entry maps such a capture commit to the
 * release it measured.
 */
const RELEASE_CANDIDATE_CAPTURES: Readonly<Record<string, string>> = {
  "49e05e298c3f39a8cede038fe8d0062343abc21f": "0.5.0",
};

function sheetwriteLabel(recordedVersion: string, commit: string): string {
  const release = RELEASE_CANDIDATE_CAPTURES[commit];
  return html(
    release === undefined
      ? `Sheetwrite ${recordedVersion}`
      : `Sheetwrite ${release} release candidate`,
  );
}

/**
 * One capture header for the whole page. A page assembled from artifacts of one
 * commit states that single point-in-time capture; a page assembled from
 * different commits lists every vintage instead of letting each section's own
 * commit line hide the mismatch.
 */
function renderCaptureHeader(captures: readonly EvidenceCapture[]): string[] {
  const first = captures[0];
  if (first === undefined) return [];
  const commits = new Set(captures.map((capture) => capture.meta.commit));
  const timestamps = captures.map((capture) => capture.meta.timestamp).sort();
  const earliest = timestamps[0];
  const latest = timestamps.at(-1);
  if (earliest === undefined || latest === undefined) return [];
  const window =
    formatCaptureTime(earliest) === formatCaptureTime(latest)
      ? formatCaptureTime(earliest)
      : `${formatCaptureTime(earliest)} → ${formatCaptureTime(latest)}`;
  if (commits.size === 1) {
    return [
      "## Capture",
      "",
      ...provenanceList([
        ["Captured", `${window} UTC`],
        ["Commit", `${shortHash(first.meta.commit)} clean worktree`],
        [
          "Artifacts",
          `${captures.length} validated captures from that one commit; each section states its own environment (browser or runtime) and protocol`,
        ],
      ]),
    ];
  }
  const vintages = [...captures].sort(
    (left, right) =>
      left.meta.timestamp.localeCompare(right.meta.timestamp) ||
      left.label.localeCompare(right.label),
  );
  return [
    "## Capture",
    "",
    '<div class="evidence-mixed" data-pagefind-ignore><strong>Mixed capture vintages.</strong> The sections below were captured at different commits. Each section is internally consistent and each one names its own commit; the page as a whole is not a single point-in-time measurement.</div>',
    "",
    "| Section | Artifact | Commit | Captured |",
    "| --- | --- | --- | --- |",
    ...vintages.map(
      (capture) =>
        `| ${capture.label} | \`${capture.source}\` | ${shortHash(capture.meta.commit)} | ${formatCaptureTime(capture.meta.timestamp)} UTC |`,
    ),
    "",
  ];
}

/**
 * Failures grouped by the cell that produced them. A run that did not finish is
 * never converted into a timing, so the failure list is part of the evidence:
 * it names the stage and the recorded error behind every missing cell.
 */
function renderFailureTable(evidence: ValidatedRenderEvidence): string[] {
  const failures = evidence.results.filter((result) => result.status !== "success");
  if (failures.length === 0) return [];
  const groups = new Map<
    string,
    { engine: string; rows: number; scenario: string; stage: string; error: string; cells: number }
  >();
  for (const failure of failures) {
    const stage = failure.stage ?? "unrecorded";
    const error = [failure.errorClass, failure.message]
      .filter((part): part is string => typeof part === "string" && part.length > 0)
      .join(": ")
      .replaceAll("|", "\\|");
    const key = [failure.engine, failure.rows, failure.scenarioId, stage, error].join("\u0000");
    const group = groups.get(key);
    if (group === undefined) {
      groups.set(key, {
        engine: failure.engine,
        rows: failure.rows,
        scenario: failure.scenarioId,
        stage,
        error: error.length > 0 ? error : "not recorded",
        cells: 1,
      });
    } else {
      group.cells += 1;
    }
  }
  const ordered = [...groups.values()].sort(
    (left, right) =>
      left.engine.localeCompare(right.engine) ||
      left.rows - right.rows ||
      left.scenario.localeCompare(right.scenario) ||
      left.stage.localeCompare(right.stage),
  );
  return [
    "",
    "Every expected cell carries either a timing or its recorded failure. These cells did not finish and have no timing:",
    "",
    "| Engine | Size | Scenario | Stage | Recorded error | Cells |",
    "| --- | ---: | --- | --- | --- | ---: |",
    ...ordered.map(
      (group) =>
        `| ${group.engine} | ${fmtRows(group.rows)} | ${group.scenario} | ${group.stage} | ${group.error} | ${group.cells} |`,
    ),
    "",
  ];
}

/** Markdown table cells cannot carry a raw pipe. */
const markdownCell = (text: string): string => text.replaceAll("|", "\\|");

/** Four representative scenarios lead the complete measurement chart. */
const CORE_PATH_HEADLINES = [
  "setblock-admission",
  "csv-import",
  "undo-large-clear",
  "node-cold-init",
] as const;

/**
 * "one fromCsv import of …" reads as a label without the leading count. The
 * first word can be an identifier, so its case stays as written.
 */
function scenarioLabel(unit: string): string {
  return unit.replace(/^one /u, "");
}

/**
 * Core write-path evidence: packed block writes, CSV import, large restore,
 * and paged residency work. Every scenario carries the checkpoint it proved,
 * so a timing is never published alone.
 */
function renderCorePathsSection(evidence: CorePathsEvidence, source: string): string[] {
  const headlines = CORE_PATH_HEADLINES.flatMap((id) => {
    const scenario = evidence.scenarios.find((candidate) => candidate.id === id);
    return scenario === undefined
      ? []
      : [
          {
            value: formatMs(scenario.timing.median),
            label: readableText(scenarioLabel(scenario.unit)),
          },
        ];
  });
  const counters = evidence.scenarios.flatMap((scenario) =>
    Object.entries(scenario.counters).map(
      ([name, value]) => `| \`${scenario.id}\` | \`${name}\` | ${formatCount(value)} |`,
    ),
  );
  return [
    "## Core write path",
    "",
    `<div class="evidence-available"><strong>Validated evidence.</strong> ${evidence.scenarios.length} store and document scenarios at production sizes. Every scenario passed its own correctness checkpoint before its timing was accepted.</div>`,
    "",
    ...evidenceHeadline(headlines),
    ...allMeasurements([
      ...benchScaleFigure(
        "scenario",
        evidence.scenarios.flatMap((scenario) => [
          {
            label: scenario.id,
            detail: readableText(scenarioLabel(scenario.unit)),
            entries: [{ sizeLabel: "", median: scenario.timing.median, p95: scenario.timing.p95 }],
          },
          ...(scenario.variants ?? []).map((variant) => ({
            label: variant.id,
            detail: `Variant of ${readableId(scenario.id).toLowerCase()}, measured in the same run`,
            entries: [{ sizeLabel: "", median: variant.timing.median, p95: variant.timing.p95 }],
          })),
        ]),
      ),
      "",
      ...provenanceList([
        ["Captured", `${formatCaptureTime(evidence.metadata.timestamp)} UTC`],
        ["Commit", `${shortHash(evidence.metadata.commit)} clean worktree`],
        [
          "Environment",
          `Bun ${html(evidence.toolchain.bun)} · Node compatibility ${html(evidence.toolchain.nodeCompat)} · ${html(evidence.toolchain.cpu)}`,
        ],
        ["Raw artifact", `<code>${html(source)}</code>`],
      ]),
      "### Scale",
      "",
      "| Parameter | Value |",
      "| --- | ---: |",
      ...Object.entries(evidence.scale).map(
        ([name, value]) => `| \`${name}\` | ${formatCount(value)} |`,
      ),
      "",
      "### Samples",
      "",
      "| Scenario | Samples |",
      "| --- | ---: |",
      ...evidence.scenarios.flatMap((scenario) => [
        `| \`${scenario.id}\` | ${scenario.timing.iters} |`,
        ...(scenario.variants ?? []).map(
          (variant) => `| \`${variant.id}\` | ${variant.timing.iters} |`,
        ),
      ]),
      "",
      ...(counters.length === 0
        ? []
        : [
            "### Counters",
            "",
            "Non-time evidence recorded by the same runs.",
            "",
            "| Scenario | Counter | Value |",
            "| --- | --- | ---: |",
            ...counters,
            "",
          ]),
      "### Correctness checkpoints",
      "",
      "| Scenario | Checkpoint |",
      "| --- | --- |",
      ...evidence.scenarios.map(
        (scenario) => `| \`${scenario.id}\` | ${markdownCell(scenario.validation)} |`,
      ),
    ]),
    "Reproduce with:",
    "",
    '```sh verify title="Core write-path evidence"',
    "bun run --filter @sheetwrite/bench bench:core-paths",
    "```",
    "",
  ];
}

/**
 * XLSX codec evidence: when a baseline commit is recorded, compare the current
 * tree against that codec using the same checked fixture. A ratio below 1 means
 * the current codec is faster; peak RSS is the largest raw process peak.
 */
function renderXlsxSection(evidence: XlsxEvidence, source: string): string[] {
  const summaryFor = (
    engine: string,
    operation: string,
    scenario: string,
  ): XlsxEvidence["summaries"][number] | undefined =>
    evidence.summaries.find(
      (summary) =>
        summary.engine === engine &&
        summary.operation === operation &&
        summary.scenario === scenario,
    );
  const baselineCommit = evidence.toolchain.baselineCommit;
  const provenance = provenanceList([
    ["Captured", `${formatCaptureTime(evidence.metadata.timestamp)} UTC`],
    ["Commit", `${shortHash(evidence.metadata.commit)} clean worktree`],
    [
      "Engines",
      `${sheetwriteLabel(evidence.metadata.engineVersions.sheetwrite, evidence.metadata.commit)} · ExcelJS ${html(evidence.metadata.engineVersions.exceljs)}${baselineCommit === undefined ? "" : ` at baseline ${shortHash(baselineCommit)}`}`,
    ],
    [
      "Fixture",
      `<code>${html(evidence.fixture.path)}</code> · ${formatCount(evidence.fixture.bytes)} bytes · ${shortHash(evidence.fixture.sha256)} · ${html(evidence.fixture.producer)}`,
    ],
    [
      "Environment",
      `Bun ${html(evidence.toolchain.bun)} · Node ${html(evidence.toolchain.node)} · ${html(evidence.toolchain.cpu)}`,
    ],
    ["Raw artifact", `<code>${html(source)}</code>`],
  ]);
  const measurementGroups = (metric: "time" | "memory") =>
    evidence.summaries
      .filter((summary) => summary.engine === "current")
      .map((current) => {
        const baseline =
          baselineCommit === undefined
            ? undefined
            : summaryFor("baseline", current.operation, current.scenario);
        const stat = (summary: XlsxEvidence["summaries"][number]) =>
          metric === "time" ? summary.durationMs : summary.maxRssBytes;
        return {
          label: `${current.operation} ${current.scenario}`,
          detail:
            metric === "time"
              ? undefined
              : `Maximum peak RSS: current ${formatMb(current.maxRssBytes.max)}${baseline === undefined ? "" : ` · baseline ${formatMb(baseline.maxRssBytes.max)}`}`,
          entries: [
            { sizeLabel: "Current", median: stat(current).median, p95: stat(current).p95 },
            ...(baseline === undefined
              ? []
              : [
                  {
                    sizeLabel: "Baseline",
                    median: stat(baseline).median,
                    p95: stat(baseline).p95,
                    series: "compare" as const,
                  },
                ]),
          ],
        };
      });
  return [
    "## XLSX codec benchmark",
    "",
    `<div class="evidence-available"><strong>Validated evidence.</strong> ${evidence.comparisons.length > 0 ? `${evidence.comparisons.length} compared operations` : `${evidence.summaries.length} measured operations`} over ${evidence.rounds} process-isolated rounds each, from one checked corpus fixture.</div>`,
    "",
    ...(baselineCommit === undefined
      ? ["This capture ran the current tree only. No codec comparison is claimed.", ""]
      : [
          `Current and baseline are the same codec at different commits, measured in the same session. Baseline commit: ${shortHash(baselineCommit)}.`,
          "",
        ]),
    "### Operation time",
    "",
    ...benchScaleFigure("operation", measurementGroups("time")),
    "",
    "### Peak resident memory",
    "",
    ...benchScaleFigure("operation", measurementGroups("memory"), "memory"),
    "",
    ...allMeasurements(provenance),
    "Reproduce with a checkout of the baseline commit, built and passed as the comparison root:",
    "",
    '```sh verify title="XLSX codec evidence"',
    `git worktree add ../sheetwrite-xlsx-baseline ${baselineCommit ?? "<baseline commit>"}`,
    "cd ../sheetwrite-xlsx-baseline && bun install --frozen-lockfile && bun run build:packages",
    "cd - && bun run --filter @sheetwrite/bench bench:xlsx -- --baseline-root ../sheetwrite-xlsx-baseline",
    "```",
    "",
  ];
}

/** One generated performance page: its route under `/docs/performance/` and its sections. */
interface PerformancePage {
  readonly slug: string;
  readonly title: string;
  readonly description: string;
  /** `##` headings of the evidence text that this page publishes, in order. */
  readonly sections: readonly string[];
}

/** The Performance section of the docs: one page per benchmark area. */
export const PERFORMANCE_PAGES: readonly PerformancePage[] = [
  {
    slug: "render",
    title: "Render performance",
    description:
      "Scroll, edit, and interaction timings of the live grid, measured against Handsontable.",
    sections: ["Render benchmark"],
  },
  {
    slug: "data-engine",
    title: "Data engine performance",
    description:
      "Ingest, window read, edit, sort, filter, and aggregate timings of the data store.",
    sections: ["Data engine benchmark"],
  },
  {
    slug: "core-write-path",
    title: "Core write path",
    description: "Timings of store and document writes at production sizes.",
    sections: ["Core write path"],
  },
  {
    slug: "formula-engine",
    title: "Formula engine performance",
    description:
      "Recalculation timings by dependency shape, and how the two engine builds compare.",
    sections: ["Formula engine benchmark"],
  },
  {
    slug: "xlsx-codec",
    title: "XLSX codec performance",
    description: "Import and export time and peak memory for XLSX files.",
    sections: ["XLSX codec benchmark"],
  },
  {
    slug: "delivery-size",
    title: "Delivery size",
    description: "Published package sizes for each Sheetwrite release.",
    sections: ["Delivery size"],
  },
  {
    slug: "memory",
    title: "Memory",
    description: "Release retained engine memory, and read which owner holds each byte.",
    sections: ["Release retained engine memory", "Runtime resource ownership"],
  },
  {
    slug: "benchmark-protocol",
    title: "Benchmark protocol",
    description: "How the evidence is captured, and how to check a change for a timing regression.",
    sections: ["Capture", "Matched local regression check", "Pending local evidence"],
  },
];

const PERFORMANCE_INTRO =
  "Every number in this section comes from a validated local protocol artifact captured on a clean tree; nothing is published from an unvalidated or protocol-mismatched artifact. Every expected cell carries either a validated timing or its recorded failure - a run that did not complete is shown as a failure, never converted into a timing.";

/** A Markdown code fence line: up to 3 spaces, then 3 or more backticks or tildes. */
const CODE_FENCE = /^ {0,3}(`{3,}|~{3,})/;

/**
 * Moves every heading below H2 up one level, in Markdown and in raw HTML. A
 * section never holds another H2, so nothing reaches the page's H1. Fenced
 * code is left as written: it shows text, not headings.
 */
function liftHeadings(markdown: string): string {
  let fence: string | undefined;
  return markdown
    .split("\n")
    .map((line) => {
      const marker = CODE_FENCE.exec(line)?.[1];
      if (fence === undefined && marker !== undefined) {
        fence = marker;
        return line;
      }
      if (fence !== undefined) {
        // A fence closes on the same character, at least as long as it opened.
        if (marker !== undefined && marker[0] === fence[0] && marker.length >= fence.length) {
          fence = undefined;
        }
        return line;
      }
      return line
        .replace(/^#(#{2,6} )/, "$1")
        .replace(
          /<(\/?)h([3-6])\b/g,
          (_, slash: string, level: string) => `<${slash}h${Number(level) - 1}`,
        );
    })
    .join("\n");
}

/**
 * Splits the evidence text into the Performance pages. Each `##` section goes
 * to the page that lists it; a section no page lists is an error, so a new
 * benchmark can never drop out of the docs. A page whose evidence is pending
 * says so instead of rendering empty.
 */
export function splitPerformancePages(
  evidence: string,
): Array<{ readonly route: string; readonly content: string }> {
  const sections = new Map<string, string>();
  for (const part of evidence.split(/^(?=## )/m)) {
    if (!part.startsWith("## ")) continue;
    const newline = part.indexOf("\n");
    const heading = part.slice(3, newline === -1 ? undefined : newline).trim();
    if (!PERFORMANCE_PAGES.some((page) => page.sections.includes(heading))) {
      throw new Error(`performance section has no page: ${heading}`);
    }
    sections.set(heading, part.trimEnd());
  }
  const pages = PERFORMANCE_PAGES.map((page) => {
    const present = page.sections.flatMap((heading) => {
      const section = sections.get(heading);
      return section === undefined ? [] : [section];
    });
    // A one-section page takes its heading from the page title, so the
    // section's own headings move up a level to sit right under it.
    const body =
      present.length === 0
        ? "This benchmark has no validated evidence yet. See [Pending local evidence](/docs/performance/benchmark-protocol/#pending-local-evidence)."
        : page.sections.length === 1
          ? liftHeadings((present[0] ?? "").replace(/^## [^\n]*\n+/, ""))
          : present.join("\n\n");
    return {
      route: `performance/${page.slug}.md`,
      content: `${frontmatter(page.title, page.description)}${body}\n`,
    };
  });
  const overview = [
    frontmatter(
      "Performance",
      "Benchmark and package-size evidence for Sheetwrite, one page per area.",
    ).trimEnd(),
    PERFORMANCE_INTRO,
    "",
    "Each page shows the results first, then the method and the command that reproduces them.",
    "",
    ...PERFORMANCE_PAGES.map(
      (page) => `- [${page.title}](/docs/performance/${page.slug}/): ${page.description}`,
    ),
    "",
  ].join("\n");
  return [{ route: "performance/index.md", content: overview }, ...pages];
}

/** Every benchmark and delivery section as `##` Markdown; `splitPerformancePages` publishes it. */
export async function renderEvidenceText(sizeHistoryOverride?: SizeHistory): Promise<string> {
  const scale = await loadEvidence(
    "bench/results/render-scale.json",
    "bun run --filter @sheetwrite/bench bench:render:scale",
    validateRenderArtifact,
  );
  const data = await loadEvidence(
    "bench/results/data-results.json",
    "bun run --filter @sheetwrite/bench bench:data",
    validateDataArtifact,
  );
  const formula = await loadEvidence(
    "bench/results/formula-results.json",
    "bun run --filter @sheetwrite/bench bench:formula",
    validateFormulaArtifact,
  );
  const fullEngine = await loadEvidence(
    "bench/results/full-engine-results.json",
    "bun run --filter @sheetwrite/bench bench:formula:engines",
    validateFullEngineArtifact,
  );
  const matchedEngine = await loadEvidence(
    "bench/results/full-engine-matched-results.json",
    "bun run --filter @sheetwrite/bench bench:formula:matched",
    validateMatchedEngineArtifact,
  );
  const corePaths = await loadEvidence(
    "bench/results/core-paths-results.json",
    "bun run --filter @sheetwrite/bench bench:core-paths",
    validateCorePathsArtifact,
  );
  const xlsx = await loadEvidence(
    "bench/results/xlsx-results.json",
    "bun run --filter @sheetwrite/bench bench:xlsx -- --baseline-root <checkout of the baseline commit>",
    validateXlsxArtifact,
  );
  const captures = (
    [
      { label: "Render benchmark", loaded: scale },
      { label: "Data engine benchmark", loaded: data },
      { label: "Core write path", loaded: corePaths },
      { label: "Formula engine benchmark", loaded: formula },
      { label: "Formula engines (analysis capture)", loaded: fullEngine },
      { label: "Formula engines (matched capture)", loaded: matchedEngine },
      { label: "XLSX codec benchmark", loaded: xlsx },
    ] satisfies Array<{ label: string; loaded: CapturedEvidence }>
  ).flatMap(({ label, loaded }) => {
    if (!("evidence" in loaded)) return [];
    const evidence = loaded.evidence;
    const captured = "meta" in evidence ? evidence.meta : evidence.metadata;
    return [{ label, source: loaded.source, meta: captured }];
  });
  const sizeHistory =
    sizeHistoryOverride ??
    validateSizeHistory(
      JSON.parse(await readFile(resolve(repositoryRoot, "scripts/size-history.json"), "utf8")),
    );
  const pending: EvidenceState[] = [];
  const lines = ["## Render benchmark", ""];
  // Readers come for results; the method and API notes follow every benchmark.
  const methodLines = [
    "## Release retained engine memory",
    "",
    "WebAssembly linear memory grows but does not shrink after cells or stores are cleared. When your application is idle after a large import, clear, or workbook disposal, call [`releaseEngineMemory`](/docs/api/core/release-engine-memory/) explicitly. Sheetwrite never schedules a release automatically.",
    "",
    '```ts prelude="core" partial="requires an initialized application at an idle point" title="Explicit idle memory release"',
    'import { releaseEngineMemory } from "@sheetwrite/core";',
    "",
    "const report = await releaseEngineMemory();",
    "```",
    "",
    "The call waits for synchronous transactions and active datasource page loads, then moves all live stores together into a fresh instance of the selected engine. Cell sources, styles, cached formula results (including volatile results), resident datasource pages, unsaved dirty edits, and compact undo/redo history survive. Unloaded clean pages remain unloaded and can be fetched again from the datasource. Worker renderers rebuild their frames without document-change events.",
    "",
    "The main-thread pause scales with resident cells and compact history, so do not invoke it on an interaction-critical path. Migration temporarily needs both instances and packed transfer buffers; it can increase peak memory before garbage collection reclaims the retired instance. If preparation fails, every live store stays on the original instance. Concurrent calls share the same release.",
    "",
    "`report.wasmBytesBefore` and `report.wasmBytesAfter` are committed linear-memory bytes, not live-cell bytes or process memory. `report.pauseMs` measures migration, excluding the idle wait. A release is not guaranteed to reduce committed bytes: surviving data, compact history, and migration scratch can still require substantial memory. Actual process-memory reclamation depends on garbage collection.",
    "",
    ...renderCaptureHeader(captures),
    "`bench:release` captures render-scale, the performance showcase's paged storage at `bench/results/paged-results.json`, the interaction evidence at `bench/results/interaction-results.json`, data, core paths, formula, formula engines, matched engines, and XLSX, then re-records the render regression baseline last. Its smoke rehearsal writes only to `bench/results/smoke/`.",
    "",
    "The interaction capture (`bench:interaction`, schema `interaction-current-v2`) measures the current build, not a comparison: packed inverse-index lookup latency in nanoseconds, inverse-index backing bytes, retained bytes after 100 distant edits, and the cold-route long task owned by Sheetwrite. It records the raw samples, the summary derived from them, the runner, and the method, and it holds those four metrics to absolute release ceilings. Version 1 recorded a one-off before/after pair whose baseline build cannot be re-measured at a later release, so no old sample is carried forward into the current capture.",
    "",
    "## Matched local regression check",
    "",
    "Timing comparisons run deliberately on a controlled local machine, not as a required CI job. Capture ten fresh matched rounds, retain every raw sample, and compare the fresh artifact with the committed baseline. Any unapproved slowdown fails the local command.",
    "",
    '```sh verify title="Zero-regression benchmark"',
    "bun run --filter @sheetwrite/bench bench:render:prepare",
    "cd bench",
    "bun run src/render-driver.ts --rounds 10 --output results/render-fresh.json --markdown-output results/render-fresh.md",
    "bun run src/check.ts --baseline results/render-baseline.json --fresh results/render-fresh.json --power-mode balanced --concurrency 1",
    "```",
    "",
    "A result is a regression decision only when that final baseline check passes on the declared power mode and concurrency. `bench:verify` remains a smoke and safety-ceiling check.",
    "",
    "The committed baseline at `bench/results/render-baseline.json` pins the harness source hashes, the declared sampling, and the runner (OS, CPU, Bun, Node, Chromium, power mode, concurrency). It is therefore machine- and harness-pinned: it must be re-recorded whenever a harness file, the sampling flags, the protocol version, or the runner changes, and the release capture does that as its last step by re-recording ten controlled rounds into `bench/results/render-baseline-raw.json` and promoting that artifact over the committed baseline. Until the re-recorded baseline is committed, `bench:check` fails closed on the fingerprint mismatch instead of comparing unrelated measurements.",
    "",
  ];
  if ("evidence" in scale) {
    const { evidence, source } = scale;
    const metadata = evidence.metadata;
    const { successes, total, failures } = runCompletionSummary(evidence.results);
    lines.push(
      `<div class="evidence-available"><strong>Validated evidence.</strong> ${successes}/${total} engine/scenario/round runs completed across ${evidence.config.rows.length} workbook sizes; every completed run passed its correctness checkpoints${failures > 0 ? `; ${failures} runs did not finish and are shown as such` : ""}.</div>`,
      "",
      "Both engines drive identical scripted interactions in a controlled browser. Pick a workbook size and a metric:",
      "",
      ...provenanceList([
        ["Captured", `${formatCaptureTime(metadata.timestamp)} UTC`],
        ["Commit", `${shortHash(metadata.commit)} clean worktree`],
        [
          "Engines",
          `${sheetwriteLabel(metadata.engineVersions.sheetwrite, metadata.commit)} · Handsontable ${html(metadata.engineVersions.handsontable)}`,
        ],
        [
          "Environment",
          `Bun ${html(metadata.bunVersion)} · Node compatibility ${html(metadata.nodeVersion)} · Chromium ${html(metadata.browserVersion)} · ${html(metadata.cpu)}`,
        ],
        ["Protocol", `${metadata.rounds} rounds · raw artifact <code>${html(source)}</code>`],
      ]),
      renderBenchWidget(evidence),
      ...renderFailureTable(evidence),
      "",
      RENDER_METHOD,
      "",
      "Reproduce and validate with:",
      "",
      '```sh verify title="Controlled render evidence"',
      "bun run --filter @sheetwrite/bench bench:render:prepare",
      "bun run --filter @sheetwrite/bench bench:render:scale",
      "```",
      "",
    );
  } else {
    pending.push(scale);
  }
  methodLines.push(
    "## Runtime resource ownership",
    "",
    "The performance showcase at `/showcases/performance#resource-ownership` renders the public [`RuntimeResourceSnapshot`](/docs/api/core/runtime-resource-snapshot/) protocol directly. It keeps exclusive-owner logical bytes, allocated capacity, WASM committed pages, and independent browser runtime observations in separate buckets; committed pages are never summed into live payload. Bulk-edit before/settled deltas use [`diffRuntimeResourcePhases`](/docs/api/core/diff-runtime-resource-phases/) and omit unchanged owners.",
    "",
    "The UI and this reference share [`RUNTIME_RESOURCE_SCHEMA_VERSION`](/docs/api/core/runtime-resource-schema-version/). Detailed peak phases remain in the validated benchmark artifact rather than being presented as measurements from the visitor's browser.",
    "",
    "String collection reclaims obsolete pool text and densely remaps surviving IDs. Automatic collection runs only at committed edit transaction barriers, never during painting or page loading, when dead arena/span storage exceeds 256 KiB and the surviving arena/span storage. Growth-based backoff avoids repeatedly scanning unchanged live data. Bulk clears and sheet removal request a new threshold check at the next commit.",
    "",
    "`compactStringStorage()` explicitly collects unreachable text and trims growth slack outside an active mutation/page load. Raw IDs are valid only within `stringPoolEpoch()`; retain the epoch with projections and invalidate caches on a change, as described in the [worker rendering guide](/docs/features/worker-rendering/#raw-string-ids-and-epochs). History snapshots own captured text. Persist resolved values, not pool IDs. Reclaimed Rust ownership does not imply that WebAssembly committed linear memory shrinks.",
    "",
    "Reproduce and validate the full owner/operation matrix with:",
    "",
    '```sh verify title="Runtime resource evidence"',
    "bun run --filter @sheetwrite/bench bench:resource",
    "```",
    "",
  );
  lines.push("## Data engine benchmark", "");
  if ("evidence" in data) {
    const { evidence, source } = data;
    const ops = ["ingest", "windowRead", "edit", "sort", "filter", "aggregate"] as const;
    lines.push(
      `<div class="evidence-available"><strong>Validated evidence.</strong> Head-to-head store operations at the sizes both engines complete headlessly; Sheetwrite additionally scales to 1M rows below.</div>`,
      "",
      ...provenanceList([
        ["Captured", `${formatCaptureTime(evidence.meta.timestamp)} UTC`],
        ["Commit", `${shortHash(evidence.meta.commit)} clean worktree`],
        [
          "Engines",
          `${sheetwriteLabel(evidence.meta.engineVersions.sheetwrite, evidence.meta.commit)} · Handsontable ${html(evidence.meta.engineVersions.handsontable)}`,
        ],
        ["Environment", `Bun ${html(evidence.meta.bun)}`],
        ["Raw artifact", `<code>${html(source)}</code>`],
      ]),
      '<figure class="bench-viz bench-widget bench-widget--data" data-pagefind-ignore>',
      // Uncontrolled radios (a checked attr would make hydrated React revert
      // user toggles); the 10k default lives in CSS fallbacks.
      '<input type="radio" name="bench-data-size" id="bench-data-1000">',
      '<input type="radio" name="bench-data-size" id="bench-data-10000">',
      '<div class="bench-widget__tabs">',
      '<div class="bench-tabs" aria-label="Workbook size">',
      '<label for="bench-data-1000">1k rows</label>',
      '<label for="bench-data-10000">10k rows</label>',
      "</div>",
      "</div>",
    );
    for (const rows of [1_000, 10_000]) {
      const ours = evidence.sheetwrite[String(rows)];
      const theirs = evidence.handsontable[String(rows)];
      if (!ours || !theirs) continue;
      const scale = benchLogScale(
        ops.flatMap((op) =>
          [ours.stats[op], theirs.stats[op]].flatMap((s) => (s ? [s.median, s.p95] : [])),
        ),
      );
      lines.push(
        `<section class="bench-panel bench-ruled" data-size="${rows}" data-metric="speed" style="--bench-segs:${scale.segments}">`,
        `<div class="bench-viz__scale"><span class="bench-viz__lead">operation</span><span class="bench-viz__axis-note">log scale — every tick is 10× — shorter is faster</span><span class="bench-viz__legend"><i class="bench-legend-swatch" data-kind="median"></i>median<i class="bench-legend-swatch" data-kind="p95"></i>p95</span></div>`,
        scale.ruler,
      );
      for (const op of ops) {
        const a = ours.stats[op];
        const b = theirs.stats[op];
        if (!a || !b) continue;
        lines.push(
          benchPairRow(
            op,
            { main: a.median, faded: a.p95 },
            { main: b.median, faded: b.p95 },
            formatMs,
            ["faster", "slower"],
            scale.pct,
          ),
        );
      }
      lines.push("</section>");
    }
    lines.push(
      "</figure>",
      "",
      "Sheetwrite alone at scale — Handsontable cannot complete these sizes headlessly:",
      "",
      ...benchScaleFigure(
        "operation",
        ops.map((op) => ({
          label: op,
          entries: [100_000, 500_000, 1_000_000].flatMap((rows) => {
            const stat = evidence.sheetwrite[String(rows)]?.stats[op];
            return stat === undefined
              ? []
              : [
                  {
                    sizeLabel: `${fmtRows(rows)} rows`,
                    median: stat.median,
                    p95: stat.p95,
                    size: rows,
                  },
                ];
          }),
        })),
      ),
    );
    lines.push(
      "",
      DATA_METHOD,
      "",
      "Reproduce with:",
      "",
      '```sh verify title="Data engine evidence"',
      "bun run --filter @sheetwrite/bench bench:data",
      "```",
      "",
    );
  } else {
    pending.push(data);
  }
  if ("evidence" in corePaths) {
    lines.push(...renderCorePathsSection(corePaths.evidence, corePaths.source));
  } else {
    pending.push(corePaths);
  }
  lines.push("## Formula engine benchmark", "");
  if ("evidence" in formula) {
    const { evidence, source } = formula;
    lines.push(
      `<div class="evidence-available"><strong>Validated evidence.</strong> ${evidence.workloads.length} recalculation workloads across dependency shapes; every workload passed the protocol's safety ceilings.</div>`,
      "",
      ...provenanceList([
        ["Captured", `${formatCaptureTime(evidence.meta.timestamp)} UTC`],
        ["Commit", `${shortHash(evidence.meta.commit)} clean worktree`],
        ["Raw artifact", `<code>${html(source)}</code>`],
      ]),
    );

    // The scalar-edit-affects-N workloads are one scaling series (recompute
    // cost tracks affected dependents, not sheet size); published as separate
    // one-row groups their near-zero baselines read like broken benchmarks.
    const SCALAR_FAMILY = /^scalar-edit-affects-(\d+)$/;
    const scalarEntries = evidence.workloads
      .filter((workload) => SCALAR_FAMILY.test(workload.id))
      .map((workload) => {
        const affected = Number(SCALAR_FAMILY.exec(workload.id)![1]);
        return { workload, affected };
      })
      .sort((left, right) => left.affected - right.affected);
    const workloadIds = [
      ...new Set(
        evidence.workloads.map((workload) => workload.id).filter((id) => !SCALAR_FAMILY.test(id)),
      ),
    ].sort();
    const scalarGroup =
      scalarEntries.length === 0
        ? []
        : [
            {
              label: "scalar-edit-affects",
              entries: scalarEntries.map(({ workload, affected }) => ({
                sizeLabel: `${affected.toLocaleString("en-US")} affected`,
                median: workload.stat.median,
                p95: workload.stat.p95,
                size: Math.max(affected, 1),
              })),
            },
          ];
    lines.push(
      ...benchScaleFigure("workload", [
        ...workloadIds.map((id) => ({
          label: id,
          entries: evidence.workloads
            .filter((workload) => workload.id === id)
            .sort((left, right) => left.size - right.size)
            .map((workload) => ({
              sizeLabel: `${workload.size.toLocaleString("en-US")} ${workload.size === 1 ? "cell" : "cells"}`,
              median: workload.stat.median,
              p95: workload.stat.p95,
              size: workload.size,
            })),
        })),
        ...scalarGroup,
      ]),
    );
    lines.push(
      "",
      FORMULA_METHOD,
      "",
      "Reproduce with:",
      "",
      '```sh verify title="Formula engine evidence"',
      "bun run --filter @sheetwrite/bench bench:formula",
      "```",
      "",
    );
  } else {
    pending.push(formula);
  }
  if ("evidence" in fullEngine) {
    lines.push(
      renderFullEngineEvidence(
        fullEngine.evidence,
        "evidence" in matchedEngine ? matchedEngine.evidence : undefined,
      ),
    );
    if (!("evidence" in matchedEngine)) pending.push(matchedEngine);
  } else {
    pending.push(fullEngine);
    if (!("evidence" in matchedEngine)) pending.push(matchedEngine);
  }
  if ("evidence" in xlsx) {
    lines.push(...renderXlsxSection(xlsx.evidence, xlsx.source));
  } else {
    pending.push(xlsx);
  }
  lines.push("## Delivery size", "");
  const latestRelease = sizeHistory.releases.at(-1);
  if (latestRelease !== undefined) {
    const packageMetricKeys = Object.keys(latestRelease.metrics).filter((name) =>
      name.endsWith(".tarballBytes"),
    );
    lines.push(
      '<section class="size-history" aria-label="Published package size history">',
      '<p class="size-history__intro">Registry measurements for every published release. Each delta is measured against the release immediately before it.</p>',
    );
    for (let index = sizeHistory.releases.length - 1; index >= 0; index -= 1) {
      const release = sizeHistory.releases[index];
      if (release === undefined) continue;
      const previous = sizeHistory.releases[index - 1];
      const releaseDate =
        release.capturedAt === undefined
          ? "Date not recorded"
          : new Intl.DateTimeFormat("en", {
              day: "numeric",
              month: "short",
              year: "numeric",
              timeZone: "UTC",
            }).format(new Date(release.capturedAt));
      const versionStep =
        previous === undefined
          ? `<strong>v${release.version}</strong>`
          : `<span>v${previous.version}</span><svg class="size-history__arrow" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h9M9 4.5 12.5 8 9 11.5"/></svg><strong>v${release.version}</strong>`;
      lines.push(
        `<details class="size-history__release"${index === sizeHistory.releases.length - 1 ? ' data-current="true" open' : ""}>`,
        '<summary class="size-history__release-head">',
        `<span class="size-history__version-step">${versionStep}</span>`,
        `<time${release.capturedAt === undefined ? "" : ` datetime="${release.capturedAt}"`}>${release.capturedAt === undefined ? releaseDate : `Measured ${releaseDate}`}</time>`,
        '<svg class="size-history__fold" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>',
        "</summary>",
        '<div class="size-history__table-wrap">',
        '<table class="size-history__table">',
        '<thead><tr><th scope="col">Package</th><th scope="col">Tarball</th><th scope="col">Installed</th></tr></thead>',
        "<tbody>",
      );
      for (const key of packageMetricKeys) {
        const packageName = key.slice("package.".length, -".tarballBytes".length);
        const unpackedKey = `package.${packageName}.unpackedBytes`;
        const tarball = release.metrics[key];
        const unpacked = release.metrics[unpackedKey];
        if (!tarball || !unpacked) continue;
        const previousTarball = previous?.metrics[key];
        const previousUnpacked = previous?.metrics[unpackedKey];
        const tarballChange =
          previousTarball === undefined ? undefined : formatMetricDelta(tarball, previousTarball);
        const unpackedChange =
          previousUnpacked === undefined
            ? undefined
            : formatMetricDelta(unpacked, previousUnpacked);
        const tarballDirection =
          previousTarball === undefined || tarball.actual === previousTarball.actual
            ? "flat"
            : tarball.actual > previousTarball.actual
              ? "increase"
              : "decrease";
        const unpackedDirection =
          previousUnpacked === undefined || unpacked.actual === previousUnpacked.actual
            ? "flat"
            : unpacked.actual > previousUnpacked.actual
              ? "increase"
              : "decrease";
        lines.push(
          "<tr>",
          `<th scope="row"><code>${packageName}</code></th>`,
          `<td>${formatMetricDisplay(tarball).join(" ")}${tarballChange ? `<small data-direction="${tarballDirection}"><span>${tarballChange[0]}</span><span>${tarballChange[1]}</span></small>` : ""}</td>`,
          `<td>${formatMetricDisplay(unpacked).join(" ")}${unpackedChange ? `<small data-direction="${unpackedDirection}"><span>${unpackedChange[0]}</span><span>${unpackedChange[1]}</span></small>` : ""}</td>`,
          "</tr>",
        );
      }
      lines.push("</tbody>", "</table>", "</div>", "</details>");
    }
    lines.push(
      '<footer class="size-history__footer"><span>Increase</span><span>Decrease</span><code>scripts/size-history.json</code></footer>',
      "</section>",
      "",
    );
  }
  lines.push(...methodLines);
  if (pending.length > 0) {
    lines.push(
      "## Pending local evidence",
      "",
      "These protocols have no validated artifact in this environment yet, so no numbers are published for them.",
      "",
      "| Artifact | Status | Reproduce with |",
      "| --- | --- | --- |",
      ...pending.map(
        (state) => `| \`${state.source}\` | ${state.reason} | \`${state.reproduction}\` |`,
      ),
      "",
    );
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

function compatibilityCell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ").trim();
}

function compatibilitySource(source: string): string {
  return source.startsWith("https://")
    ? `[spec/source](${source})`
    : `[checked source file](https://github.com/chh-ay/sheetwrite/blob/main/${source})`;
}

function publicCompatibilitySource(source: string): string {
  return source.startsWith("https://") ? source : "/docs/reference/compatibility-results/#sources";
}

export function renderCompatibilityResults(
  records: readonly CompatibilityRecord[] = COMPATIBILITY_INVENTORY,
  fixtures: readonly CompatibilityFixture[] = COMPATIBILITY_FIXTURES,
): string {
  const lines = [
    "---",
    'title: "Detailed compatibility results"',
    'description: "Checked formula, workbook, clipboard, and XLSX examples with exact sources and limits."',
    "---",
    "",
    "This page is generated from checked examples and evidence records. It states only what each named result proves; it is not a percentage or a blanket Excel, Google Sheets, LibreOffice, or OpenFormula compatibility claim.",
    "",
    "Result labels distinguish **evaluated** formulas or structures, **preserved** source or metadata, deliberately **flattened** interchange, explicit **warning** boundaries, and **unsupported** behavior.",
    "",
    '<section class="compat-results" aria-label="Checked compatibility results">',
    ...records.flatMap((record) => {
      const evidence = `${record.fixtureIds.length} checked evidence ${record.fixtureIds.length === 1 ? "record" : "records"}`;
      return [
        '<details class="compat-result">',
        '<summary class="compat-result__summary">',
        `<span class="compat-result__title">${html(record.label)}</span>`,
        '<span class="compat-result__meta">',
        `<code>${html(record.area)}</code>`,
        `<code>${html(record.dialect)}</code>`,
        `<span data-status="${record.status}">${record.status}</span>`,
        "</span>",
        '<svg class="compat-result__fold" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>',
        "</summary>",
        '<div class="compat-result__body">',
        "<dl>",
        `<div><dt>Result</dt><dd>${html(record.resultMode)}</dd></div>`,
        `<div><dt>Import</dt><dd>${html(record.importBehavior)}</dd></div>`,
        `<div><dt>Export</dt><dd>${html(record.exportBehavior)}</dd></div>`,
        `<div><dt>Known boundary</dt><dd>${html(record.divergence)}</dd></div>`,
        `<div><dt>Evidence</dt><dd>${evidence}</dd></div>`,
        "</dl>",
        `<a href="/showcases/interoperability/?compatibility=${encodeURIComponent(record.id)}">Open the checked interactive result</a>`,
        "</div>",
        "</details>",
      ];
    }),
    "</section>",
    "",
    "## Warning boundaries",
    "",
    "| Feature | Warning code | Meaning |",
    "| --- | --- | --- |",
    ...records
      .filter((record) => record.warningCode !== null)
      .map(
        (record) =>
          `| ${compatibilityCell(record.label)} | \`${record.warningCode}\` | ${compatibilityCell(record.semantics)} |`,
      ),
    "",
    "<details>",
    "<summary>Technical evidence file details and checksums</summary>",
    "",
    '<div class="compat-evidence-files">',
    ...fixtures.flatMap((fixture) => [
      '<article class="compat-evidence-file">',
      "<header>",
      `<code>${html(fixture.id)}</code>`,
      `<span>${html(fixture.kind)}</span>`,
      "</header>",
      `<p>${html(`${fixture.producer} ${fixture.producerVersion}`)}</p>`,
      "<dl>",
      `<div><dt>Source</dt><dd>${html(fixture.provenance)}</dd></div>`,
      `<div><dt>SHA-256</dt><dd><code>${fixture.sha256 ? html(fixture.sha256) : "source-controlled test or manifest"}</code></dd></div>`,
      `<div><dt>Checked result</dt><dd>${html(fixture.expected.join("; "))}</dd></div>`,
      `<div><dt>Warnings</dt><dd>${html(fixture.expectedWarnings.join("; ") || "none")}</dd></div>`,
      "</dl>",
      "</article>",
    ]),
    "</div>",
    "",
    "</details>",
    "",
    "## Exact sources",
    "",
    ...records.map(
      (record) => `- ${compatibilityCell(record.label)}: ${compatibilitySource(record.source)}`,
    ),
    "",
  ];
  return `${lines.join("\n").trimEnd()}\n`;
}

export async function collectCompatibilityDigestIssues(
  root: string = repositoryRoot,
  fixtures: readonly CompatibilityFixture[] = COMPATIBILITY_FIXTURES,
): Promise<string[]> {
  const issues: string[] = [];
  for (const fixture of fixtures) {
    if (!fixture.sha256) continue;
    try {
      const bytes = await readFile(join(root, fixture.path));
      const actual = createHash("sha256").update(bytes).digest("hex");
      if (actual !== fixture.sha256) {
        issues.push(
          `compatibility fixture digest mismatch: ${fixture.id} expected=${fixture.sha256} actual=${actual}`,
        );
      }
    } catch {
      issues.push(`missing compatibility fixture for digest: ${fixture.path}`);
    }
  }
  return issues;
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
  const [formulaInventory, publishedCompatibilityResults] = await Promise.all([
    loadFormulaContractInventory(repositoryRoot),
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

  const formulaPages = renderFormulaFunctionPages(formulaInventory);
  // An old overview heading forwards only when exactly one family page holds it;
  // shared headings ("Signature profiles") stay on the overview.
  const formulaHeadingTargets: Record<string, string> = {};
  const overviewAnchors = headingAnchors(
    formulaPages.find((page) => page.route === "reference/formula-functions.md")?.content ?? "",
  );
  const holders = new Map<string, string[]>();
  for (const page of formulaPages) {
    if (page.route === "reference/formula-functions.md") continue;
    const href = `/docs/${page.route.replace(/\.md$/, "/")}`;
    for (const heading of headingAnchors(page.content)) {
      if (overviewAnchors.has(heading)) continue;
      holders.set(heading, [...(holders.get(heading) ?? []), `${href}#${heading}`]);
    }
  }
  for (const [heading, targets] of holders) {
    if (targets.length === 1 && targets[0] !== undefined)
      formulaHeadingTargets[heading] = targets[0];
  }
  // The old single-page table used a heading for each family's title.
  for (const family of formulaFamilyNavigation(formulaPages)) {
    const oldHeading = [...headingAnchors(`### ${family.label}`)][0];
    if (oldHeading !== undefined) formulaHeadingTargets[oldHeading] = family.href;
  }
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
    {
      path: join(generatedDataRoot, "formula-nav.json"),
      content: stableJson(formulaFamilyNavigation(formulaPages)),
    },
    {
      path: join(generatedDataRoot, "formula-heading-targets.json"),
      content: stableJson(formulaHeadingTargets),
    },
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
    ...splitPerformancePages(await renderEvidenceText()).map((page) => ({
      path: join(contentRoot, page.route),
      content: page.content,
    })),
    { path: generatedManifestPath, content: stableJson(manifest) },
    { path: docsContractPath, content: stableJson(contract) },
    {
      path: join(generatedDataRoot, "api-nav.json"),
      content: stableJson(
        manifest.packages.map((pkg) => ({
          label: pkg.name,
          href: `/docs/api/${entrySlug(pkg.name, ".")}/`,
        })),
      ),
    },
  ];
  files.push(...(await expectedLlmsFiles(manifest, repositoryRoot, files)));
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

async function writeIfChanged(path: string, content: string): Promise<void> {
  if ((await exists(path)) && (await readFile(path, "utf8")) === content) return;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
}

async function removeStaleApiPages(expected: readonly ExpectedFile[]): Promise<void> {
  const apiRoot = join(contentRoot, "api");
  if (!(await exists(apiRoot))) return;
  const keep = new Set(
    expected.filter((file) => file.path.startsWith(`${apiRoot}${sep}`)).map((file) => file.path),
  );
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(path);
        if ((await readdir(path)).length === 0) await rm(path, { recursive: true });
      } else if (entry.isFile() && entry.name.endsWith(".md") && !keep.has(path)) {
        await rm(path);
      }
    }
  };
  await visit(apiRoot);
}

async function markdownDocuments(root: string): Promise<MarkdownDocument[]> {
  const documents: MarkdownDocument[] = [];
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile() && /\.mdx?$/.test(entry.name)) {
        documents.push({ path, content: await readFile(path, "utf8") });
      }
    }
  };
  await visit(root);
  return documents.sort((left, right) => left.path.localeCompare(right.path));
}

const CSS_TOKEN_SOURCE_EXTENSIONS = new Set([".css", ".md", ".mdx", ".svelte", ".ts", ".tsx"]);

/** Report every referenced Sheetwrite CSS token that has no source definition. */
export async function unresolvedCssTokens(root: string): Promise<string[]> {
  const definitions = new Set<string>();
  const references = new Map<string, Set<string>>();
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(path);
        continue;
      }
      if (!entry.isFile()) continue;
      const extension = entry.name.slice(entry.name.lastIndexOf("."));
      if (!CSS_TOKEN_SOURCE_EXTENSIONS.has(extension)) continue;
      const content = await readFile(path, "utf8");
      for (const match of content.matchAll(/(--sw-[\w-]+)\s*:/g)) {
        if (match[1] !== undefined) definitions.add(match[1]);
      }
      for (const match of content.matchAll(/var\(\s*(--sw-[\w-]+)/g)) {
        const token = match[1];
        if (token === undefined) continue;
        const owners = references.get(token) ?? new Set<string>();
        owners.add(posix(relative(root, path)));
        references.set(token, owners);
      }
    }
  };
  await visit(root);
  return [...references.entries()]
    .filter(([token]) => !definitions.has(token))
    .map(
      ([token, owners]) =>
        `undefined Sheetwrite CSS token ${token}: ${[...owners].sort().join(", ")}`,
    )
    .sort();
}

export function parseFences(content: string): Fence[] {
  const fences: Fence[] = [];
  const lines = content.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^```([^\s`]*)\s*(.*)$/.exec(lines[index] ?? "");
    if (match === null) continue;
    const language = match[1] ?? "";
    const meta = match[2]?.trim() ?? "";
    const start = index;
    const body: string[] = [];
    for (index += 1; index < lines.length && !/^```\s*$/.test(lines[index] ?? ""); index += 1) {
      body.push(lines[index] ?? "");
    }
    if (index >= lines.length) throw new Error(`Unclosed code fence at line ${start + 1}`);
    fences.push({ language, meta, code: body.join("\n"), line: start + 1 });
  }
  return fences;
}
function fenceMetaValue(meta: string, name: string): string | undefined {
  const match = new RegExp(`(?:^|\\s)${name}=(?:"([^"]+)"|'([^']+)')`).exec(meta);
  return match?.[1] ?? match?.[2];
}

function maskCode(content: string): string {
  return content
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/[^\n]/g, " "))
    .replace(/`[^`\n]*`/g, (code) => " ".repeat(code.length));
}

function routeForContentPath(path: string): string {
  const relativePath = posix(relative(contentRoot, path)).replace(/\.mdx?$/, "");
  const withoutIndex = relativePath === "index" ? "" : relativePath.replace(/\/index$/, "");
  return `/docs/${withoutIndex}${withoutIndex.length === 0 ? "" : "/"}`;
}

export function contentPathForRoute(
  route: string,
  documents: readonly MarkdownDocument[],
): string | undefined {
  const normalizedRoute = route.endsWith("/") ? route : `${route}/`;
  return documents.find((document) => routeForContentPath(document.path) === normalizedRoute)?.path;
}

export function headingAnchors(content: string): Set<string> {
  const anchors = new Set<string>();
  const masked = content.replace(/```[\s\S]*?```/g, (block) => block.replace(/[^\n]/g, " "));
  for (const line of masked.split("\n")) {
    const explicit = /<[a-z][^>]*\sid=["']([^"']+)["']/i.exec(line);
    if (explicit !== null) anchors.add(explicit[1] ?? "");
    const heading = /^#{1,6}\s+(.+?)\s*$/.exec(line);
    if (heading === null) continue;
    const slug = (heading[1] ?? "")
      .replace(/<[^>]+>/g, "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/[`*_~]/g, "")
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, "")
      .replace(/\s/g, "-");
    if (slug.length > 0) anchors.add(slug);
  }
  return anchors;
}

function packageAndSubpath(
  specifier: string,
): { packageName: string; subpath: string } | undefined {
  const clean = specifier.split("?")[0] ?? specifier;
  const match = /^(@sheetwrite\/[^/]+)(?:\/(.+))?$/.exec(clean);
  if (match === null) return undefined;
  return { packageName: match[1] ?? "", subpath: match[2] === undefined ? "." : `./${match[2]}` };
}

function validateImports(
  document: MarkdownDocument,
  fence: Fence,
  manifest: PublicApiManifest,
): string[] {
  const failures: string[] = [];
  const imports = fence.code.matchAll(
    /import\s+(?:(?:type\s+)?\{([^}]+)\}|[^"']+)?\s*from\s*["']([^"']+)["']|import\s*["']([^"']+)["']/g,
  );
  for (const match of imports) {
    const specifier = match[2] ?? match[3] ?? "";
    const parsed = packageAndSubpath(specifier);
    if (parsed === undefined) continue;
    const pkg = manifest.packages.find((item) => item.name === parsed.packageName);
    const entry = pkg?.entryPoints.find((item) => item.subpath === parsed.subpath);
    if (entry === undefined) {
      failures.push(
        `${posix(relative(repositoryRoot, document.path))}:${fence.line} imports unsupported entry point ${specifier}`,
      );
      continue;
    }
    const names = (match[1] ?? "")
      .split(",")
      .map(
        (name) =>
          name
            .trim()
            .replace(/^type\s+/, "")
            .split(/\s+as\s+/)[0] ?? "",
      )
      .filter(Boolean);
    for (const name of names) {
      if (!entry.exports.some((item) => item.name === name)) {
        failures.push(
          `${posix(relative(repositoryRoot, document.path))}:${fence.line} imports missing ${specifier} export ${name}`,
        );
      }
    }
  }
  return failures;
}

/**
 * Compiler options for the compiled snippets. TypeScript 7 does not support `baseUrl`,
 * so the `paths` targets are relative to the scratch tsconfig beside the snippets.
 */
const SNIPPET_COMPILER_OPTIONS = {
  jsx: "react-jsx",
  lib: ["esnext", "dom", "dom.iterable"],
  module: "esnext",
  moduleResolution: "bundler",
  noEmit: true,
  paths: {
    "@sheetwrite/charts": ["../packages/charts/dist/index.d.ts"],
    "@sheetwrite/core": ["../packages/core/dist/index.d.ts"],
    "@sheetwrite/core/*": ["../packages/core/dist/*"],
    "@sheetwrite/react": ["../packages/react/dist/index.d.ts"],
    "@sheetwrite/svelte": ["../packages/svelte/src/index.ts"],
    "@sheetwrite/vue": ["../packages/vue/dist/index.d.ts"],
    "@sheetwrite/xlsx": ["../packages/xlsx/dist/index.d.ts"],
    "@sheetwrite/xlsx/register": ["../packages/xlsx/dist/register.d.ts"],
  },
  skipLibCheck: false,
  strict: true,
  target: "es2022",
} as const;

function diagnosticText(diagnostic: Diagnostic): string {
  return [diagnostic.text, ...(diagnostic.messageChain ?? []).map(diagnosticText)].join("\n");
}

async function preEmitDiagnostics(project: Project): Promise<readonly Diagnostic[]> {
  const diagnostics = [...(await project.program.getConfigFileParsingDiagnostics())];
  const configFileCount = diagnostics.length;
  diagnostics.push(...(await project.program.getSyntacticDiagnostics()));
  if (diagnostics.length !== configFileCount) return diagnostics;
  diagnostics.push(...(await project.program.getProgramDiagnostics()));
  diagnostics.push(...(await project.program.getGlobalDiagnostics()));
  if (diagnostics.length === configFileCount) {
    diagnostics.push(...(await project.program.getSemanticDiagnostics()));
  }
  return diagnostics;
}

async function validateCompiledSnippets(
  snippets: Array<{ document: MarkdownDocument; fence: Fence }>,
): Promise<string[]> {
  if (snippets.length === 0) return [];
  const directory = await mkdtemp(join(repositoryRoot, ".docs-snippets-"));
  const api = new API({ cwd: repositoryRoot });
  try {
    const files: string[] = [];
    for (const [index, snippet] of snippets.entries()) {
      const extension = snippet.fence.language === "tsx" ? "tsx" : "ts";
      const path = join(directory, `snippet-${index}.${extension}`);
      const compileSource = snippet.fence.code.replace(
        /^\s*import\s+["'][^"']+\.css["'];?\s*$/gm,
        "",
      );
      await writeFile(path, `${compileSource}\nexport {};\n`);
      files.push(path);
    }
    const configPath = join(directory, "tsconfig.json");
    await writeFile(
      configPath,
      `${JSON.stringify({ compilerOptions: SNIPPET_COMPILER_OPTIONS, files }, null, 2)}\n`,
    );
    const snapshot = await api.updateSnapshot({ openProjects: [configPath] });
    try {
      const project = snapshot.getProject(configPath);
      if (project === undefined) {
        throw new Error(`TypeScript 7 could not open the snippet project ${configPath}`);
      }
      const failures: string[] = [];
      for (const diagnostic of await preEmitDiagnostics(project)) {
        const message = diagnosticText(diagnostic);
        const fileName = diagnostic.fileName;
        const index = fileName === undefined ? -1 : files.indexOf(fileName);
        if (fileName === undefined || index < 0) {
          failures.push(`compiled snippet: ${message}`);
          continue;
        }
        const sourceFile = await project.program.getSourceFile(fileName);
        const snippet = snippets[index];
        const position = sourceFile?.getLineAndCharacterOfPosition(diagnostic.pos);
        failures.push(
          `${posix(relative(repositoryRoot, snippet?.document.path ?? ""))}:${
            (snippet?.fence.line ?? 0) + (position?.line ?? 0) + 1
          } compiled snippet: ${message}`,
        );
      }
      return failures;
    } finally {
      await snapshot.dispose();
    }
  } finally {
    await api.close();
    await rm(directory, { force: true, recursive: true });
  }
}

function validateVerifiedShell(
  document: MarkdownDocument,
  fence: Fence,
  manifest: PublicApiManifest,
): string[] {
  const failures: string[] = [];
  const knownPackages = new Set(manifest.packages.map((pkg) => pkg.name));
  for (const match of fence.code.matchAll(
    /(?:bun\s+add|npm\s+install)\s+(@sheetwrite\/[^\s#]+)/g,
  )) {
    const packageName = match[1] ?? "";
    if (!knownPackages.has(packageName)) {
      failures.push(
        `${posix(relative(repositoryRoot, document.path))}:${fence.line} installs unknown package ${packageName}`,
      );
    }
  }
  return failures;
}

async function validateMarkdown(
  documents: readonly MarkdownDocument[],
  manifest: PublicApiManifest,
): Promise<string[]> {
  const failures: string[] = [];
  const hoverAnalyzer = new SheetwriteTypeEngine({ cwd: join(repositoryRoot, "docs") });
  const compiled: Array<{ document: MarkdownDocument; fence: Fence }> = [];
  for (const document of documents) {
    let fences: Fence[];
    try {
      fences = parseFences(document.content);
    } catch (error) {
      failures.push(
        `${posix(relative(repositoryRoot, document.path))}: ${(error as Error).message}`,
      );
      continue;
    }
    for (const fence of fences) {
      const classified =
        /(?:^|\s)(?:compile|generated|verify|diagram)(?:\s|$)/.test(fence.meta) ||
        /(?:^|\s)partial=(?:"[^"]+"|'[^']+')/.test(fence.meta);
      if (!classified) {
        failures.push(
          `${posix(relative(repositoryRoot, document.path))}:${fence.line} code fence is not compile-checked or explicitly classified`,
        );
      }
      const typedLanguage =
        fence.language === "ts" ||
        fence.language === "tsx" ||
        fence.language === "vue" ||
        fence.language === "svelte";
      const generated = /(?:^|\s)generated(?:\s|$)/.test(fence.meta);
      const partial = /(?:^|\s)partial=(?:"[^"]+"|'[^']+')/.test(fence.meta);
      const prelude = fenceMetaValue(fence.meta, "prelude");
      if (typedLanguage && !generated) {
        const language = fence.language as "ts" | "tsx" | "vue" | "svelte";
        if (partial && prelude === undefined) {
          failures.push(
            `${posix(relative(repositoryRoot, document.path))}:${fence.line} typed partial fence requires a named hover prelude`,
          );
        }
        try {
          const hovers = collectFenceHovers(fence.code, language, hoverAnalyzer, prelude);
          for (const hover of hovers) {
            if (isHighQualityHover(hover, language)) continue;
            failures.push(
              `${posix(relative(repositoryRoot, document.path))}:${fence.line + hover.line} low-quality hover for ${hover.target}: ${hover.text}`,
            );
          }
        } catch (error) {
          failures.push(
            `${posix(relative(repositoryRoot, document.path))}:${fence.line} hover analysis failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
      if (/(?:^|\s)compile(?:\s|$)/.test(fence.meta)) {
        if (fence.language !== "ts" && fence.language !== "tsx") {
          failures.push(
            `${posix(relative(repositoryRoot, document.path))}:${fence.line} compile is only valid for ts/tsx fences`,
          );
        } else compiled.push({ document, fence });
      }
      if (fence.language === "ts" || fence.language === "tsx") {
        failures.push(...validateImports(document, fence, manifest));
      }
      if (fence.language === "sh" && /(?:^|\s)verify(?:\s|$)/.test(fence.meta)) {
        failures.push(...validateVerifiedShell(document, fence, manifest));
      }
    }

    const masked = maskCode(document.content);
    const linkTargets = [
      ...[...masked.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map((match) => match[1]),
      ...[...masked.matchAll(/\shref=["']([^"']+)["']/gi)].map((match) => match[1]),
    ];
    for (const target of linkTargets) {
      const rawTarget = target?.trim() ?? "";
      if (
        rawTarget.length === 0 ||
        /^(?:https?:|mailto:|tel:)/.test(rawTarget) ||
        rawTarget.startsWith("{")
      ) {
        continue;
      }
      const [targetWithoutFragment = "", fragment] = rawTarget.split("#", 2);
      const [targetRoute = ""] = targetWithoutFragment.split("?", 1);
      let targetPath: string | undefined;
      if (targetRoute === "") targetPath = document.path;
      else if (targetRoute.startsWith("/docs/")) {
        targetPath = contentPathForRoute(targetRoute, documents);
      } else if (targetRoute.startsWith("/") && !targetRoute.includes("..")) {
        const routeSlug = targetRoute.replace(/^\//, "").replace(/\/$/, "").replaceAll("/", ".");
        targetPath = join(repositoryRoot, `docs/src/routes/${routeSlug || "index"}.tsx`);
      } else if (targetRoute.startsWith("/")) {
        failures.push(
          `${posix(relative(repositoryRoot, document.path))} links invalid internal route ${rawTarget}`,
        );
        continue;
      } else {
        targetPath = resolve(dirname(document.path), targetWithoutFragment);
        if (!/\.[a-zA-Z]+$/.test(targetPath)) {
          targetPath = `${targetPath}.md`;
        }
      }
      if (targetPath === undefined || !(await exists(targetPath))) {
        failures.push(
          `${posix(relative(repositoryRoot, document.path))} links missing target ${rawTarget}`,
        );
        continue;
      }
      if (fragment !== undefined && fragment.length > 0 && /\.mdx?$/.test(targetPath)) {
        const target = documents.find((item) => item.path === targetPath);
        if (target !== undefined && !headingAnchors(target.content).has(fragment)) {
          failures.push(
            `${posix(relative(repositoryRoot, document.path))} links missing anchor ${rawTarget}`,
          );
        }
      }
    }
  }
  failures.push(...(await validateCompiledSnippets(compiled)));
  return failures;
}

async function readReadmes(): Promise<MarkdownDocument[]> {
  const paths = [
    join(repositoryRoot, "README.md"),
    ...Object.values(PACKAGE_DIRECTORIES).map((directory) =>
      join(repositoryRoot, directory, "README.md"),
    ),
  ];
  const documents: MarkdownDocument[] = [];
  for (const path of paths) {
    if (await exists(path)) documents.push({ path, content: await readFile(path, "utf8") });
  }
  return documents;
}

async function checkDocs(
  manifest: PublicApiManifest,
  expected: readonly ExpectedFile[],
  apiIssues: readonly { code: string; message: string }[],
): Promise<string[]> {
  const failures = apiIssues.map((issue) => `${issue.code}: ${issue.message}`);
  for (const file of expected) {
    if (!(await exists(file.path))) {
      failures.push(`generated file missing: ${posix(relative(repositoryRoot, file.path))}`);
      continue;
    }
    const actual = await readFile(file.path, "utf8");
    if (actual !== file.content) {
      failures.push(`generated file is stale: ${posix(relative(repositoryRoot, file.path))}`);
    }
  }

  for (const oldPath of Object.keys(MIGRATION_ROUTES)) {
    if (await exists(join(repositoryRoot, oldPath)))
      failures.push(`duplicate migrated guide remains: ${oldPath}`);
  }

  const documents = await markdownDocuments(contentRoot);
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

  const apiIndex = await readFile(join(contentRoot, "api/index.md"), "utf8");
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

export async function generateDocs(): Promise<void> {
  const analysis = await analyzePublicApi(repositoryRoot);
  const fatalIssues = analysis.issues.filter((issue) =>
    ["malformed-report", "parse-error", "unclassified-entry", "unresolved-entry"].includes(
      issue.code,
    ),
  );
  if (fatalIssues.length > 0) throw new Error(fatalIssues.map((issue) => issue.message).join("\n"));
  const expected = await expectedGeneratedFiles(analysis.manifest);
  await removeStaleApiPages(expected);
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
  console.log(
    `Generated ${entryCount} API entry-point indexes, ${symbolCount} symbol pages, and documentation contracts`,
  );
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
  "@sheetwrite/xlsx": ["registerXlsxBackends"],
  "@sheetwrite/charts": ["createChartViewCache", "registerChartsBackend"],
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

export async function verifyDocs(): Promise<void> {
  const analysis = await analyzePublicApi(repositoryRoot);
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
  console.log("Documentation contract check passed");
}

if (import.meta.main) {
  const mode = process.argv[2];
  if (mode === "generate") await generateDocs();
  else if (mode === "check") await verifyDocs();
  else throw new Error("Usage: bun scripts/docs.ts <generate|check>");
}
