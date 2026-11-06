import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, normalize } from "node:path";

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
import { API, type Project } from "typescript/unstable/async";

import { MOVED_PAGES, type MovedPage } from "../docs/src/lib/moved-pages.js";
import { repositorySourceUrl } from "../docs/src/lib/repository.js";
import { formatDeclaration, formatTypeExpression } from "../docs/src/lib/sheetwrite-code-hovers.js";
import { contentPathForRoute } from "./docs-content-checks.js";
import { entryLabel, entrySlug } from "./docs-paths.js";
import {
  exists,
  frontmatter,
  type MarkdownDocument,
  MIGRATION_ROUTES,
  PACKAGE_DIRECTORIES,
  posix,
  repositoryRoot,
  REQUIRED_SEARCH_TARGETS,
} from "./docs-shared.js";
import { html, readableId } from "./evidence-format.js";
import { headingAnchors } from "./markdown-anchors.js";
import type { ApiEntryPoint, ApiExport, ApiPackage, PublicApiManifest } from "./public-api.js";

function packageSourcePath(packageName: string, source: string): string {
  const separator = source.indexOf("#");
  const file = separator === -1 ? source : source.slice(0, separator);
  const fragment = separator === -1 ? undefined : source.slice(separator + 1);
  const packageDirectory = PACKAGE_DIRECTORIES[packageName];
  if (packageDirectory === undefined) return source;
  const normalized = posix(normalize(join(packageDirectory, file)));
  return fragment === undefined ? normalized : `${normalized}#${fragment}`;
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

export function anchor(value: string): string {
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
export function parseableDeclaration(item: Pick<ApiExport, "name" | "signature">): string {
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
export async function prepareDeclarationShapes(signatures: Iterable<string>): Promise<void> {
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

export async function consumerIndex(manifest: PublicApiManifest): Promise<ConsumerIndex> {
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
  const usedIds = new Set<string>();
  const rows = members.map((member, index) => {
    // Overload rows repeat a member name. The first row keeps the member ID
    // that the index and other pages link to; each later row gets a suffix,
    // so no two elements share an ID.
    const memberId = `${anchor(item.name)}-${anchor(member.name) || index + 1}`;
    const firstRow = !usedIds.has(memberId);
    let id = memberId;
    for (let overload = 2; usedIds.has(id); overload += 1) id = `${memberId}-${overload}`;
    usedIds.add(id);
    if (firstRow) indexLinks.push(`<a href="#${id}"><code>${html(member.name)}</code></a>`);
    const searchAnchor =
      firstRow && searchTargets.has(member.name)
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
      // A fenced block so member signatures get real syntax highlighting; the
      // member grammar reads a lone `readonly name: Type;` as a class member.
      "```ts-member generated",
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
    `<div><dt>Source</dt><dd><a href="${html(repositorySourceUrl(source))}"><code>${html(source)}</code></a></dd></div>`,
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

export function renderApiIndex(manifest: PublicApiManifest): string {
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

export function renderEntryPointInventory(manifest: PublicApiManifest): string {
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

export function renderMovedGuides(): string {
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
