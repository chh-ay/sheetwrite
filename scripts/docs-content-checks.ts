import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

import { API, type Diagnostic, type Project } from "typescript/unstable/async";

import { MOVED_PAGES, type MovedPage } from "../docs/src/lib/moved-pages.js";
import { DOCS_NAVIGATION, navigationPages } from "../docs/src/lib/navigation.js";
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

function fenceMetaValue(meta: string, name: string): string | undefined {
  const match = new RegExp(`(?:^|\\s)${name}=(?:"([^"]+)"|'([^']+)')`).exec(meta);
  return match?.[1] ?? match?.[2];
}

function maskCode(content: string): string {
  return maskFences(content).replace(/`[^`\n]*`/g, (code) => " ".repeat(code.length));
}

export function contentPathForRoute(
  route: string,
  documents: readonly MarkdownDocument[],
): string | undefined {
  const normalizedRoute = route.endsWith("/") ? route : `${route}/`;
  return documents.find(
    (document) => routeForContentPath(contentRoot, document.path) === normalizedRoute,
  )?.path;
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

export async function validateMarkdown(
  documents: readonly MarkdownDocument[],
  manifest: PublicApiManifest,
): Promise<string[]> {
  const failures: string[] = [];
  const hoverAnalyzer = new SheetwriteTypeEngine({ cwd: join(repositoryRoot, "docs") });
  const compiled: Array<{ document: MarkdownDocument; fence: Fence }> = [];
  // Generated pages are checked as rendered, before any copy is on disk.
  const documentPaths = new Set(documents.map((document) => document.path));
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
      if (
        targetPath === undefined ||
        (!documentPaths.has(targetPath) && !(await exists(targetPath)))
      ) {
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
