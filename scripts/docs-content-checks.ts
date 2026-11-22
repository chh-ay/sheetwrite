import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

import { API, type Diagnostic, type Project } from "typescript/unstable/async";

import { MOVED_PAGES, type MovedPage } from "../docs/src/lib/moved-pages.js";
import { DOCS_NAVIGATION, navigationPages } from "../docs/src/lib/navigation.js";
import { isRunnableMeta, RUNNABLE_IMPORTS } from "../docs/src/lib/runnable-code.js";
import { collectFenceHovers, isHighQualityHover } from "../docs/src/lib/sheetwrite-code-hovers.js";
import { SheetwriteTypeEngine } from "../docs/src/lib/sheetwrite-type-engine.js";
import { routeForContentPath } from "./docs-paths.js";
import {
  contentRoot,
  exists,
  type Fence,
  type MarkdownDocument,
  PACKAGE_DIRECTORIES,
  posix,
  repositoryRoot,
} from "./docs-shared.js";
import { headingAnchors } from "./markdown-anchors.js";
import { fenceBlocks, maskFences } from "./markdown-fences.js";
import type { PublicApiManifest } from "./public-api.js";

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

async function route_component_files(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await route_component_files(path)));
    else if (/\.tsx?$/.test(entry.name)) files.push(path);
  }
  return files;
}

/** README files, the sidebar, and site components all link docs pages. */
export async function siteLinkIssues(documents: readonly MarkdownDocument[]): Promise<string[]> {
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
  for (const path of await route_component_files(join(repositoryRoot, "docs/src"))) {
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

// The last form is a bare issue number such as "decision recorded in #228"; it
// skips hex colours, HTML entities and heading anchors such as `#1-intro`.
const TRACKER_REFERENCE =
  /github\.com\/chh-ay\/sheetwrite\/(?:pull|issues)\b|\bPR #\d+|\[#\d+\](?=\()|(?<![\w&])\(#\d+\)|(?<![\w&#"'/-])#\d{2,5}(?![\w-])/g;

/**
 * Readers need what a page says, not which pull request or issue changed it,
 * so docs pages do not link the tracker or cite pull request numbers.
 */
export function trackerReferenceIssues(documents: readonly MarkdownDocument[]): string[] {
  const failures: string[] = [];
  for (const document of documents) {
    const source = posix(relative(repositoryRoot, document.path));
    document.content.split("\n").forEach((line, index) => {
      for (const match of line.matchAll(TRACKER_REFERENCE)) {
        failures.push(
          `${source}:${index + 1} cites the tracker (${match[0]}); describe the change instead`,
        );
      }
    });
  }
  return failures;
}

export async function markdownDocuments(root: string): Promise<MarkdownDocument[]> {
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
  const lines = content.split("\n");
  return fenceBlocks(lines).map((block) => {
    if (!block.closed) throw new Error(`Unclosed code fence at line ${block.start + 1}`);
    const info = block.info.trim();
    const language = /^\S*/.exec(info)?.[0] ?? "";
    // CommonMark removes the opener's indent from each content line.
    const code = lines
      .slice(block.start + 1, block.end)
      .map((line) => line.replace(new RegExp(`^ {0,${block.indent}}`), ""))
      .join("\n");
    return { language, meta: info.slice(language.length).trim(), code, line: block.start + 1 };
  });
}

function fence_meta_value(meta: string, name: string): string | undefined {
  const match = new RegExp(`(?:^|\\s)${name}=(?:"([^"]+)"|'([^']+)')`).exec(meta);
  return match?.[1] ?? match?.[2];
}

function mask_code(content: string): string {
  return maskFences(content).replace(/`[^`\n]*`/g, (code) => " ".repeat(code.length));
}

export function contentPathForRoute(
  route: string,
  documents: readonly MarkdownDocument[],
): string | undefined {
  const normalized_route = route.endsWith("/") ? route : `${route}/`;
  return documents.find(
    (document) => routeForContentPath(contentRoot, document.path) === normalized_route,
  )?.path;
}

function package_and_subpath(
  specifier: string,
): { packageName: string; subpath: string } | undefined {
  const clean = specifier.split("?")[0] ?? specifier;
  const match = /^(@sheetwrite\/[^/]+)(?:\/(.+))?$/.exec(clean);
  if (match === null) return undefined;
  return { packageName: match[1] ?? "", subpath: match[2] === undefined ? "." : `./${match[2]}` };
}

/**
 * A runnable fence runs in the playground as written: it must be a complete,
 * compile-checked TypeScript example, and it may import only the packages the
 * playground loads.
 */
function runnable_fence_issues(
  document: MarkdownDocument,
  fence: Fence,
  partial: boolean,
): string[] {
  const location = `${posix(relative(repositoryRoot, document.path))}:${fence.line}`;
  const failures: string[] = [];
  if (fence.language !== "ts" || !/(?:^|\s)compile(?:\s|$)/.test(fence.meta) || partial) {
    failures.push(`${location} runnable is only valid on a complete \`ts compile\` fence`);
  }
  const imports = fence.code.matchAll(
    /\bfrom\s*["']([^"']+)["']|\bimport\s*\(?\s*["']([^"']+)["']/g,
  );
  for (const match of imports) {
    const specifier = match[1] ?? match[2] ?? "";
    if (!(RUNNABLE_IMPORTS as readonly string[]).includes(specifier)) {
      failures.push(`${location} runnable example imports ${specifier}, which Try it cannot load`);
    }
  }
  return failures;
}

function validate_imports(
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
    const parsed = package_and_subpath(specifier);
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
    "@sheetwrite/formula-assist": ["../packages/formula-assist/dist/index.d.ts"],
    // Subpaths whose `exports` target differs from the file name; the wildcard below
    // would resolve `history` to the internal undo module.
    "@sheetwrite/core/history": ["../packages/core/dist/history-archive.d.ts"],
    "@sheetwrite/core/browser/history": ["../packages/core/dist/history-indexeddb.d.ts"],
    "@sheetwrite/core/*": ["../packages/core/dist/*"],
    "@sheetwrite/queries": ["../packages/queries/dist/index.d.ts"],
    "@sheetwrite/react": ["../packages/react/dist/index.d.ts"],
    "@sheetwrite/svelte": ["../packages/svelte/src/index.ts"],
    "@sheetwrite/vue": ["../packages/vue/dist/index.d.ts"],
    "@sheetwrite/xlsx": ["../packages/xlsx/dist/index.d.ts"],
  },
  skipLibCheck: false,
  strict: true,
  target: "es2022",
} as const;

function diagnostic_text(diagnostic: Diagnostic): string {
  return [diagnostic.text, ...(diagnostic.messageChain ?? []).map(diagnostic_text)].join("\n");
}

async function pre_emit_diagnostics(project: Project): Promise<readonly Diagnostic[]> {
  const diagnostics = [...(await project.program.getConfigFileParsingDiagnostics())];
  const config_file_count = diagnostics.length;
  diagnostics.push(...(await project.program.getSyntacticDiagnostics()));
  if (diagnostics.length !== config_file_count) return diagnostics;
  diagnostics.push(...(await project.program.getProgramDiagnostics()));
  diagnostics.push(...(await project.program.getGlobalDiagnostics()));
  if (diagnostics.length === config_file_count) {
    diagnostics.push(...(await project.program.getSemanticDiagnostics()));
  }
  return diagnostics;
}

async function validate_compiled_snippets(
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
      const compile_source = snippet.fence.code.replace(
        /^\s*import\s+["'][^"']+\.css["'];?\s*$/gm,
        "",
      );
      await writeFile(path, `${compile_source}\nexport {};\n`);
      files.push(path);
    }
    const config_path = join(directory, "tsconfig.json");
    await writeFile(
      config_path,
      `${JSON.stringify({ compilerOptions: SNIPPET_COMPILER_OPTIONS, files }, null, 2)}\n`,
    );
    const snapshot = await api.updateSnapshot({ openProjects: [config_path] });
    try {
      const project = snapshot.getProject(config_path);
      if (project === undefined) {
        throw new Error(`TypeScript 7 could not open the snippet project ${config_path}`);
      }
      const failures: string[] = [];
      for (const diagnostic of await pre_emit_diagnostics(project)) {
        const message = diagnostic_text(diagnostic);
        const file_name = diagnostic.fileName;
        const index = file_name === undefined ? -1 : files.indexOf(file_name);
        if (file_name === undefined || index < 0) {
          failures.push(`compiled snippet: ${message}`);
          continue;
        }
        const source_file = await project.program.getSourceFile(file_name);
        const snippet = snippets[index];
        const position = source_file?.getLineAndCharacterOfPosition(diagnostic.pos);
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

function validate_verified_shell(
  document: MarkdownDocument,
  fence: Fence,
  manifest: PublicApiManifest,
): string[] {
  const failures: string[] = [];
  const known_packages = new Set(manifest.packages.map((pkg) => pkg.name));
  for (const match of fence.code.matchAll(
    /(?:bun\s+add|npm\s+install)\s+(@sheetwrite\/[^\s#]+)/g,
  )) {
    const package_name = match[1] ?? "";
    if (!known_packages.has(package_name)) {
      failures.push(
        `${posix(relative(repositoryRoot, document.path))}:${fence.line} installs unknown package ${package_name}`,
      );
    }
  }
  return failures;
}

/**
 * Checks fences, imports and internal links. `generatedPublicFiles` holds the
 * site paths of files the docs generator writes to `docs/public` (such as
 * `/changelog/rss.xml`), so a page can link one before it is on disk.
 */
export async function validateMarkdown(
  documents: readonly MarkdownDocument[],
  manifest: PublicApiManifest,
  generatedPublicFiles: ReadonlySet<string> = new Set(),
): Promise<string[]> {
  const hover_analyzer = new SheetwriteTypeEngine({ cwd: join(repositoryRoot, "docs") });
  try {
    // Every typed fence is requested at once so the type engine analyzes them in one batch.
    const hover_failures = Promise.all(
      documents.flatMap((document) => fence_hover_failures(document, hover_analyzer)),
    );
    const failures = await validate_documents(documents, manifest, generatedPublicFiles);
    failures.push(...(await hover_failures).flat());
    return failures;
  } finally {
    await hover_analyzer.dispose();
  }
}

type TypedFence = Fence & { language: "ts" | "tsx" | "vue" | "svelte" };

function is_typed_fence(fence: Fence): fence is TypedFence {
  return (
    (fence.language === "ts" ||
      fence.language === "tsx" ||
      fence.language === "vue" ||
      fence.language === "svelte") &&
    !/(?:^|\s)generated(?:\s|$)/.test(fence.meta)
  );
}

function fence_hover_failures(
  document: MarkdownDocument,
  analyzer: SheetwriteTypeEngine,
): Promise<string[]>[] {
  let fences: Fence[];
  try {
    fences = parseFences(document.content);
  } catch (error) {
    // validate_documents reports the unclosed fence for this document.
    if (error instanceof Error) return [];
    throw error;
  }
  const page = posix(relative(repositoryRoot, document.path));
  return fences.filter(is_typed_fence).map(async (fence) => {
    try {
      const hovers = await collectFenceHovers(
        fence.code,
        fence.language,
        analyzer,
        fence_meta_value(fence.meta, "prelude"),
      );
      return hovers
        .filter((hover) => !isHighQualityHover(hover, fence.language))
        .map(
          (hover) =>
            `${page}:${fence.line + hover.line} low-quality hover for ${hover.target}: ${hover.text}`,
        );
    } catch (error) {
      return [
        `${page}:${fence.line} hover analysis failed: ${error instanceof Error ? error.message : String(error)}`,
      ];
    }
  });
}

async function validate_documents(
  documents: readonly MarkdownDocument[],
  manifest: PublicApiManifest,
  generated_public_files: ReadonlySet<string>,
): Promise<string[]> {
  const failures: string[] = [];
  const compiled: Array<{ document: MarkdownDocument; fence: Fence }> = [];
  // Generated pages are checked as rendered, before any copy is on disk.
  const document_paths = new Set(documents.map((document) => document.path));
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
      const typed_language =
        fence.language === "ts" ||
        fence.language === "tsx" ||
        fence.language === "vue" ||
        fence.language === "svelte";
      const generated = /(?:^|\s)generated(?:\s|$)/.test(fence.meta);
      const partial = /(?:^|\s)partial=(?:"[^"]+"|'[^']+')/.test(fence.meta);
      const prelude = fence_meta_value(fence.meta, "prelude");
      if (typed_language && !generated) {
        if (partial && prelude === undefined) {
          failures.push(
            `${posix(relative(repositoryRoot, document.path))}:${fence.line} typed partial fence requires a named hover prelude`,
          );
        }
      }
      if (isRunnableMeta(fence.meta)) {
        failures.push(...runnable_fence_issues(document, fence, partial));
      }
      if (/(?:^|\s)compile(?:\s|$)/.test(fence.meta)) {
        if (fence.language !== "ts" && fence.language !== "tsx") {
          failures.push(
            `${posix(relative(repositoryRoot, document.path))}:${fence.line} compile is only valid for ts/tsx fences`,
          );
        } else compiled.push({ document, fence });
      }
      if (fence.language === "ts" || fence.language === "tsx") {
        failures.push(...validate_imports(document, fence, manifest));
      }
      if (fence.language === "sh" && /(?:^|\s)verify(?:\s|$)/.test(fence.meta)) {
        failures.push(...validate_verified_shell(document, fence, manifest));
      }
    }

    const masked = mask_code(document.content);
    const link_targets = [
      ...[...masked.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map((match) => match[1]),
      ...[...masked.matchAll(/\shref=["']([^"']+)["']/gi)].map((match) => match[1]),
    ];
    for (const target of link_targets) {
      const raw_target = target?.trim() ?? "";
      if (
        raw_target.length === 0 ||
        /^(?:https?:|mailto:|tel:)/.test(raw_target) ||
        raw_target.startsWith("{")
      ) {
        continue;
      }
      const [target_without_fragment = "", fragment] = raw_target.split("#", 2);
      const [target_route = ""] = target_without_fragment.split("?", 1);
      if (generated_public_files.has(target_route)) continue;
      let target_path: string | undefined;
      if (target_route === "") target_path = document.path;
      else if (target_route.startsWith("/docs/")) {
        target_path = contentPathForRoute(target_route, documents);
      } else if (target_route.startsWith("/") && !target_route.includes("..")) {
        const route_slug = target_route.replace(/^\//, "").replace(/\/$/, "").replaceAll("/", ".");
        target_path = join(repositoryRoot, `docs/src/routes/${route_slug || "index"}.tsx`);
      } else if (target_route.startsWith("/")) {
        failures.push(
          `${posix(relative(repositoryRoot, document.path))} links invalid internal route ${raw_target}`,
        );
        continue;
      } else {
        target_path = resolve(dirname(document.path), target_without_fragment);
        if (!/\.[a-zA-Z]+$/.test(target_path)) {
          target_path = `${target_path}.md`;
        }
      }
      if (
        target_path === undefined ||
        (!document_paths.has(target_path) && !(await exists(target_path)))
      ) {
        failures.push(
          `${posix(relative(repositoryRoot, document.path))} links missing target ${raw_target}`,
        );
        continue;
      }
      if (fragment !== undefined && fragment.length > 0 && /\.mdx?$/.test(target_path)) {
        const target = documents.find((item) => item.path === target_path);
        if (target !== undefined && !headingAnchors(target.content).has(fragment)) {
          failures.push(
            `${posix(relative(repositoryRoot, document.path))} links missing anchor ${raw_target}`,
          );
        }
      }
    }
  }
  failures.push(...(await validate_compiled_snippets(compiled)));
  return failures;
}

export async function readReadmes(): Promise<MarkdownDocument[]> {
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
