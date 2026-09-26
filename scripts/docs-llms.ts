import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";

import type { ApiEntryPoint, ApiExport, ApiPackage, PublicApiManifest } from "./public-api.js";

/**
 * Plain-text documentation endpoints for AI agents:
 *
 * - `llms.txt` is the curated, task-based index an agent reads first.
 * - `llms-full.txt` is the readable text of every authored guide plus every
 *   public API declaration, so an agent can answer without parsing site HTML.
 *
 * Both files come from the authored Markdown/MDX under
 * `docs/src/content/docs` and from the compiler-verified public API manifest.
 * Presentation markup, copy controls, and page metadata are never copied
 * through: API declarations come from the manifest, and the generator-owned
 * pages (API reference pages, formula/compatibility tables, the performance
 * evidence page) are linked as HTML from the index instead of being dumped as
 * prose. The caller passes its in-memory generated file list, which is the
 * authoritative set of generator-owned pages, so this module never guesses
 * which page the generator owns and never reads a stale generated page.
 */
export const LLMS_SITE_BASE = "https://sheetwrite.vercel.app";
export const LLMS_INDEX_PATH = "docs/public/llms.txt";
export const LLMS_FULL_PATH = "docs/public/llms-full.txt";

const contentRoot = "docs/src/content/docs";

/** One generated endpoint: the absolute path to write and the exact bytes it must hold. */
export interface LlmsFile {
  readonly path: string;
  readonly content: string;
}

/** An expected generated file from `scripts/docs.ts`; the content is optional. */
export interface LlmsGeneratedFile {
  readonly path: string;
  readonly content?: string;
}

const SITE_SUMMARY =
  "Sheetwrite is a framework-agnostic, high-performance spreadsheet grid: a canvas grid backed by a Rust/WASM columnar engine, with an imperative core and React, Vue, and Svelte adapters.";

/** Curated read order for the index. `## Public API` and generated pages follow these. */
const INDEX_SECTIONS: ReadonlyArray<{
  readonly label: string;
  readonly routes: readonly string[];
}> = [
  { label: "Start", routes: ["/docs/start/installation/", "/docs/start/first-grid/"] },
  {
    label: "Ownership and lifecycle",
    routes: ["/docs/concepts/runtime-ownership/", "/docs/frameworks/lifecycle/"],
  },
  {
    label: "Framework adapters",
    routes: [
      "/docs/frameworks/vanilla/",
      "/docs/frameworks/react/",
      "/docs/frameworks/vue/",
      "/docs/frameworks/svelte/",
    ],
  },
  {
    label: "Guides",
    routes: [
      "/docs/guides/configuration/",
      "/docs/guides/interaction/",
      "/docs/guides/data-operations/",
      "/docs/guides/formulas/",
      "/docs/guides/styling/",
      "/docs/guides/persistence/",
      "/docs/guides/collaboration/",
      "/docs/guides/worker-rendering/",
      "/docs/guides/xlsx-export/",
      "/docs/guides/accessibility/",
      "/docs/guides/host-owned-rows/",
    ],
  },
  {
    label: "Contracts and reference",
    routes: [
      "/docs/reference/api-contract/",
      "/docs/reference/document-operations/",
      "/docs/reference/events-errors/",
      "/docs/reference/compatibility-limits/",
    ],
  },
];

/** What an agent needs before it can pick an entry point without inventing one. */
const AGENT_WORKFLOW: readonly string[] = [
  "Choose one base package for your framework: `@sheetwrite/core` for vanilla, or `@sheetwrite/react`, `@sheetwrite/vue`, or `@sheetwrite/svelte`. Adapters bring core and the WebAssembly engine transitively and expose a package-local `styles.css`. Add optional feature packages, such as `@sheetwrite/xlsx`, only when the relevant guide requires them.",
  "Initialize the runtime before mounting a grid. The imperative core awaits `initSheetwrite()` once per document; framework components initialize WebAssembly automatically after client mount, so server-rendered hosts need a client-only boundary.",
  "The host owns the document. Sheetwrite never mutates host rows, so read Runtime ownership and Adapter lifecycle before choosing `defaultRows` seeding or explicit `workbook` plus `data`/`datasource` ownership.",
  "Readiness is generation-scoped: adapters publish `{ grid, generation, reason }` with reason `initial`, `input-reset`, or `renderer-reset`, and replacing reset-bound inputs replaces the grid. Destroy the grid when its host element's lifetime ends.",
  "Verify every symbol, option, event, and error code against the public API declarations in `llms-full.txt` or the generated API pages before using it. Anything absent from those declarations is not public API.",
  "Recover through typed errors with stable codes (Error handling), and read Compatibility and limits before claiming Excel, Google Sheets, LibreOffice, or OpenFormula parity.",
];

interface AuthoredDocument {
  readonly route: string;
  readonly title: string;
  readonly description: string;
  readonly body: string;
}

interface GeneratedPage {
  readonly route: string;
  readonly title: string;
  readonly description: string;
}

interface GeneratedInventory {
  readonly indexPage: GeneratedPage | undefined;
  readonly pages: readonly GeneratedPage[];
}

/** Both endpoints, exactly as the docs pipeline must write them. */
export async function expectedLlmsFiles(
  manifest: PublicApiManifest,
  repositoryRoot: string,
  generatedFiles: readonly LlmsGeneratedFile[],
): Promise<LlmsFile[]> {
  const inventory = await generatedInventory(repositoryRoot, generatedFiles);
  const documents = await authoredDocuments(repositoryRoot, generatedFiles);
  const version = await releaseVersions(manifest, repositoryRoot);
  return [
    {
      path: join(repositoryRoot, LLMS_INDEX_PATH),
      content: renderIndex(manifest, documents, inventory, version),
    },
    {
      path: join(repositoryRoot, LLMS_FULL_PATH),
      content: renderFullText(manifest, documents, version),
    },
  ];
}

function toPosix(value: string): string {
  return value.split(sep).join("/");
}

function siteUrl(route: string): string {
  return `${LLMS_SITE_BASE}${route}`;
}

function absoluteUrl(url: string): string {
  return url.startsWith("/") ? siteUrl(url) : url;
}

function unquote(value: string): string {
  const match = /^(["'])(.*)\1$/.exec(value);
  return match === null ? value : match[2];
}

function parseFrontmatter(source: string): { data: ReadonlyMap<string, string>; body: string } {
  if (!source.startsWith("---\n")) return { data: new Map(), body: source };
  const end = source.indexOf("\n---", 3);
  if (end === -1) return { data: new Map(), body: source };
  const data = new Map<string, string>();
  for (const line of source.slice(4, end).split("\n")) {
    const match = /^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/.exec(line);
    if (match !== null) data.set(match[1], unquote(match[2].trim()));
  }
  return { data, body: source.slice(end + 4).replace(/^\n/, "") };
}

/** Mirrors `routeForContentPath` in scripts/docs.ts. */
function routeForContentPath(repositoryRoot: string, path: string): string {
  const relativePath = toPosix(relative(join(repositoryRoot, contentRoot), path)).replace(
    /\.mdx?$/,
    "",
  );
  const withoutIndex = relativePath === "index" ? "" : relativePath.replace(/\/index$/, "");
  return `/docs/${withoutIndex}${withoutIndex.length === 0 ? "" : "/"}`;
}

/** Mirrors `entrySlug` in scripts/docs.ts; `/docs/api/<slug>/` is the generated page. */
function entrySlug(packageName: string, subpath: string): string {
  const packageSlug = packageName.replace("@sheetwrite/", "");
  if (subpath === ".") return packageSlug;
  return `${packageSlug}-${subpath.replace(/^\.\//, "").replace(/[^a-zA-Z0-9]+/g, "-")}`;
}

/** Mirrors `entryLabel` in scripts/docs.ts. */
function entryLabel(pkg: ApiPackage, entry: ApiEntryPoint): string {
  return entry.subpath === "." ? pkg.name : `${pkg.name}/${entry.subpath.slice(2)}`;
}

/**
 * Split the generator's expected files into the pages the index links as HTML
 * (generated reference material) and the API index page. Entry and symbol pages
 * are skipped: their declarations are reproduced from the manifest instead.
 */
async function generatedInventory(
  repositoryRoot: string,
  generatedFiles: readonly LlmsGeneratedFile[],
): Promise<GeneratedInventory> {
  const documentRoot = join(repositoryRoot, contentRoot);
  const apiRoot = join(documentRoot, "api");
  const apiIndexPath = join(apiRoot, "index.md");
  const pages: GeneratedPage[] = [];
  let indexPage: GeneratedPage | undefined;
  for (const file of generatedFiles) {
    if (!file.path.startsWith(`${documentRoot}${sep}`) || !/\.mdx?$/.test(file.path)) continue;
    if (file.path !== apiIndexPath && file.path.startsWith(`${apiRoot}${sep}`)) continue;
    const page = await generatedPage(repositoryRoot, file);
    if (file.path === apiIndexPath) indexPage = page;
    else pages.push(page);
  }
  pages.sort((left, right) => left.route.localeCompare(right.route));
  return { indexPage, pages };
}

async function generatedPage(
  repositoryRoot: string,
  file: LlmsGeneratedFile,
): Promise<GeneratedPage> {
  const { data } = parseFrontmatter(file.content ?? (await readFile(file.path, "utf8")));
  const route = routeForContentPath(repositoryRoot, file.path);
  return { route, title: data.get("title") ?? route, description: data.get("description") ?? "" };
}

/** Every content page the generator does not own, in route order. */
async function authoredDocuments(
  repositoryRoot: string,
  generatedFiles: readonly LlmsGeneratedFile[],
): Promise<AuthoredDocument[]> {
  const documentRoot = join(repositoryRoot, contentRoot);
  const apiRoot = join(documentRoot, "api");
  const generated = new Set(generatedFiles.map((file) => file.path));
  const documents: AuthoredDocument[] = [];
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        // The API subtree is generated whole; a page left behind by a removed
        // symbol is still generated content, not an authored guide.
        if (path === apiRoot) continue;
        await visit(path);
        continue;
      }
      if (!entry.isFile() || !/\.mdx?$/.test(entry.name) || generated.has(path)) continue;
      const route = routeForContentPath(repositoryRoot, path);
      const { data, body } = parseFrontmatter(await readFile(path, "utf8"));
      documents.push({
        route,
        title: data.get("title") ?? route,
        description: data.get("description") ?? firstParagraph(body),
        body,
      });
    }
  };
  await visit(documentRoot);
  return documents.sort((left, right) => left.route.localeCompare(right.route));
}

/** Guides without a frontmatter description fall back to their opening sentence. */
function firstParagraph(body: string): string {
  for (const line of body.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || /^[#|<`\-*_>]|\]/u.test(trimmed)) continue;
    return truncate(plainText(trimmed), 200);
  }
  return "";
}

function truncate(value: string, limit: number): string {
  return value.length <= limit ? value : `${value.slice(0, limit - 1).trimEnd()}…`;
}

async function releaseVersions(
  manifest: PublicApiManifest,
  repositoryRoot: string,
): Promise<string> {
  const versions = new Set<string>();
  for (const pkg of manifest.packages) {
    const directory = pkg.name.replace(/^@[^/]+\//, "");
    try {
      const parsed: unknown = JSON.parse(
        await readFile(join(repositoryRoot, "packages", directory, "package.json"), "utf8"),
      );
      const version = Reflect.get(parsed as object, "version");
      if (typeof version === "string") versions.add(version);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      // A workspace without a local manifest has no version to report.
    }
  }
  return [...versions].sort().join(", ");
}

function renderIndex(
  manifest: PublicApiManifest,
  documents: readonly AuthoredDocument[],
  inventory: GeneratedInventory,
  version: string,
): string {
  const byRoute = new Map(documents.map((document) => [document.route, document]));
  const lines: string[] = ["# Sheetwrite", "", `> ${SITE_SUMMARY}`, ""];
  const release = version.length === 0 ? "" : ` at version ${version}`;
  lines.push(
    `Sheetwrite packages are released together${release}. This index is generated from the repository documentation and the compiler-verified public API manifest.`,
    "",
    "## Full text",
    "",
    `- [llms-full.txt](${siteUrl("/llms-full.txt")}): every authored guide plus every public API declaration in one plain-text file. Fetch this when you need to answer a question or write code.`,
    "",
    "## Agent workflow",
    "",
  );
  for (const [index, step] of AGENT_WORKFLOW.entries()) lines.push(`${index + 1}. ${step}`);

  const listed = new Set<string>();
  for (const section of INDEX_SECTIONS) {
    lines.push("", `## ${section.label}`, "");
    for (const route of section.routes) {
      const document = byRoute.get(route);
      if (document === undefined) throw new Error(`index route has no authored page: ${route}`);
      listed.add(route);
      lines.push(indexEntry(document));
    }
  }

  const remaining = documents.filter((document) => !listed.has(document.route));
  if (remaining.length > 0) {
    lines.push("", "## More guides", "");
    for (const document of remaining) lines.push(indexEntry(document));
  }

  if (inventory.indexPage !== undefined) {
    lines.push("", "## Public API", "");
    lines.push(
      `- [${inventory.indexPage.title}](${siteUrl(inventory.indexPage.route)})${
        inventory.indexPage.description.length === 0 ? "" : `: ${inventory.indexPage.description}`
      }`,
    );
    for (const pkg of manifest.packages) {
      const entry = pkg.entryPoints.find((candidate) => candidate.subpath === ".");
      if (entry === undefined) continue;
      const route = `/docs/api/${entrySlug(pkg.name, entry.subpath)}/`;
      lines.push(
        `- [\`${pkg.name}\`](${siteUrl(route)}): ${entry.exports.length} exports across ${pkg.entryPoints.length} entry points (primary entry point: ${entry.classification}).`,
      );
    }
    lines.push(
      `- [Public API declarations](${siteUrl("/llms-full.txt")}): every export signature grouped by package and entry point. Do not invent symbols absent from it.`,
    );
  }

  if (inventory.pages.length > 0) {
    lines.push(
      "",
      "## Generated reference pages (HTML)",
      "",
      "These pages are generated from checked inventories and evidence. Their tables are published as HTML, not reproduced as plain text, so fetch these links directly.",
      "",
    );
    for (const page of inventory.pages) {
      const suffix = page.description.length === 0 ? "" : `: ${page.description}`;
      lines.push(`- [${page.title}](${siteUrl(page.route)})${suffix}`);
    }
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

function indexEntry(document: AuthoredDocument): string {
  const suffix = document.description.length === 0 ? "" : `: ${document.description}`;
  return `- [${document.title}](${siteUrl(document.route)})${suffix}`;
}

function renderFullText(
  manifest: PublicApiManifest,
  documents: readonly AuthoredDocument[],
  version: string,
): string {
  const anchors = uniqueAnchors(documents.map((document) => document.title));
  const lines: string[] = [
    "# Sheetwrite — full documentation text",
    "",
    `> ${SITE_SUMMARY}`,
    "",
    `Every authored guide in the Sheetwrite documentation, followed by every compiler-verified public API declaration. Generated reference tables (API pages, formula functions, compatibility results, entry-point inventory, performance evidence) are published as HTML and are linked from ${siteUrl("/llms.txt")} instead of being repeated here.`,
    "",
    `Packages: ${version.length === 0 ? "versioned together" : version}. Canonical HTML: ${siteUrl("/docs/")}`,
    "",
    "## Contents",
    "",
  ];
  for (const document of documents) {
    lines.push(`- [${document.title}](#${anchors.get(document.title) ?? ""})`);
  }
  lines.push("- [Public API declarations](#public-api-declarations)", "", "## Authored guides");

  for (const document of documents) {
    lines.push("", `### ${document.title}`, "", `Source: ${siteUrl(document.route)}`, "");
    lines.push(convertDocumentBody(document.body));
  }

  lines.push(
    "",
    "## Public API declarations",
    "",
    "Every symbol below is compiler-verified from the declaration files the packages ship. Entry-point classification, signatures, and source JSDoc are the complete public surface; anything absent is not public API.",
  );
  for (const pkg of manifest.packages) {
    lines.push("", `### \`${pkg.name}\``);
    for (const entry of pkg.entryPoints) lines.push(...renderEntry(pkg, entry));
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

function renderEntry(pkg: ApiPackage, entry: ApiEntryPoint): string[] {
  const label = entryLabel(pkg, entry);
  const lines = [
    "",
    `#### \`${label}\` — ${entry.classification}`,
    "",
    `Declaration target: \`${entry.target}\``,
  ];
  if (entry.source !== undefined) lines.push(`Source entry: \`${entry.source}\``);
  lines.push(`Page: ${siteUrl(`/docs/api/${entrySlug(pkg.name, entry.subpath)}/`)}`);
  for (const item of entry.exports) lines.push(...renderExport(item));
  return lines;
}

function renderExport(item: ApiExport): string[] {
  const lines = [
    "",
    `##### \`${item.name}\` — ${item.kind}`,
    "",
    "```ts",
    ...item.signature.split("\n"),
    "```",
  ];
  const documentation = plainText(absolutizeMarkdownLinks(item.documentation));
  if (documentation.length > 0) lines.push("", documentation);
  if (item.memberDocs.length > 0) {
    lines.push("", "Members:");
    for (const member of item.memberDocs) {
      const text = plainText(absolutizeMarkdownLinks(member.documentation));
      lines.push(`- \`${member.name}\`${text.length === 0 ? "" : ` — ${text}`}`);
    }
  }
  return lines;
}

/** Titles are unique in practice; the map keeps Contents anchors stable if one repeats. */
function uniqueAnchors(titles: readonly string[]): ReadonlyMap<string, string> {
  const anchors = new Map<string, string>();
  const used = new Set<string>();
  for (const title of titles) {
    const base = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const stem = base.length === 0 ? "section" : base;
    let anchor = stem;
    let counter = 2;
    while (used.has(anchor)) anchor = `${stem}-${counter++}`;
    used.add(anchor);
    anchors.set(title, anchor);
  }
  return anchors;
}

const FENCE_PATTERN = /^\s*(`{3,}|~{3,})(.*)$/;
const LANGUAGE_PATTERN = /^[A-Za-z][A-Za-z0-9+#.-]*$/;

/**
 * Reads one authored document as plain text: fenced code is preserved verbatim
 * (only the info string is reduced to its language), MDX chrome is dropped or
 * flattened, and inline HTML keeps its visible text.
 */
function convertDocumentBody(body: string): string {
  const output: string[] = [];
  let fence: string | undefined;
  for (const line of body.split("\n")) {
    const match = FENCE_PATTERN.exec(line);
    if (fence === undefined) {
      if (match === null) {
        output.push(convertProseLine(line));
        continue;
      }
      fence = match[1];
      const language = match[2].trim().split(/\s+/)[0] ?? "";
      output.push(`${match[1]}${LANGUAGE_PATTERN.test(language) ? language : ""}`);
      continue;
    }
    if (match?.[1].startsWith(fence[0]) && match[2].trim() === "") {
      fence = undefined;
      output.push(match[1]);
      continue;
    }
    output.push(line);
  }
  return output
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function convertProseLine(line: string): string {
  if (isMdxImport(line)) return "";
  const tabItem = /^\s*<TabItem\s+label="([^"]*)">\s*$/.exec(line);
  if (tabItem !== null) return `**${tabItem[1]}**`;
  if (/^\s*<\/?Tabs\b[^>]*>\s*$/.test(line)) return "";
  if (/^\s*<\/?TabItem\b[^>]*>\s*$/.test(line)) return "";
  if (/^\s*<\/?[A-Z][A-Za-z0-9]*(\s[^>]*)?\/?>\s*$/.test(line)) return "";
  return plainText(absolutizeMarkdownLinks(convertInlineHtml(line)));
}

/** MDX pulls its components in with JavaScript import statements that carry no prose. */
function isMdxImport(line: string): boolean {
  return (
    /^\s*(?:import|export)\s+(?:type\s+)?[^;]*\bfrom\s+["'][^"']+["']\s*;?\s*$/.test(line) ||
    /^\s*import\s+["'][^"']+["']\s*;?\s*$/.test(line)
  );
}

function convertInlineHtml(line: string): string {
  const { masked, restore } = maskInlineCode(line);
  const stripped = masked
    .replace(/<!--.*?-->/g, "")
    .replace(
      /<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g,
      (_match, href: string, inner: string) => `${stripTags(inner)} (${absoluteUrl(href)})`,
    )
    .replace(/<code>([\s\S]*?)<\/code>/g, "`$1`")
    .replace(/<(?:b|strong)>([\s\S]*?)<\/(?:b|strong)>/g, "**$1**")
    .replace(/<(?:em|i)>([\s\S]*?)<\/(?:em|i)>/g, "*$1*")
    .replace(/<\/?[A-Za-z][^>]*>/g, "");
  return restore(stripped);
}

/**
 * Generic type arguments such as `Partial<Theme>` look like HTML tags, so code
 * spans are held aside while inline HTML is stripped.
 */
function maskInlineCode(line: string): { masked: string; restore: (value: string) => string } {
  const spans: string[] = [];
  const masked = line.replace(/`[^`]*`/g, (span) => {
    spans.push(span);
    return `\uE000${spans.length - 1}\uE001`;
  });
  return {
    masked,
    restore: (value: string) =>
      value.replace(/\uE000(\d+)\uE001/g, (match, index: string) => {
        return spans[Number.parseInt(index, 10)] ?? match;
      }),
  };
}

function stripTags(value: string): string {
  const text = plainText(decodeEntities(value.replace(/<[^>]*>/g, " ")));
  return text.replace(/\s+([.,;:!?)\]])/g, "$1");
}

function absolutizeMarkdownLinks(text: string): string {
  return text.replace(/\]\((\/[^)\s]+)\)/g, (_match, url: string) => `](${absoluteUrl(url)})`);
}

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity: string) => {
    if (!entity.startsWith("#")) return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
    const code = /^#x/i.test(entity)
      ? Number.parseInt(entity.slice(2), 16)
      : Number.parseInt(entity.slice(1), 10);
    return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : match;
  });
}

function plainText(value: string): string {
  return decodeEntities(value)
    .replace(/[ \t]+/g, " ")
    .trim();
}
