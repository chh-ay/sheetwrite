import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
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

import { apiAnchor as anchor, apiPageSlugs } from "../docs/src/lib/api-page-slugs.js";
import { MOVED_PAGES, type MovedPage } from "../docs/src/lib/moved-pages.js";
import { repositorySourceUrl } from "../docs/src/lib/repository.js";
import { formatDeclaration, formatTypeExpression } from "../docs/src/lib/sheetwrite-code-hovers.js";
import { contentPathForRoute } from "./docs-content-checks.js";
import { entryLabel, entrySlug } from "./docs-paths.js";
import {
  frontmatter,
  type MarkdownDocument,
  MIGRATION_ROUTES,
  PACKAGE_DIRECTORIES,
  posix,
  REQUIRED_SEARCH_TARGETS,
  repositoryRoot,
} from "./docs-shared.js";
import { html, readableId } from "./evidence-format.js";
import { headingAnchors } from "./markdown-anchors.js";
import type { ApiEntryPoint, ApiExport, ApiPackage, PublicApiManifest } from "./public-api.js";

function package_source_path(package_name: string, source: string): string {
  const separator = source.indexOf("#");
  const file = separator === -1 ? source : source.slice(0, separator);
  const fragment = separator === -1 ? undefined : source.slice(separator + 1);
  const package_directory = PACKAGE_DIRECTORIES[package_name];
  if (package_directory === undefined) return source;
  const normalized = posix(normalize(join(package_directory, file)));
  return fragment === undefined ? normalized : `${normalized}#${fragment}`;
}

/** Build output: files the build writes, which the repository does not hold. */
const BUILD_OUTPUT = /^packages\/[^/]+\/(?:dist|pkg|pkg-history)\//;

/**
 * The repository file for a declaration that resolved to build output. A
 * re-export from another workspace package resolves to that package's
 * `dist/*.d.ts`; its source is the same path under `src/`, at the line that
 * declares `name`. Files that only the build writes, such as wasm-bindgen's
 * `pkg/*.d.ts`, have no repository copy and stay as they are.
 */
function repository_source_path(source: string, name: string): string {
  const file = source.split("#")[0] ?? source;
  const built = /^(packages\/[^/]+)\/dist\/(.+)\.d\.[cm]?ts$/.exec(file);
  if (built === null) return source;
  const source_file = [".ts", ".tsx"]
    .map((extension) => `${built[1]}/src/${built[2]}${extension}`)
    .find((candidate) => existsSync(join(repositoryRoot, candidate)));
  if (source_file === undefined) return source;
  const declaration = new RegExp(
    `^export\\s+(?:declare\\s+)?(?:abstract\\s+)?(?:interface|type|class|function|const|let|enum)\\s+${name}\\b`,
  );
  const line = readFileSync(join(repositoryRoot, source_file), "utf8")
    .split("\n")
    .findIndex((text) => declaration.test(text));
  return line < 0 ? source_file : `${source_file}#L${line + 1}`;
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

/**
 * Exports shown as one card with no member list. `InitOutput` is the raw module
 * output wasm-bindgen generates for the loader: its members are ABI glue with no
 * doc source, not API to call (#504).
 */
const OPAQUE_EXPORTS: ReadonlySet<string> = new Set(["InitOutput"]);

/** The members an export's reference page lists. */
function rendered_members(item: Pick<ApiExport, "name" | "signature">): DeclarationMember[] {
  return OPAQUE_EXPORTS.has(item.name) ? [] : declaration_shape(parseableDeclaration(item)).members;
}

/**
 * wasm-bindgen gives every class it generates a `free()` method with no doc
 * source, so the reference describes it the same way on each of them.
 */
const WASM_BINDGEN_FREE =
  "Releases the object's WASM memory now instead of at garbage collection; the object can't be used afterwards.";

/** An export's member doc comments, with wasm-bindgen's `free()` described for generated classes. */
function rendered_member_docs(item: ApiExport): ApiExport["memberDocs"] {
  const generated =
    item.kind === "class" &&
    /^pkg[^/]*\//.test(item.source) &&
    !item.memberDocs.some((member) => member.name === "free" && member.documentation.trim() !== "");
  return generated
    ? [...item.memberDocs, { name: "free", documentation: WASM_BINDGEN_FREE }]
    : item.memberDocs;
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
          route: symbol_route(pkg, entry, item),
          item,
        });
        routes.set(item.name, candidates);
      }
    }
  }
  return routes;
}

function unique_documentation_candidate(
  routes: DocumentationLinkRoutes,
  package_name: string,
  target: string,
): DocumentationLinkCandidate | undefined {
  const candidates = routes.get(target) ?? [];
  const package_candidates = candidates.filter(
    (candidate) => candidate.packageName === package_name,
  );
  if (package_candidates.length === 1) return package_candidates[0];
  return candidates.length === 1 ? candidates[0] : undefined;
}

/**
 * The same symbol is re-exported from several entry points, so a reference resolves to
 * the page's own entry first, then its package, then an unambiguous match anywhere.
 */
function closest_candidate<
  T extends { readonly packageName: string; readonly entry: ApiEntryPoint },
>(candidates: readonly T[], package_name: string, entry: ApiEntryPoint): T | undefined {
  const local = candidates.filter(
    (candidate) => candidate.packageName === package_name && candidate.entry === entry,
  );
  const same_package = candidates.filter((candidate) => candidate.packageName === package_name);
  return [local, same_package, candidates].find((group) => group.length === 1)?.[0];
}

function has_rendered_member(item: ApiExport, member_name: string): boolean {
  return rendered_members(item).some((member) => member.name === member_name);
}

function documentation_link_route(
  pkg: ApiPackage,
  entry: ApiEntryPoint,
  item: ApiExport,
  target: string,
  routes: DocumentationLinkRoutes,
): string | undefined {
  if (/^(?:https?:\/\/|\/docs\/)/.test(target)) return target;
  const target_parts = target.split(".");
  if (target_parts.length > 2) return undefined;
  const [owner_name, member_name] = target_parts;
  if (member_name !== undefined) {
    const local_owner = entry.exports.find((candidate) => candidate.name === owner_name);
    const owner =
      local_owner === undefined
        ? unique_documentation_candidate(routes, pkg.name, owner_name ?? "")
        : {
            packageName: pkg.name,
            entry,
            route: symbol_route(pkg, entry, local_owner),
            item: local_owner,
          };
    return owner === undefined || !has_rendered_member(owner.item, member_name)
      ? undefined
      : `${owner.route}#${anchor(owner_name ?? "")}-${anchor(member_name)}`;
  }
  const local = entry.exports.find((candidate) => candidate.name === target);
  if (local !== undefined) return symbol_route(pkg, entry, local);
  if (has_rendered_member(item, target)) {
    return `${symbol_route(pkg, entry, item)}#${anchor(item.name)}-${anchor(target)}`;
  }
  return unique_documentation_candidate(routes, pkg.name, target)?.route;
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
            if (documentation_link_route(pkg, entry, item, target, routes) === undefined) {
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

/** A doc comment split into its body and the tags the reference renders. */
interface DocumentationParts {
  readonly body: string;
  readonly examples: readonly string[];
  /** `@see` targets as Markdown list items. */
  readonly related: readonly string[];
  /** `@param` descriptions by parameter name. */
  readonly parameters: ReadonlyMap<string, string>;
  readonly returns?: string;
  /** `@throws` texts: the error, then when it is thrown. */
  readonly throws: readonly string[];
}

/** The tags a doc comment is split on; everything else stays in the body. */
const DOCUMENTATION_TAG = /(?:^|\n)@(example|see|param|returns?|throws)\b\s*/;

function documentation_parts(
  documentation: string,
  pkg: ApiPackage,
  entry: ApiEntryPoint,
  item: ApiExport,
  routes: DocumentationLinkRoutes,
): DocumentationParts {
  const sections = documentation.split(new RegExp(DOCUMENTATION_TAG, "g"));
  const examples: string[] = [];
  const related: string[] = [];
  const parameters = new Map<string, string>();
  const throws: string[] = [];
  let returns: string | undefined;
  for (let index = 1; index < sections.length; index += 2) {
    const tag = sections[index];
    const value = sections[index + 1]?.trim() ?? "";
    if (tag === "example") {
      examples.push(value.replace(/^```(ts|tsx)(?:\s+compile)?\s*$/gm, "```$1 compile"));
    } else if (tag === "see") {
      const link = /^\{@link\s+([^\s|}]+)(?:\s*\|\s*([^}]+))?\}$/.exec(value);
      const target = link?.[1] ?? value;
      const label = link?.[2]?.trim() || target;
      const route = documentation_link_route(pkg, entry, item, target, routes);
      related.push(route === undefined ? `- ${value}` : `- [${label}](${route})`);
    } else if (tag === "param") {
      const parameter = /^([\w$.]+)\s*(?:-\s*)?([\s\S]*)$/.exec(value);
      if (parameter?.[1] !== undefined) {
        parameters.set(parameter[1], (parameter[2] ?? "").replace(/\s+/g, " ").trim());
      }
    } else if (tag === "throws") {
      throws.push(value.replace(/\s+/g, " ").trim());
    } else {
      returns = value.replace(/\s+/g, " ").trim();
    }
  }
  return { body: sections[0]?.trim() ?? "", examples, related, parameters, returns, throws };
}

/**
 * JSDoc body, examples and related links. `heading_level` places the Examples
 * and See also headings one level below whatever holds the text: 2 for a
 * symbol page's opening summary (under the page title), 4 for a member's
 * documentation (under its group heading in Members), so heading levels never
 * skip.
 */
function documentation_sections(
  documentation: string,
  pkg: ApiPackage,
  entry: ApiEntryPoint,
  item: ApiExport,
  routes: DocumentationLinkRoutes,
  heading_level: 2 | 3 | 4,
): string {
  const heading = "#".repeat(heading_level);
  const { body, examples, related } = documentation_parts(documentation, pkg, entry, item, routes);
  const blocks = [body];
  if (examples.length > 0) blocks.push(`${heading} Examples`, ...examples);
  if (related.length > 0) blocks.push(`${heading} See also`, related.join("\n"));
  return blocks.join("\n\n");
}

/** Replaces `{@link …}` with a Markdown link to the target's page, or inline code. */
function resolve_documentation_links(
  markdown: string,
  pkg: ApiPackage,
  entry: ApiEntryPoint,
  item: ApiExport,
  routes: DocumentationLinkRoutes,
): string {
  return markdown.replace(
    /\{@link\s+([^\s|}]+)(?:\s*\|\s*([^}]+))?\}/g,
    (_match, target: string, label: string | undefined) => {
      const text = label?.trim() || target;
      const route = documentation_link_route(pkg, entry, item, target, routes);
      return route === undefined ? `\`${text}\`` : `[\`${text}\`](${route})`;
    },
  );
}

function documentation_markdown(
  pkg: ApiPackage,
  entry: ApiEntryPoint,
  item: ApiExport,
  routes: DocumentationLinkRoutes = new Map(),
  source = item.documentation,
  heading_level: 2 | 3 | 4 = 3,
): string {
  const documentation =
    source.trim() || "Source summary unavailable; docs:check rejects this omission.";
  return resolve_documentation_links(
    documentation_sections(documentation, pkg, entry, item, routes, heading_level),
    pkg,
    entry,
    item,
    routes,
  );
}

function member_documentation_html(
  pkg: ApiPackage,
  entry: ApiEntryPoint,
  item: ApiExport,
  documentation: string,
  routes: DocumentationLinkRoutes,
): string {
  return html(documentation)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(
      /\{@link\s+([^\s|}]+)(?:\s*\|\s*([^}]+))?\}/g,
      (_match, target: string, label: string | undefined) => {
        const text = label?.trim() || target;
        const route = documentation_link_route(pkg, entry, item, target, routes);
        return route === undefined
          ? `<code>${text}</code>`
          : `<a href="${route}"><code>${text}</code></a>`;
      },
    );
}

/**
 * A member card's `@param`, `@returns` and `@throws` as labelled lines, so they
 * read as a compact list instead of raw tags inside the description.
 */
function member_tags_html(
  pkg: ApiPackage,
  entry: ApiEntryPoint,
  item: ApiExport,
  parts: DocumentationParts,
  routes: DocumentationLinkRoutes,
): string | undefined {
  const describe = (text: string): string =>
    member_documentation_html(pkg, entry, item, text, routes);
  const rows = [
    ...[...parts.parameters].map(
      ([name, text]) =>
        `<div><dt>Parameter</dt><dd><code>${html(name)}</code> ${describe(text)}</dd></div>`,
    ),
    ...(parts.returns === undefined
      ? []
      : [`<div><dt>Returns</dt><dd>${describe(parts.returns)}</dd></div>`]),
    ...parts.throws.map((text) => `<div><dt>Throws</dt><dd>${describe(text)}</dd></div>`),
  ];
  return rows.length === 0 ? undefined : `<dl class="api-card__tags">${rows.join("")}</dl>`;
}

/** One card per `@throws`: the error, then when it is thrown. */
function throws_card_html(description_html: string): string {
  return `<div class="api-card api-field"><p class="api-card__doc">${description_html}</p></div>`;
}

/**
 * The first sentence of a doc comment as one line. Inline code keeps its
 * backticks when the summary is rendered as HTML (member rows); search and
 * social descriptions are plain text.
 */
function compact_summary(markdown: string, keep_inline_code = false): string {
  const plain = markdown
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(keep_inline_code ? /[*_~]/g : /[`*_~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const first_sentence = /^.{24,240}?[.!?](?=\s|$)/.exec(plain)?.[0];
  if (first_sentence !== undefined) return first_sentence;
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
function symbol_description(
  name: string,
  kind: string,
  package_label: string,
  summary: string,
): string {
  const text = `${name} ${kind} in ${package_label}: ${summary}`;
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
const declaration_shapes = new Map<string, DeclarationShape>();

/**
 * Parse declarations with the TypeScript 7 API: each signature becomes a file in a scratch
 * inferred project, printed by its emitter and read back as `typescript/unstable/ast` nodes.
 */
export async function prepareDeclarationShapes(signatures: Iterable<string>): Promise<void> {
  const pending = [...new Set(signatures)].filter(
    (signature) => !declaration_shapes.has(signature),
  );
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
        declaration_shapes.set(
          declaration.signature,
          await read_declaration_shape(project, declaration.path, declaration.signature),
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

async function read_declaration_shape(
  project: Project,
  path: string,
  signature: string,
): Promise<DeclarationShape> {
  const source_file = await project.program.getSourceFile(path);
  const declaration = source_file?.statements[0];

  if (source_file === undefined || declaration === undefined) {
    return { formatted: signature, members: [], variants: [] };
  }

  const member_nodes: readonly Node[] =
    isInterfaceDeclaration(declaration) || isClassDeclaration(declaration)
      ? declaration.members
      : isTypeAliasDeclaration(declaration) && isTypeLiteralNode(declaration.type)
        ? declaration.type.members
        : [];

  return {
    formatted: await project.emitter.printNode(declaration),
    members: member_nodes.map((member, index) => ({
      name: declaration_member_name(member, index, source_file),
      signature: member.getText(source_file).replace(/\s+/g, " ").trim(),
    })),
    variants:
      isTypeAliasDeclaration(declaration) && isUnionTypeNode(declaration.type)
        ? declaration.type.types.map((variant) =>
            variant.getText(source_file).replace(/\s+/g, " ").trim(),
          )
        : [],
  };
}

function declaration_member_name(member: Node, index: number, source_file: SourceFile): string {
  const named = member as Node & { name?: Node };
  if (named.name !== undefined) {
    return named.name.getText(source_file).replace(/^["']|["']$/g, "");
  }
  if (isConstructorDeclaration(member)) return "constructor";
  if (isCallSignatureDeclaration(member)) return "call";
  if (isConstructSignatureDeclaration(member)) return "new";
  if (isIndexSignatureDeclaration(member)) return "index";
  return `member-${index + 1}`;
}

function declaration_shape(signature: string): DeclarationShape {
  return declaration_shapes.get(signature) ?? { formatted: signature, members: [], variants: [] };
}

/**
 * Split `text` on `separator` where it is not nested in brackets and not inside a
 * string literal. Member signatures are one-liners, so a single scan is enough.
 */
function split_top_level(text: string, separator: string): string[] {
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
function member_type_parts(signature: string): MemberTypeParts | undefined {
  const parts = split_top_level(signature, ":");
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
function literal_union_key(literals: readonly string[]): string {
  return [...new Set(literals)].sort().join("\u0000");
}

function string_literal_union_variants(type: string): string[] | undefined {
  const variants = split_top_level(type, "|").map((variant) => variant.trim());
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
async function union_alias_index(
  pkg: ApiPackage,
  entry: ApiEntryPoint,
  routes: DocumentationLinkRoutes,
): Promise<Map<string, UnionAlias>> {
  const candidates = [...routes.values()].flat().filter(({ item }) => item.kind === "type");
  if (candidates.length === 0) return new Map();
  await prepareDeclarationShapes(candidates.map(({ item }) => parseableDeclaration(item)));
  const by_literal_set = new Map<
    string,
    Array<UnionAlias & { entry: ApiEntryPoint; packageName: string }>
  >();
  for (const candidate of candidates) {
    const shape = declaration_shape(parseableDeclaration(candidate.item));
    let literals: string[] | undefined;
    if (shape.variants.length > 0) {
      literals = string_literal_union_variants(shape.variants.join(" | "));
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
          : closest_candidate(
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
    const key = literal_union_key(literals);
    const resolved = by_literal_set.get(key) ?? [];
    resolved.push({
      name: candidate.item.name,
      route: candidate.route,
      entry: candidate.entry,
      packageName: candidate.packageName,
    });
    by_literal_set.set(key, resolved);
  }
  const aliases = new Map<string, UnionAlias>();
  for (const [key, resolved] of by_literal_set) {
    const chosen = closest_candidate(resolved, pkg.name, entry);
    if (chosen !== undefined) aliases.set(key, { name: chosen.name, route: chosen.route });
  }
  return aliases;
}

interface SymbolReference {
  readonly packageName: string;
  readonly name: string;
  readonly route: string;
}

/**
 * The reverse index behind "Referenced by", built once per generation: the
 * documented exports whose declaration names a symbol. It comes from the API
 * manifest, so the section never claims a reference the repository cannot show.
 */
export interface ConsumerIndex {
  readonly references: ReadonlyMap<string, readonly SymbolReference[]>;
}

const EMPTY_CONSUMER_INDEX: ConsumerIndex = { references: new Map() };

export function consumerIndex(manifest: PublicApiManifest): ConsumerIndex {
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
            { packageName: pkg.name, name: item.name, route: symbol_route(pkg, entry, item) },
          ]);
        }
      }
    }
  }
  return { references };
}

/**
 * "Referenced by": the public exports whose declarations name the symbol. The
 * section is left out when there are none. Every page of a package would list
 * the same dependent packages, so they are not shown.
 */
function render_referenced_by(pkg: ApiPackage, item: ApiExport, consumers: ConsumerIndex): string {
  const references = (consumers.references.get(item.name) ?? []).filter(
    (reference) => !(reference.packageName === pkg.name && reference.name === item.name),
  );
  if (references.length === 0) return "";
  const body = [
    "## Referenced by",
    "",
    '<div class="api-consumers" data-pagefind-ignore>',
    `<p class="api-consumers-label">Public exports naming <code>${html(item.name)}</code></p>`,
    "",
    '<ul class="api-consumer-list">',
    ...references
      .slice(0, REFERENCE_DISPLAY_LIMIT)
      .map(
        (reference) =>
          `<li><a href="${reference.route}"><code>${html(reference.name)}</code></a><span class="api-consumer-kind">${html(reference.packageName)}</span></li>`,
      ),
  ];
  if (references.length > REFERENCE_DISPLAY_LIMIT) {
    body.push(
      `<li class="api-consumer-more">and ${references.length - REFERENCE_DISPLAY_LIMIT} more</li>`,
    );
  }
  body.push("</ul>", "</div>", "");
  return body.join("\n");
}

/** One parameter of a function's first call signature. */
interface ParameterField {
  readonly name: string;
  readonly type: string;
  readonly optional: boolean;
}

/** A function's first call signature, as reference fields. */
interface FunctionFields {
  readonly parameters: readonly ParameterField[];
  readonly returns: string;
}

/**
 * Splits `text` on top-level commas: not inside brackets, braces, parentheses,
 * type arguments or string literals. An arrow's `=>` is not a closing bracket.
 */
function split_top_level_commas(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | undefined;
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index] ?? "";
    if (quote !== undefined) {
      if (character === quote && text[index - 1] !== "\\") quote = undefined;
    } else if (character === '"' || character === "'" || character === "`") {
      quote = character;
    } else if ("([{<".includes(character)) {
      depth += 1;
    } else if (")]}".includes(character) || (character === ">" && text[index - 1] !== "=")) {
      depth -= 1;
    } else if (character === "," && depth === 0) {
      parts.push(text.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(text.slice(start));
  return parts.map((part) => part.trim()).filter((part) => part.length > 0);
}

/** The index of the bracket that closes the one at `open`. */
function closing_index(text: string, open: number): number {
  const pairs: Record<string, string> = { "(": ")", "<": ">" };
  const opener = text[open] ?? "";
  const closer = pairs[opener];
  let depth = 0;
  for (let index = open; index < text.length; index += 1) {
    const character = text[index];
    if (character === opener) depth += 1;
    else if (character === closer && !(closer === ">" && text[index - 1] === "=")) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

/**
 * The parameters and return type of a function's first call signature, given
 * as the manifest records it (`<T>(a: A, b?: B): R`) or as a declaration
 * (`function name(…): R`); undefined when neither shape matches.
 */
export function functionFields(signature: string, name: string): FunctionFields | undefined {
  const declared = signature.indexOf(`function ${name}`);
  let open = declared === -1 ? 0 : declared + `function ${name}`.length;
  if (signature[open] === "<") open = closing_index(signature, open) + 1;
  if (signature[open] !== "(") return undefined;
  const close = closing_index(signature, open);
  if (close === -1) return undefined;
  const parameters = split_top_level_commas(signature.slice(open + 1, close)).map((parameter) => {
    const colon = parameter.indexOf(":");
    const head = (colon === -1 ? parameter : parameter.slice(0, colon)).trim();
    const optional = head.endsWith("?");
    return {
      name: head.replace(/\?$/, ""),
      type: colon === -1 ? "unknown" : parameter.slice(colon + 1).trim(),
      optional,
    };
  });
  const returns =
    /^\s*:\s*([\s\S]*?)\s*;?\s*(?:\n|$)/.exec(signature.slice(close + 1))?.[1] ?? "void";
  return { parameters, returns };
}

/** A type in a field, with each documented type name linked to its page. */
function linked_type_html(
  type: string,
  pkg: ApiPackage,
  entry: ApiEntryPoint,
  item: ApiExport,
  routes: DocumentationLinkRoutes,
): string {
  return html(type).replace(/\b[A-Z][A-Za-z0-9_]*\b/g, (name) => {
    const route = documentation_link_route(pkg, entry, item, name, routes);
    return route === undefined ? name : `<a href="${route}">${name}</a>`;
  });
}

/**
 * One field card: its signature line (name, type and a required or optional
 * marker; no name for a return value) over its description.
 */
function field_html(
  id: string,
  name: string | undefined,
  type_html: string,
  marker: "required" | "optional" | undefined,
  description_html: string | undefined,
): string {
  const label =
    name === undefined
      ? ""
      : `<span class="api-sig__name">${html(name)}</span><span class="api-sig__punct">${marker === "optional" ? "?" : ""}: </span>`;
  return [
    `<div class="api-card api-field" id="${id}">`,
    '<div class="api-card__head">',
    `<code class="api-sig">${label}<span class="api-sig__type">${type_html}</span></code>`,
    marker === undefined ? "" : `<span class="api-card__flags"><span>${marker}</span></span>`,
    "</div>",
    description_html === undefined || description_html === ""
      ? ""
      : `<p class="api-card__doc">${description_html}</p>`,
    "</div>",
  ]
    .filter((line) => line !== "")
    .join("");
}

/**
 * Without its own description, a field named by one documented type reads
 * that type's summary.
 */
function field_type_summary(
  type: string,
  pkg: ApiPackage,
  routes: DocumentationLinkRoutes,
): string | undefined {
  if (!/^[A-Z][A-Za-z0-9_]*$/.test(type)) return undefined;
  const target = unique_documentation_candidate(routes, pkg.name, type)?.item.documentation;
  return target === undefined || target.trim() === ""
    ? undefined
    : compact_summary(target.split(/\n@/)[0] ?? "", true);
}

/** `void` and `Promise<void>`: a return value with nothing to describe. */
function returns_nothing(type: string): boolean {
  return /^(?:void|Promise<void>)$/.test(type.replace(/\s+/g, ""));
}

/** A function's Parameters and Returns sections as fields; no Returns for `void`. */
function render_function_fields(
  fields: FunctionFields,
  parts: DocumentationParts,
  pkg: ApiPackage,
  entry: ApiEntryPoint,
  item: ApiExport,
  routes: DocumentationLinkRoutes,
): string {
  const describe = (text: string | undefined): string | undefined =>
    text === undefined ? undefined : member_documentation_html(pkg, entry, item, text, routes);
  const type_summary = (type: string): string | undefined => field_type_summary(type, pkg, routes);
  const blocks: string[] = [];
  if (fields.parameters.length > 0) {
    blocks.push(
      "## Parameters",
      "",
      '<div class="api-cards">',
      ...fields.parameters.map((parameter) =>
        field_html(
          `parameter-${anchor(parameter.name.replace(/^\.\.\./, ""))}`,
          parameter.name,
          linked_type_html(parameter.type, pkg, entry, item, routes),
          parameter.optional ? "optional" : "required",
          describe(
            parts.parameters.get(parameter.name.replace(/^\.\.\./, "")) ??
              type_summary(parameter.type),
          ),
        ),
      ),
      "</div>",
      "",
    );
  }
  // A function that returns nothing has no Returns card.
  if (!returns_nothing(fields.returns)) {
    blocks.push(
      "## Returns",
      "",
      '<div class="api-cards">',
      field_html(
        "returns",
        undefined,
        linked_type_html(fields.returns, pkg, entry, item, routes),
        undefined,
        describe(parts.returns ?? type_summary(fields.returns)),
      ),
      "</div>",
      "",
    );
  }
  if (parts.throws.length > 0) {
    blocks.push(
      "## Throws",
      "",
      '<div class="api-cards">',
      ...parts.throws.map((text) => throws_card_html(describe(text) ?? "")),
      "</div>",
      "",
    );
  }
  return blocks.join("\n");
}

async function render_declaration(signature: string, expanded: boolean): Promise<string> {
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

/** The groups a symbol's members are listed in, in page order. */
const MEMBER_GROUPS = ["Properties", "Methods", "Events"] as const;
type MemberGroup = (typeof MEMBER_GROUPS)[number];

const MEMBER_MODIFIER =
  /^(?:readonly|static|abstract|public|protected|private|declare|get|set|async)\s+/;

/** A member's declaration without its leading modifiers (`readonly`, `static`, …). */
function member_head(signature: string): string {
  let head = signature.trimStart();
  while (MEMBER_MODIFIER.test(head)) head = head.replace(MEMBER_MODIFIER, "");
  return head;
}

/**
 * Callbacks named `on…` are events. Methods are members declared with a call
 * signature, or as a property whose type is a function (`run: () => void`).
 */
function member_group(member: DeclarationMember): MemberGroup {
  if (/^on[A-Z]/.test(member.name)) return "Events";
  const head = member_head(member.signature);
  if (head.startsWith(member.name) && /^\??\s*[<(]/.test(head.slice(member.name.length))) {
    return "Methods";
  }
  const type = member_type_parts(head)?.type ?? "";
  return /^(?:<[^>]*>\s*)?\([^]*\)\s*=>/.test(type) && split_top_level(type, "|").length === 1
    ? "Methods"
    : "Properties";
}

/**
 * The Members section: an index of member names for long lists, then the
 * members as signature cards grouped into Properties, Methods and Events. A
 * card's header is the member's highlighted declaration; its documentation
 * follows, always visible.
 */
function render_members(
  pkg: ApiPackage,
  entry: ApiEntryPoint,
  item: ApiExport,
  members: readonly DeclarationMember[],
  routes: DocumentationLinkRoutes,
  aliases: ReadonlyMap<string, UnionAlias>,
): string {
  const search_targets = new Set<string>(
    REQUIRED_SEARCH_TARGETS.filter(
      (target) =>
        target.packageName === pkg.name &&
        target.subpath === entry.subpath &&
        target.owner === item.name,
    ).map(({ term }) => term),
  );
  const member_docs = new Map(
    rendered_member_docs(item).map((member) => [member.name, member.documentation]),
  );
  const documented = new Set<string>();
  const index_links: string[] = [];
  const used_ids = new Set<string>();
  const cards = members.map((member, index) => {
    // Overload rows repeat a member name. The first row keeps the member ID
    // that the index and other pages link to; each later row gets a suffix,
    // so no two elements share an ID.
    const member_id = `${anchor(item.name)}-${anchor(member.name) || index + 1}`;
    const first_row = !used_ids.has(member_id);
    let id = member_id;
    for (let overload = 2; used_ids.has(id); overload += 1) id = `${member_id}-${overload}`;
    used_ids.add(id);
    if (first_row) index_links.push(`<a href="#${id}"><code>${html(member.name)}</code></a>`);
    const search_anchor =
      first_row && search_targets.has(member.name)
        ? `<h4 id="${member.name.toLowerCase()}" class="api-search-anchor">${html(member.name)}</h4>`
        : "";
    // Overload rows repeat a member name; the merged documentation renders once,
    // on the first row.
    const documentation = documented.has(member.name) ? undefined : member_docs.get(member.name);
    if (documentation !== undefined) documented.add(member.name);
    const parts = member_type_parts(member.signature);
    const variants = parts === undefined ? undefined : string_literal_union_variants(parts.type);
    const alias = variants === undefined ? undefined : aliases.get(literal_union_key(variants));
    // The alias names the type; its expansion stays in the Declaration section.
    const signature =
      alias === undefined || parts === undefined
        ? member.signature
        : `${parts.prefix} ${alias.name}${parts.terminated ? ";" : ""}`;
    const head = member_head(member.signature);
    const flags = [
      /^\s*readonly\s/.test(member.signature) ? "<span>read-only</span>" : "",
      head.startsWith(`${member.name}?`) ? "<span>optional</span>" : "",
      alias === undefined
        ? ""
        : `<span class="api-member-alias"><a href="${alias.route}"><code>${html(alias.name)}</code></a></span>`,
    ].join("");
    const doc_parts =
      documentation === undefined
        ? undefined
        : documentation_parts(documentation, pkg, entry, item, routes);
    const tags =
      doc_parts === undefined ? undefined : member_tags_html(pkg, entry, item, doc_parts, routes);
    const body =
      documentation === undefined || doc_parts === undefined
        ? []
        : [
            /(?:^|\n)@(example|see)\b/.test(documentation)
              ? `${documentation_markdown(pkg, entry, item, routes, documentation, 4)}\n`
              : doc_parts.body === ""
                ? ""
                : `<p class="api-card__doc">${member_documentation_html(pkg, entry, item, doc_parts.body, routes)}</p>`,
            ...(tags === undefined ? [] : [tags]),
          ].filter((block) => block !== "");
    const card = [
      search_anchor,
      `<article class="api-card api-member" id="${id}" data-member="${html(member.name)}" data-pagefind-weight="${search_targets.has(member.name) ? "10" : "1"}">`,
      '<div class="api-card__head">',
      "",
      // A fenced block so member signatures get real syntax highlighting; the
      // member grammar reads a lone `readonly name: Type;` as a class member.
      "```ts-member generated",
      signature,
      "```",
      "",
      ...(flags === "" ? [] : [`<span class="api-card__flags">${flags}</span>`, ""]),
      "</div>",
      "",
      ...body,
      "</article>",
    ].join("\n");
    return { group: member_group(member), card };
  });
  // Overloads share one entry in the index.
  const member_count = new Set(members.map((member) => member.name)).size;
  const index =
    member_count <= MEMBER_INDEX_MINIMUM
      ? []
      : [
          `<nav class="api-member-index" aria-label="Members" data-pagefind-ignore>${index_links.join("")}</nav>`,
          "",
        ];
  const groups = MEMBER_GROUPS.flatMap((group) => {
    const grouped = cards.filter((card) => card.group === group);
    return grouped.length === 0
      ? []
      : [
          `<h3 class="api-member-group">${group}</h3>`,
          "",
          '<div class="api-cards">',
          ...grouped.map(({ card }) => card),
          "</div>",
          "",
        ];
  });
  return ["## Members", "", ...index, ...groups].join("\n");
}

/** Page slugs by entry point, worked out once per entry: a slug depends on its neighbours' names. */
const entry_page_slugs = new WeakMap<ApiEntryPoint, ReadonlyMap<string, string>>();

/**
 * Where an export's page lives under the docs content root, without the
 * extension: `api/<entry>/<slug>`. Names that fold to one slug get a kind
 * suffix (api-page-slugs.ts).
 */
export function symbolPagePath(pkg: ApiPackage, entry: ApiEntryPoint, item: ApiExport): string {
  let slugs = entry_page_slugs.get(entry);
  if (slugs === undefined) {
    slugs = apiPageSlugs(entry.exports);
    entry_page_slugs.set(entry, slugs);
  }
  const slug = slugs.get(item.name);
  if (slug === undefined) {
    throw new Error(`${pkg.name} ${entry.subpath} does not export ${item.name}`);
  }
  return `api/${entrySlug(pkg.name, entry.subpath)}/${slug}`;
}

function symbol_route(pkg: ApiPackage, entry: ApiEntryPoint, item: ApiExport): string {
  return `/docs/${symbolPagePath(pkg, entry, item)}/`;
}

export async function renderSymbolPage(
  pkg: ApiPackage,
  entry: ApiEntryPoint,
  item: ApiExport,
  routes: DocumentationLinkRoutes = new Map(),
  consumers: ConsumerIndex = EMPTY_CONSUMER_INDEX,
): Promise<string> {
  const label = entryLabel(pkg, entry);
  const source = repository_source_path(package_source_path(pkg.name, item.source), item.name);
  const parts = documentation_parts(
    item.documentation.trim() || "Source summary unavailable; docs:check rejects this omission.",
    pkg,
    entry,
    item,
    routes,
  );
  const summary = resolve_documentation_links(parts.body, pkg, entry, item, routes);
  const declaration = parseableDeclaration(item);
  await prepareDeclarationShapes([declaration]);
  const shape = declaration_shape(declaration);
  const description = symbol_description(item.name, item.kind, label, compact_summary(summary));
  const aliases = await union_alias_index(pkg, entry, routes);
  const fields = item.kind === "function" ? functionFields(item.signature, item.name) : undefined;
  // A variants section earns its space only for structured unions; scalar
  // unions read best inline in the (expanded) declaration, where identifiers
  // are highlighted, hoverable, and linked.
  const structured_variants = shape.variants.some((variant) => variant.includes("{"))
    ? shape.variants
    : [];
  // One consistent model: the code section is always "Declaration", always
  // pretty-printed. When no Members or Variants section tells the story, it is
  // the page's primary content: it opens right under the summary, so the
  // signature comes before the examples and fields. Otherwise it closes the
  // page, collapsed.
  const is_declaration_primary = shape.members.length === 0 && structured_variants.length === 0;
  const declaration_section = [
    "## Declaration",
    "",
    await render_declaration(
      // `declare` is parser scaffolding, not information a reader needs.
      shape.formatted.replace(/^declare /, ""),
      is_declaration_primary,
    ),
    "",
  ];

  // The examples follow the summary; at desktop width they sit in an aside
  // beside the summary and the rest of the reference.
  const has_aside = parts.examples.length > 0;
  const body = [
    frontmatter(`${item.name} | ${label}`, description, item.kind).trimEnd(),
    `<!-- api-export:${pkg.name}|${entry.subpath}|${item.name} -->`,
    "",
    ...(has_aside ? ['<div class="api-layout">', "", '<div class="api-layout__summary">', ""] : []),
    summary,
    "",
    '<dl class="api-metadata" data-pagefind-ignore>',
    source_row(source),
    "</dl>",
    "",
    ...(is_declaration_primary ? declaration_section : []),
  ];
  if (has_aside) {
    body.push(
      "</div>",
      "",
      '<aside class="api-layout__aside" aria-label="Examples">',
      "",
      "## Examples",
      "",
      ...parts.examples.map((example) =>
        resolve_documentation_links(example, pkg, entry, item, routes),
      ),
      "",
      "</aside>",
      "",
      '<div class="api-layout__body">',
      "",
    );
  }
  if (fields !== undefined) {
    body.push(render_function_fields(fields, parts, pkg, entry, item, routes));
  }
  if (parts.related.length > 0) {
    body.push(
      "## See also",
      "",
      resolve_documentation_links(parts.related.join("\n"), pkg, entry, item, routes),
      "",
    );
  }
  const members = rendered_members(item);
  if (members.length > 0) {
    body.push(render_members(pkg, entry, item, members, routes, aliases), "");
  }

  if (structured_variants.length > 0) {
    body.push(
      `## Variants <span class="api-count" data-pagefind-ignore>${structured_variants.length}</span>`,
      "",
      '<div class="api-variant-list" data-pagefind-ignore>',
    );
    for (const variant of structured_variants) {
      const formatted = await formatTypeExpression(variant);
      body.push('<div class="api-variant">', "", "```ts generated", formatted, "```", "", "</div>");
    }
    body.push("</div>", "");
  }

  body.push(
    ...(is_declaration_primary ? [] : declaration_section),
    render_referenced_by(pkg, item, consumers),
  );
  if (has_aside) body.push("</div>", "", "</div>");
  return `${body.join("\n").trimEnd()}\n`;
}

/** The metadata row linking a page's source file in the repository; build output has no link. */
function source_row(source: string): string {
  if (BUILD_OUTPUT.test(source)) {
    return `<div><dt>Source</dt><dd><code>${html(source)}</code> (generated at build time)</dd></div>`;
  }
  return `<div><dt>Source</dt><dd><a href="${html(repositorySourceUrl(source))}"><code>${html(source)}</code></a></dd></div>`;
}

const EXPORT_COUNT_LIST = new Intl.ListFormat("en", { type: "conjunction" });

/**
 * An entry page's lead: what the entry point holds, by kind, so it says more
 * than the title.
 */
function entry_lead(label: string, entry: ApiEntryPoint): string {
  if (entry.kind === "asset") return `${label} is a CSS or binary asset entry point.`;
  if (entry.exports.length === 0) return `${label} exports no named symbols.`;
  const counts = [...Map.groupBy(entry.exports, (item) => item.kind)]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([kind, items]) => {
      const plural = (KIND_LABELS[kind] ?? `${kind}s`).toLowerCase();
      return `${items.length} ${items.length === 1 ? kind : plural}`;
    });
  return `The ${entry.exports.length} exports of ${label}, by kind: ${EXPORT_COUNT_LIST.format(counts)}.`;
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
    frontmatter(
      label,
      entry_lead(label, entry),
      undefined,
      entry.kind === "asset" ? undefined : entry.exports.length,
    ).trimEnd(),
    `<span class="api-status" data-status="${entry.classification}">${entry.classification}</span>`,
    "",
    `**${status}.** Import this entry point as \`${label}\`.`,
    "",
    '<dl class="api-metadata" data-pagefind-ignore>',
    `<div><dt>Declaration target</dt><dd><code>${html(entry.target)}</code></dd></div>`,
    `<div><dt>Exports</dt><dd>${entry.exports.length}</dd></div>`,
    ...(entry.source === undefined
      ? []
      : [source_row(package_source_path(pkg.name, entry.source))]),
    "</dl>",
    "",
  ];
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
          const summary = compact_summary(documentation_markdown(pkg, entry, item, routes));
          return [
            `<a class="api-symbol-card" href="${symbol_route(pkg, entry, item)}">`,
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

/** What each package is for, in one line, at the top of its section on the API index. */
const PACKAGE_PURPOSES: Readonly<Record<string, string>> = {
  "@sheetwrite/core": "The grid and the workbook: create a grid, edit, format and listen to it.",
  "@sheetwrite/wasm":
    "The default formula engine and cell store. `initSheetwrite` loads it; most apps never import it.",
  "@sheetwrite/formulas":
    "The full formula engine: the default engine plus pivots, the data model and the analysis functions.",
  "@sheetwrite/xlsx": "Read and write Excel files.",
  "@sheetwrite/charts": "Draw charts over cell ranges.",
  "@sheetwrite/formula-assist":
    "Suggest the rest of a formula in the formula bar, accepted with Tab.",
  "@sheetwrite/queries": "Saved queries that load CSV, JSON or your own data into tables.",
  "@sheetwrite/react": "The grid as a React component.",
  "@sheetwrite/vue": "The grid as a Vue component.",
  "@sheetwrite/svelte": "The grid as a Svelte component.",
};

export function renderApiIndex(manifest: PublicApiManifest): string {
  const lines = [
    frontmatter(
      "API reference",
      "Every public function, class, type and constant in the Sheetwrite packages.",
    ).trimEnd(),
    "Each package below says what it is for, then lists the paths you import from and how many names each one exports.",
    "",
  ];
  for (const pkg of manifest.packages) {
    const purpose = PACKAGE_PURPOSES[pkg.name];
    if (purpose === undefined) {
      throw new Error(`${pkg.name} has no line in PACKAGE_PURPOSES for the API index`);
    }
    lines.push(
      `## ${pkg.name}`,
      "",
      purpose,
      "",
      '<table class="api-entry-table">',
      "<thead><tr><th>Import path</th><th>Status</th><th>Names</th></tr></thead>",
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
      ([old_route, page]) => `| \`${old_route}\` | [${page.to}](${page.to}) |`,
    ),
    "",
    "## Former repository guides",
    "",
    "Each guide that was a file in the repository has a page in the docs site.",
    "",
    '<div class="sw-card-group sw-moved-guides" data-cols="2">',
  ];
  const guides = new Map<string, string[]>();
  for (const [old_path, route] of Object.entries(MIGRATION_ROUTES)) {
    guides.set(route, [...(guides.get(route) ?? []), old_path]);
  }
  for (const [route, old_paths] of guides) {
    const title = readableId(route.split("/").filter(Boolean).at(-1) ?? route);
    lines.push(
      `<a class="sw-doc-card" href="${html(route)}"><span class="sw-card__title">${html(title)}</span><span class="sw-card__body">${old_paths.map((path) => `<code>${html(path)}</code>`).join(" ")}</span></a>`,
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
  const anchors_of = (route: string): Set<string> | undefined => {
    const path = contentPathForRoute(route, documents);
    const document = documents.find((item) => item.path === path);
    return document === undefined ? undefined : headingAnchors(document.content);
  };
  const resolves = (link: string): boolean => {
    const [route = "", fragment] = link.split("#", 2);
    const anchors = anchors_of(route);
    if (anchors === undefined) return false;
    return fragment === undefined || anchors.has(fragment);
  };
  for (const [old_route, page] of Object.entries(movedPages)) {
    if (contentPathForRoute(old_route, documents) !== undefined) {
      failures.push(`moved page still has content: ${old_route}`);
    }
    if (!resolves(page.to))
      failures.push(`moved page ${old_route} forwards to a missing page: ${page.to}`);
    for (const [anchor, target] of Object.entries(page.anchors)) {
      if (!resolves(target)) {
        failures.push(`moved page ${old_route}#${anchor} forwards to a missing target: ${target}`);
      }
    }
  }
  // A heading that left a page which kept its address: the heading must be
  // gone from that page, or forwarding would take readers away from it.
  for (const [route, headings] of Object.entries(movedHeadings)) {
    const kept = anchors_of(route);
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

/** What a package's reference pages show without a description. */
export interface UndocumentedApi {
  readonly packageName: string;
  /** Members of interfaces and classes with no doc comment (`Owner.member`; overloads once). */
  readonly members: readonly string[];
  /**
   * Function parameters with neither an `@param` nor a documented type to fall
   * back on (`fn(name)`). Once a function has one `@param`, every parameter
   * needs its own, because the code hover panel lists only the tagged ones.
   */
  readonly parameters: readonly string[];
  /**
   * Functions whose return value has neither `@returns` nor a documented type;
   * `void` and `Promise<void>` return nothing to describe.
   */
  readonly returns: readonly string[];
}

/**
 * The members, parameters and return values each package's reference shows
 * without a description, by the rules the pages render with.
 * A symbol re-exported from several entry points counts once. Declaration
 * shapes must be prepared ({@link prepareDeclarationShapes}).
 */
export function undocumentedApi(
  manifest: PublicApiManifest,
  routes: DocumentationLinkRoutes = documentationLinkRoutes(manifest),
): UndocumentedApi[] {
  return manifest.packages.map((pkg) => {
    const members = new Set<string>();
    const parameters = new Set<string>();
    const returns = new Set<string>();
    for (const entry of pkg.entryPoints) {
      for (const item of entry.exports) {
        const member_docs = new Set(
          rendered_member_docs(item)
            .filter((member) => member.documentation.trim() !== "")
            .map((member) => member.name),
        );
        for (const member of rendered_members(item)) {
          if (!member_docs.has(member.name)) members.add(`${item.name}.${member.name}`);
        }
        const fields =
          item.kind === "function" ? functionFields(item.signature, item.name) : undefined;
        if (fields === undefined) continue;
        const parts = documentation_parts(item.documentation, pkg, entry, item, routes);
        const tagged = parts.parameters.size > 0;
        for (const parameter of fields.parameters) {
          const name = parameter.name.replace(/^\.\.\./, "");
          const described = tagged
            ? parts.parameters.get(name)
            : field_type_summary(parameter.type, pkg, routes);
          if (described === undefined || described === "") parameters.add(`${item.name}(${name})`);
        }
        if (returns_nothing(fields.returns)) continue;
        const described = parts.returns ?? field_type_summary(fields.returns, pkg, routes);
        if (described === undefined || described === "") returns.add(item.name);
      }
    }
    return {
      packageName: pkg.name,
      members: [...members].sort(),
      parameters: [...parameters].sort(),
      returns: [...returns].sort(),
    };
  });
}
