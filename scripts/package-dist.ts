import { readFile, rm, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";

import { format, type FormatConfig } from "oxfmt";
import { isStringLiteral, type Node, type SourceFile } from "typescript/unstable/ast";
import { API, type Project } from "typescript/unstable/async";

import { readJson } from "./script-io.js";

/**
 * TypeScript always emits 4-space indentation. Two spaces save about a tenth of
 * the published JavaScript without minifying it, so the code stays readable.
 * Import order is evaluation order, and template literal contents are runtime
 * strings, so neither may be rewritten.
 */
const PUBLISHED_JAVASCRIPT_FORMAT: FormatConfig = {
  tabWidth: 2,
  printWidth: 100,
  sortImports: false,
  embeddedLanguageFormatting: "off",
};
const BUILT_JAVASCRIPT = "dist/**/*.js";
const BUILT_DECLARATIONS = "dist/**/*.d.{ts,mts,cts}";
const DECLARATION_FILE = /\.d\.[mc]?ts$/;

/** The runtime extension a specifier names, and the declaration file that types it. */
const DECLARATION_FOR_RUNTIME: readonly (readonly [runtime: string, declaration: string])[] = [
  [".js", ".d.ts"],
  [".mjs", ".d.mts"],
  [".cjs", ".d.cts"],
];

interface TypedManifest {
  readonly name?: string;
  readonly exports?: unknown;
  readonly types?: unknown;
  readonly typings?: unknown;
}

interface DeclarationGraph {
  /** Package-relative POSIX paths of the declaration files the type entries reach. */
  readonly reachable: ReadonlySet<string>;
  /** `importer -> specifier` edges whose declaration file does not exist. */
  readonly missing: readonly string[];
}

function isDeclarationFile(path: string): boolean {
  return DECLARATION_FILE.test(path);
}

/** Every path a consumer's TypeScript can open first: `types` conditions and the `types` field. */
function typeEntryPoints(manifest: TypedManifest): string[] {
  const entries = new Set<string>();
  const visit = (value: unknown, isTypesCondition: boolean): void => {
    if (typeof value === "string") {
      if (isTypesCondition || isDeclarationFile(value)) entries.add(value.replace(/^\.\//, ""));
      return;
    }
    if (value === null || typeof value !== "object") return;
    for (const [key, nested] of Object.entries(value)) visit(nested, key === "types");
  };

  visit(manifest.exports, false);
  visit(manifest.types, true);
  visit(manifest.typings, true);
  return [...entries];
}

function declarationCandidates(target: string): string[] {
  if (isDeclarationFile(target)) return [target];
  for (const [runtime, declaration] of DECLARATION_FOR_RUNTIME) {
    if (target.endsWith(runtime)) return [`${target.slice(0, -runtime.length)}${declaration}`];
  }
  return [`${target}.d.ts`, `${target}/index.d.ts`];
}

async function firstExisting(candidates: readonly string[]): Promise<string | undefined> {
  for (const candidate of candidates) {
    if (await Bun.file(candidate).exists()) return candidate;
  }
  return undefined;
}

/**
 * The compiler's own lists of module references: import and export
 * declarations, `import("...")` types, `import x = require()`, module
 * augmentations and `/// <reference path>`. Comments and string types are not
 * module references, so they never keep a file alive.
 */
function referencedSpecifiers(sourceFile: SourceFile): string[] {
  const literalText = (node: Node): string[] => (isStringLiteral(node) ? [node.text] : []);
  return [
    ...sourceFile.imports.flatMap(literalText),
    ...sourceFile.moduleAugmentations.flatMap(literalText),
    ...sourceFile.referencedFiles.map((reference) => reference.fileName),
  ];
}

/**
 * Follow the type entries through the declaration files they reference.
 * Bare specifiers belong to other packages and end the walk.
 */
async function declarationGraph(
  packageRoot: string,
  entries: readonly string[],
): Promise<DeclarationGraph> {
  const root = resolve(packageRoot);
  const reachable = new Set<string>();
  const missing: string[] = [];
  const pending: string[] = [];
  for (const entry of entries) {
    const path = resolve(root, entry);
    if (await Bun.file(path).exists()) pending.push(path);
    else missing.push(`package.json -> ./${entry}`);
  }
  if (pending.length === 0) return { reachable, missing };

  const api = new API({ cwd: root });
  try {
    // The entries' programs already load every file they reference, so one
    // snapshot serves the whole walk.
    const snapshot = await api.updateSnapshot({ openFiles: pending });
    try {
      const projects = new Map<string, Project>();
      for (const entry of pending) {
        const project = await snapshot.getDefaultProjectForFile(entry);
        if (project === undefined) throw new Error(`TypeScript opened no project for ${entry}`);
        projects.set(entry, project);
      }

      const walk = async (path: string, project: Project): Promise<void> => {
        const packagePath = relative(root, path).split(sep).join("/");
        if (reachable.has(packagePath)) return;
        reachable.add(packagePath);

        const sourceFile = await project.program.getSourceFile(path);
        if (sourceFile === undefined) throw new Error(`TypeScript did not load ${packagePath}`);
        for (const specifier of referencedSpecifiers(sourceFile)) {
          if (!specifier.startsWith("./") && !specifier.startsWith("../")) continue;
          const target = resolve(dirname(path), specifier);
          const declaration = await firstExisting(declarationCandidates(target));
          if (declaration === undefined) missing.push(`${packagePath} -> ${specifier}`);
          else await walk(declaration, project);
        }
      };
      for (const [entry, project] of projects) await walk(entry, project);
    } finally {
      await snapshot.dispose();
    }
  } finally {
    await api.close();
  }
  return { reachable, missing };
}

/**
 * Fail when the published declarations differ from the ones the type entries
 * reach: a missing file breaks consumers' types, an extra one is dead weight.
 * Packages whose types entry is TypeScript source (Svelte) are skipped; their
 * framework tooling owns that graph.
 */
export async function assertPublishedDeclarations(
  packageRoot: string,
  publishedFiles: readonly string[],
): Promise<void> {
  const manifest = await readJson<TypedManifest>(resolve(packageRoot, "package.json"));
  const entries = typeEntryPoints(manifest);
  if (entries.length === 0 || !entries.every(isDeclarationFile)) return;

  const graph = await declarationGraph(packageRoot, entries);
  const unreachable = publishedFiles.filter(
    (file) => isDeclarationFile(file) && !graph.reachable.has(file),
  );
  const problems = [
    ...graph.missing.map((edge) => `missing ${edge}`),
    ...unreachable.map((file) => `unreachable ${file}`),
  ];
  if (problems.length > 0) {
    throw new Error(
      `${manifest.name ?? packageRoot} publishes declarations its type entries do not match:\n  ${problems.join("\n  ")}`,
    );
  }
}

/** Delete built declarations no type entry reaches; fail if a reached one was never built. */
export async function pruneUnreachableDeclarations(packageRoot: string): Promise<string[]> {
  const manifest = await readJson<TypedManifest>(resolve(packageRoot, "package.json"));
  const entries = typeEntryPoints(manifest);
  // Without declaration entries the walk reaches nothing and would delete every
  // built declaration; the packed check skips such packages, so fail here.
  if (entries.length === 0 || !entries.every(isDeclarationFile)) {
    throw new Error(
      `${manifest.name ?? packageRoot} has no declaration-file types entries to prune from`,
    );
  }
  const graph = await declarationGraph(packageRoot, entries);
  if (graph.missing.length > 0) {
    throw new Error(
      `${manifest.name ?? packageRoot} type entries reference declarations that were not built:\n  ${graph.missing.join("\n  ")}`,
    );
  }

  const built = await Array.fromAsync(new Bun.Glob(BUILT_DECLARATIONS).scan({ cwd: packageRoot }));
  const unreachable = built.filter((path) => !graph.reachable.has(path.split(sep).join("/")));
  await Promise.all(unreachable.map((path) => rm(resolve(packageRoot, path))));
  return unreachable;
}

/**
 * Whitespace-insensitive print of the module. Formatting may only move
 * whitespace and syntax-neutral tokens, so both sides must print the same.
 */
const semanticPrinter = new Bun.Transpiler({
  loader: "js",
  minifyWhitespace: true,
  trimUnusedImports: false,
});

/** Re-indent built JavaScript with 2 spaces, proving each file still means the same program. */
export async function formatBuiltJavaScript(packageRoot: string): Promise<void> {
  const files = await Array.fromAsync(new Bun.Glob(BUILT_JAVASCRIPT).scan({ cwd: packageRoot }));
  await Promise.all(
    files.map(async (file) => {
      const path = resolve(packageRoot, file);
      const source = await readFile(path, "utf8");
      const formatted = await format(path, source, PUBLISHED_JAVASCRIPT_FORMAT);
      if (formatted.errors.length > 0) {
        throw new Error(
          `Cannot format ${file}: ${formatted.errors.map((error) => error.message).join("; ")}`,
        );
      }
      if (semanticPrinter.transformSync(formatted.code) !== semanticPrinter.transformSync(source)) {
        throw new Error(`Formatting changed the program in ${file}`);
      }
      await writeFile(path, formatted.code);
    }),
  );
}

if (import.meta.main) {
  const packageRoot = process.argv[2];
  if (packageRoot === undefined) throw new Error("Expected a package directory");

  await formatBuiltJavaScript(packageRoot);
  await pruneUnreachableDeclarations(packageRoot);
}
