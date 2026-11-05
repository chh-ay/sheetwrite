import { access, readdir } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";

import {
  isEnumDeclaration,
  isInterfaceDeclaration,
  isTypeAliasDeclaration,
} from "typescript/unstable/ast";
import { API, type Project, type Symbol as ApiSymbol } from "typescript/unstable/async";

import { PUBLIC_TYPE_DOMAINS } from "./check-import-cycles.js";
import {
  checkIntentionalExports,
  readPublicApiBaseline,
  validateManifest,
  writePublicApiBaseline,
} from "./public-api-baseline.js";
import {
  collectTags,
  declarationSignature,
  declarationsOf,
  diagnosticText,
  duplicateExportDiagnosticCode,
  exportStatementDocumentation,
  memberDocumentation,
  mergeDocumentation,
  resolvedSymbol,
  symbolDocumentation,
  symbolKind,
  unstableErrorContract,
} from "./public-api-declarations.js";
import { readJson } from "./script-io.js";

export type ApiEntryClassification = "supported" | "internal" | "asset" | "test-only";

export interface ApiMemberDoc {
  name: string;
  documentation: string;
}

export interface ApiExport {
  name: string;
  kind: string;
  signature: string;
  owners: string[];
  source: string;
  jsDocTags: string[];
  documentation: string;
  memberDocs: ApiMemberDoc[];
}

export interface ApiEntryPoint {
  subpath: string;
  target: string;
  source?: string;
  kind: "typescript" | "asset";
  classification: ApiEntryClassification;
  exports: ApiExport[];
}

export interface ApiPackage {
  name: string;
  entryPoints: ApiEntryPoint[];
}

export interface PublicApiManifest {
  formatVersion: 2;
  packages: ApiPackage[];
}

export interface ApiIssue {
  code:
    | "deprecated-symbol"
    | "duplicate-export"
    | "forbidden-export"
    | "malformed-report"
    | "missing-documentation"
    | "missing-export"
    | "parse-error"
    | "removed-export"
    | "unclassified-entry"
    | "wrong-owner"
    | "unstable-error-contract"
    | "unlisted-export"
    | "unresolved-entry";
  message: string;
  package?: string;
  entryPoint?: string;
  symbol?: string;
}

export interface PackageJson {
  name?: string;
  private?: boolean;
  workspaces?: string[];
  exports?: unknown;
  types?: string;
}

interface ResolvedEntry {
  subpath: string;
  target: string;
  source?: string;
  kind: "typescript" | "asset";
  classification: ApiEntryClassification;
}

const FORBIDDEN_EXPORTS = new Set([
  "Patch",
  "LegacyDataSource",
  "toXlsx",
  "fromXlsx",
  "XlsxBackend",
  "XlsxImportBackend",
  "setXlsxBackend",
  "setXlsxImportBackend",
]);

const REQUIRED_CORE_EXPORTS = new Set([
  "DocumentOp",
  "DataSource",
  "ChangeEvent",
  "Store",
  "toXlsxTable",
  "fromXlsxTable",
  "XlsxTableExportBackend",
  "XlsxTableImportBackend",
  "setXlsxTableExportBackend",
  "setXlsxTableImportBackend",
  "toXlsxWorkbook",
  "fromXlsxWorkbook",
  "XlsxWorkbookBackend",
  "setXlsxWorkbookBackend",
]);

const SUPPORTED_PACKAGES: Readonly<Record<string, true>> = {
  "@sheetwrite/charts": true,
  "@sheetwrite/core": true,
  "@sheetwrite/queries": true,
  "@sheetwrite/react": true,
  "@sheetwrite/svelte": true,
  "@sheetwrite/vue": true,
  "@sheetwrite/xlsx": true,
};

export async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function posix(path: string): string {
  return path.split(sep).join("/");
}

function selectTypesTarget(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (value === null || typeof value !== "object") return undefined;
  const conditions = value as Record<string, unknown>;
  const preferred = conditions.types ?? conditions.svelte ?? conditions.default;
  if (preferred !== undefined) return selectTypesTarget(preferred);
  for (const nested of Object.values(conditions)) {
    const target = selectTypesTarget(nested);
    if (target !== undefined) return target;
  }
  return undefined;
}

function exportedSubpaths(manifest: PackageJson): Array<[string, string]> {
  const entries: Array<[string, string]> = [];
  if (manifest.exports !== undefined) {
    if (typeof manifest.exports === "string") return [[".", manifest.exports]];
    if (manifest.exports !== null && typeof manifest.exports === "object") {
      for (const [subpath, value] of Object.entries(manifest.exports)) {
        if (!subpath.startsWith(".")) continue;
        const target = selectTypesTarget(value);
        if (target !== undefined) entries.push([subpath, target]);
      }
    }
  } else if (manifest.types !== undefined) {
    entries.push([".", manifest.types]);
  }
  return entries.sort(([left], [right]) => left.localeCompare(right));
}

function isTypescriptTarget(target: string): boolean {
  return /(?:\.d)?\.[cm]?tsx?$/.test(target);
}

async function resolveSource(packageRoot: string, target: string): Promise<string | undefined> {
  const normalized = target.replace(/^\.\//, "");
  const published = resolve(packageRoot, normalized);
  const sourceCandidates: string[] = [];
  if (normalized.startsWith("dist/")) {
    const sourcePath = normalized.slice("dist/".length);
    sourceCandidates.push(
      join(packageRoot, "src", sourcePath.replace(/\.d\.[cm]?ts$/, ".ts")),
      join(packageRoot, "src", sourcePath.replace(/\.d\.[cm]?ts$/, ".tsx")),
      join(packageRoot, "src", sourcePath.replace(/\.[cm]?js$/, ".ts")),
    );
  }
  if (/\.[cm]?js$/.test(normalized)) {
    sourceCandidates.push(resolve(packageRoot, normalized.replace(/\.[cm]?js$/, ".ts")));
    sourceCandidates.push(resolve(packageRoot, normalized.replace(/\.[cm]?js$/, ".tsx")));
  }

  for (const candidate of sourceCandidates) {
    if (await exists(candidate)) return candidate;
  }
  if (await exists(published)) return published;
  return undefined;
}

export async function packageDirectories(repositoryRoot: string): Promise<string[]> {
  const rootManifest = await readJson<PackageJson>(join(repositoryRoot, "package.json"));
  const directories: string[] = [];
  for (const workspace of rootManifest.workspaces ?? []) {
    if (!workspace.endsWith("/*")) continue;
    const parent = resolve(repositoryRoot, workspace.slice(0, -2));
    if (!(await exists(parent))) continue;
    for (const entry of await readdir(parent, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const directory = join(parent, entry.name);
      if (await exists(join(directory, "package.json"))) directories.push(directory);
    }
  }
  return directories.sort();
}

function classifyEntry(
  packageName: string,
  subpath: string,
  kind: "typescript" | "asset",
): ApiEntryClassification | undefined {
  if (kind === "asset") return "asset";
  if (packageName === "@sheetwrite/core" && subpath === "./testing") return "test-only";
  if (
    (packageName === "@sheetwrite/wasm" || packageName === "@sheetwrite/formulas") &&
    subpath === "."
  )
    return "internal";
  // `@sheetwrite/core/history` loads the diff kernel; hosts only point at its WASM asset.
  if (packageName === "@sheetwrite/wasm" && subpath === "./history") return "internal";
  if (SUPPORTED_PACKAGES[packageName] === true) return "supported";
  return undefined;
}

async function resolveEntries(
  packageRoot: string,
  manifest: PackageJson,
): Promise<{ entries: ResolvedEntry[]; issues: ApiIssue[] }> {
  const entries: ResolvedEntry[] = [];
  const issues: ApiIssue[] = [];
  const packageName = manifest.name ?? "";
  for (const [subpath, target] of exportedSubpaths(manifest)) {
    const kind = isTypescriptTarget(target) ? "typescript" : "asset";
    const classification = classifyEntry(packageName, subpath, kind);
    if (classification === undefined) {
      issues.push({
        code: "unclassified-entry",
        message: `${packageName} ${subpath} (${target}) has no public API classification`,
        package: packageName,
        entryPoint: subpath,
      });
      continue;
    }
    if (kind === "asset") {
      entries.push({ subpath, target, kind, classification });
      continue;
    }
    entries.push({
      subpath,
      target,
      source: await resolveSource(packageRoot, target),
      kind,
      classification,
    });
  }
  return { entries, issues };
}

/**
 * Compiler options the manifest has always been rendered with. TypeScript 7
 * only analyzes configured projects, so each entry point is served through a
 * single-root project file carrying exactly these options.
 */
const ENTRY_COMPILER_OPTIONS = {
  allowJs: false,
  module: "esnext",
  moduleResolution: "bundler",
  noEmit: true,
  skipLibCheck: false,
  strict: true,
  target: "es2022",
} as const;

/** A single-root project file, served to the compiler by a virtual file system. */
interface EntryProjectFile {
  readonly source: string;
  readonly configFileName: string;
  readonly contents: string;
}

function entryProjectFile(repositoryRoot: string, index: number, source: string): EntryProjectFile {
  return {
    source,
    configFileName: join(repositoryRoot, `tsconfig.public-api.${index}.json`),
    contents: `${JSON.stringify({ compilerOptions: ENTRY_COMPILER_OPTIONS, files: [source] }, null, 2)}\n`,
  };
}

async function analyzeEntry(
  packageName: string,
  packageRoot: string,
  entry: ResolvedEntry,
  project: Project | undefined,
): Promise<{ entry: ApiEntryPoint; issues: ApiIssue[] }> {
  const issues: ApiIssue[] = [];
  if (entry.source === undefined) {
    issues.push({
      code: "unresolved-entry",
      message: `${packageName}${entry.subpath === "." ? "" : entry.subpath.slice(1)} cannot resolve ${entry.target}`,
      package: packageName,
      entryPoint: entry.subpath,
    });
    return { entry: { ...entry, exports: [] }, issues };
  }

  const sourceFile =
    project === undefined ? undefined : await project.program.getSourceFile(entry.source);
  if (project === undefined || sourceFile === undefined) {
    issues.push({
      code: "parse-error",
      message: `${packageName} ${entry.subpath} was resolved but not parsed`,
      package: packageName,
      entryPoint: entry.subpath,
    });
    return {
      entry: { ...entry, source: posix(relative(packageRoot, entry.source)), exports: [] },
      issues,
    };
  }

  for (const diagnostic of await project.program.getSyntacticDiagnostics(entry.source)) {
    issues.push({
      code: "parse-error",
      message: diagnosticText(diagnostic),
      package: packageName,
      entryPoint: entry.subpath,
    });
  }
  for (const diagnostic of await project.program.getSemanticDiagnostics()) {
    if (diagnostic.code !== duplicateExportDiagnosticCode) continue;
    issues.push({
      code: "duplicate-export",
      message: diagnosticText(diagnostic),
      package: packageName,
      entryPoint: entry.subpath,
    });
  }

  const checker = project.checker;
  const moduleSymbol = await checker.getSymbolAtLocation(sourceFile);
  if (moduleSymbol === undefined) {
    issues.push({
      code: "parse-error",
      message: `${packageName} ${entry.subpath} is not an external module`,
      package: packageName,
      entryPoint: entry.subpath,
    });
    return {
      entry: { ...entry, source: posix(relative(packageRoot, entry.source)), exports: [] },
      issues,
    };
  }

  const mergedDeclarationSymbols: string[] = [];
  const apiExports: ApiExport[] = [];
  for (const exported of await checker.getExportsOfModule(moduleSymbol)) {
    apiExports.push(await describeExport(exported, packageRoot, project, mergedDeclarationSymbols));
  }

  apiExports.sort((left, right) => left.name.localeCompare(right.name));
  issues.push(...exportPolicyIssues(packageName, entry, apiExports, mergedDeclarationSymbols));

  return {
    entry: {
      subpath: entry.subpath,
      target: entry.target,
      source: posix(relative(packageRoot, entry.source)),
      kind: entry.kind,
      classification: entry.classification,
      exports: apiExports,
    },
    issues,
  };
}

/**
 * Read one export's declarations, source link, tags and documentation from
 * the compiler. Exports that merge several structural declarations are
 * recorded in `mergedDeclarationSymbols`.
 */
async function describeExport(
  exported: ApiSymbol,
  packageRoot: string,
  project: Project,
  mergedDeclarationSymbols: string[],
): Promise<ApiExport> {
  const target = await resolvedSymbol(exported, project);
  const declarations = await declarationsOf(target, project);
  const structuralDeclarations = declarations.filter(
    (candidate) =>
      isInterfaceDeclaration(candidate) ||
      isTypeAliasDeclaration(candidate) ||
      isEnumDeclaration(candidate),
  );
  if (structuralDeclarations.length > 1) mergedDeclarationSymbols.push(exported.name);

  const owners = new Set(
    declarations.map((declaration) =>
      posix(relative(packageRoot, declaration.getSourceFile().fileName)),
    ),
  );
  const declaration = declarations[0];
  const source =
    declaration === undefined
      ? ""
      : `${posix(relative(packageRoot, declaration.getSourceFile().fileName))}#L${
          declaration.getSourceFile().getLineAndCharacterOfPosition(declaration.getStart()).line + 1
        }`;

  const tags = new Set([
    ...(await collectTags(exported, project)),
    ...(await collectTags(target, project)),
  ]);
  const documentation = [
    await exportStatementDocumentation(exported, project),
    ...(await Promise.all(
      [exported, target].map(async (symbol) => (await symbolDocumentation(symbol, project)).trim()),
    )),
  ].filter((value, index, values) => value.length > 0 && values.indexOf(value) === index);

  const kind = symbolKind(target);
  return {
    name: exported.name,
    kind,
    signature: await declarationSignature(target, project),
    owners: [...owners].sort(),
    source,
    jsDocTags: [...tags].sort(),
    documentation: mergeDocumentation(documentation),
    memberDocs:
      kind === "interface" || kind === "class" ? await memberDocumentation(target, project) : [],
  };
}

/** Export policy: one owner, no deprecated or merged symbols, documented and stable errors. */
function exportPolicyIssues(
  packageName: string,
  entry: ResolvedEntry,
  apiExports: readonly ApiExport[],
  mergedDeclarationSymbols: readonly string[],
): ApiIssue[] {
  const issues: ApiIssue[] = [];
  const issue = (code: ApiIssue["code"], message: string, symbol: string): void => {
    issues.push({ code, message, package: packageName, entryPoint: entry.subpath, symbol });
  };

  for (const symbol of mergedDeclarationSymbols) {
    issue(
      "duplicate-export",
      `${packageName} ${entry.subpath} export ${symbol} merges multiple structural declarations; the joined signature cannot render as one declaration`,
      symbol,
    );
  }

  for (const apiExport of apiExports) {
    if (apiExport.owners.length > 1) {
      issue(
        "duplicate-export",
        `${packageName} ${entry.subpath} gives ${apiExport.name} multiple owners: ${apiExport.owners.join(", ")}`,
        apiExport.name,
      );
    }

    if (apiExport.jsDocTags.includes("deprecated")) {
      issue(
        "deprecated-symbol",
        `${packageName} ${entry.subpath} exports deprecated symbol ${apiExport.name}`,
        apiExport.name,
      );
    }

    if (entry.classification !== "supported") continue;

    if (apiExport.documentation.trim().length === 0) {
      issue(
        "missing-documentation",
        `${packageName} ${entry.subpath} export ${apiExport.name} has no source JSDoc summary`,
        apiExport.name,
      );
    }

    const errorContractIssue = unstableErrorContract(apiExport);
    if (errorContractIssue !== null) {
      issue(
        "unstable-error-contract",
        `${packageName} ${entry.subpath} export ${errorContractIssue}`,
        apiExport.name,
      );
    }
  }

  return issues;
}

/** The public API manifest of the workspace and every policy issue found while building it. */
export interface PublicApiAnalysis {
  manifest: PublicApiManifest;
  issues: ApiIssue[];
}

export async function analyzePublicApi(repositoryRoot: string): Promise<PublicApiAnalysis> {
  const packages: ApiPackage[] = [];
  const issues: ApiIssue[] = [];
  const packageEntries: Array<{
    name: string;
    packageRoot: string;
    entries: ResolvedEntry[];
  }> = [];
  for (const packageRoot of await packageDirectories(repositoryRoot)) {
    const packageManifest = await readJson<PackageJson>(join(packageRoot, "package.json"));
    if (packageManifest.name === undefined || packageManifest.private === true) continue;
    const resolved = await resolveEntries(packageRoot, packageManifest);
    issues.push(...resolved.issues);
    packageEntries.push({
      name: packageManifest.name,
      packageRoot,
      entries: resolved.entries,
    });
  }

  // Each entry point is analyzed in its own single-root project, reproducing
  // the program the classic compiler API built for it — including the closure
  // of files that program contained, which drives the diagnostics reported.
  const projectFiles = [
    ...new Set(
      packageEntries.flatMap(({ entries }) =>
        entries.flatMap((entry) => (entry.source === undefined ? [] : [entry.source])),
      ),
    ),
  ].map((source, index) => entryProjectFile(repositoryRoot, index, source));
  const virtualConfigs = new Map(projectFiles.map((file) => [file.configFileName, file.contents]));
  const configBySource = new Map(projectFiles.map((file) => [file.source, file.configFileName]));
  const api = new API({
    cwd: repositoryRoot,
    fs: {
      fileExists: (fileName) => (virtualConfigs.has(fileName) ? true : undefined),
      readFile: (fileName) => virtualConfigs.get(fileName),
    },
  });
  try {
    const snapshot = await api.updateSnapshot({
      openProjects: projectFiles.map((file) => file.configFileName),
    });
    try {
      for (const { name, packageRoot, entries } of packageEntries) {
        const entryPoints: ApiEntryPoint[] = [];
        for (const entry of entries) {
          if (entry.kind === "asset") {
            entryPoints.push({ ...entry, exports: [] });
            continue;
          }
          const configFileName =
            entry.source === undefined ? undefined : configBySource.get(entry.source);
          const project =
            configFileName === undefined ? undefined : snapshot.getProject(configFileName);
          const analyzed = await analyzeEntry(name, packageRoot, entry, project);
          entryPoints.push(analyzed.entry);
          issues.push(...analyzed.issues);
        }
        if (entryPoints.length > 0) packages.push({ name, entryPoints });
      }
    } finally {
      await snapshot.dispose();
    }
  } finally {
    await api.close();
  }

  const manifest: PublicApiManifest = { formatVersion: 2, packages };
  issues.push(...validateManifest(manifest));

  const core = packages.find((pkg) => pkg.name === "@sheetwrite/core");
  const coreRoot = core?.entryPoints.find((entry) => entry.subpath === ".");
  const allExports = new Set(
    packages.flatMap((pkg) =>
      pkg.entryPoints.flatMap((entry) => entry.exports.map((item) => item.name)),
    ),
  );
  for (const name of FORBIDDEN_EXPORTS) {
    if (!allExports.has(name)) continue;
    issues.push({
      code: "forbidden-export",
      message: `Forbidden compatibility export: ${name}`,
      symbol: name,
    });
  }
  const coreExports = new Set(coreRoot?.exports.map((item) => item.name) ?? []);
  for (const name of REQUIRED_CORE_EXPORTS) {
    if (coreExports.has(name)) continue;
    issues.push({
      code: "missing-export",
      message: `Missing canonical @sheetwrite/core export: ${name}`,
      package: "@sheetwrite/core",
      entryPoint: ".",
      symbol: name,
    });
  }
  if (
    coreRoot !== undefined &&
    (coreRoot.source === "dist/index.d.ts" || coreRoot.source === "src/index.ts")
  ) {
    const builtDeclarations = coreRoot.source.startsWith("dist/");
    for (const [domainName, domain] of Object.entries(PUBLIC_TYPE_DOMAINS)) {
      const expectedOwner = builtDeclarations
        ? `dist/types/${domainName}.d.ts`
        : `src/types/${domainName}.ts`;
      for (const name of domain.exports) {
        const apiExport = coreRoot.exports.find((item) => item.name === name);
        if (apiExport === undefined) continue;
        if (apiExport.owners.length === 1 && apiExport.owners[0] === expectedOwner) continue;
        issues.push({
          code: "wrong-owner",
          message: `@sheetwrite/core ${name} must be owned by ${expectedOwner}; found ${apiExport.owners.join(", ") || "none"}`,
          package: "@sheetwrite/core",
          entryPoint: ".",
          symbol: name,
        });
      }
    }
  }

  issues.sort((left, right) =>
    [left.code, left.package ?? "", left.entryPoint ?? "", left.symbol ?? "", left.message]
      .join("\0")
      .localeCompare(
        [
          right.code,
          right.package ?? "",
          right.entryPoint ?? "",
          right.symbol ?? "",
          right.message,
        ].join("\0"),
      ),
  );
  return { manifest, issues };
}

function formatIssues(issues: readonly ApiIssue[]): string {
  return issues.map((issue) => `${issue.code}: ${issue.message}`).join("\n");
}

if (import.meta.main) {
  const mode = process.argv[2];
  const repositoryRoot = resolve(process.argv[3] ?? join(import.meta.dir, ".."));
  if (mode !== "report" && mode !== "check" && mode !== "baseline") {
    throw new Error("Usage: bun scripts/public-api.ts <report|check|baseline> [repository-root]");
  }
  const result = await analyzePublicApi(repositoryRoot);
  if (mode === "report") {
    if (
      result.issues.some(
        (issue) =>
          issue.code === "malformed-report" ||
          issue.code === "parse-error" ||
          issue.code === "unresolved-entry",
      )
    ) {
      throw new Error(formatIssues(result.issues));
    }
    process.stdout.write(`${JSON.stringify(result.manifest, null, 2)}\n`);
  } else if (mode === "baseline") {
    if (result.issues.length > 0) throw new Error(formatIssues(result.issues));
    const baseline = await writePublicApiBaseline(repositoryRoot, result.manifest);
    const exportCount = baseline.intentionalExports.reduce(
      (count, entry) => count + entry.exports.length,
      0,
    );
    process.stdout.write(`Public API baseline lists ${exportCount} exports\n`);
  } else {
    const baseline = await readPublicApiBaseline(repositoryRoot);
    const issues = [...result.issues, ...checkIntentionalExports(result.manifest, baseline)];
    if (issues.length > 0) throw new Error(formatIssues(issues));
    process.stdout.write("Public API policy check passed\n");
  }
}
