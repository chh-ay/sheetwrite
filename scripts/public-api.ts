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
  checkPublicApiBaseline,
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
    | "changed-signature"
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
  "setXlsxTableExportBackend",
  "setXlsxTableImportBackend",
  "setXlsxWorkbookBackend",
  "setXlsxSourceVerifier",
  "setChartRendererFactory",
  "setChartViewProviderFactory",
  "registerChartsBackend",
  "registerXlsxBackends",
  "registerFunction",
  "unregisterFunction",
  "registerQueryCommands",
  "createQuerySession",
  "createHistoryCommands",
  "connectExternalLinks",
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
  "toXlsxWorkbook",
  "fromXlsxWorkbook",
  "XlsxWorkbookBackend",
  "initSheetwrite",
  "SheetwriteAddon",
]);

const SUPPORTED_PACKAGES: Readonly<Record<string, true>> = {
  "@sheetwrite/charts": true,
  "@sheetwrite/core": true,
  "@sheetwrite/formula-assist": true,
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

function select_types_target(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (value === null || typeof value !== "object") return undefined;
  const conditions = value as Record<string, unknown>;
  const preferred = conditions.types ?? conditions.svelte ?? conditions.default;
  if (preferred !== undefined) return select_types_target(preferred);
  for (const nested of Object.values(conditions)) {
    const target = select_types_target(nested);
    if (target !== undefined) return target;
  }
  return undefined;
}

function exported_subpaths(manifest: PackageJson): Array<[string, string]> {
  const entries: Array<[string, string]> = [];
  if (manifest.exports !== undefined) {
    if (typeof manifest.exports === "string") return [[".", manifest.exports]];
    if (manifest.exports !== null && typeof manifest.exports === "object") {
      for (const [subpath, value] of Object.entries(manifest.exports)) {
        if (!subpath.startsWith(".")) continue;
        const target = select_types_target(value);
        if (target !== undefined) entries.push([subpath, target]);
      }
    }
  } else if (manifest.types !== undefined) {
    entries.push([".", manifest.types]);
  }
  return entries.sort(([left], [right]) => left.localeCompare(right));
}

function is_typescript_target(target: string): boolean {
  return /(?:\.d)?\.[cm]?tsx?$/.test(target);
}

async function resolve_source(package_root: string, target: string): Promise<string | undefined> {
  const normalized = target.replace(/^\.\//, "");
  const published = resolve(package_root, normalized);
  const source_candidates: string[] = [];
  if (normalized.startsWith("dist/")) {
    const source_path = normalized.slice("dist/".length);
    source_candidates.push(
      join(package_root, "src", source_path.replace(/\.d\.[cm]?ts$/, ".ts")),
      join(package_root, "src", source_path.replace(/\.d\.[cm]?ts$/, ".tsx")),
      join(package_root, "src", source_path.replace(/\.[cm]?js$/, ".ts")),
    );
  }
  if (/\.[cm]?js$/.test(normalized)) {
    source_candidates.push(resolve(package_root, normalized.replace(/\.[cm]?js$/, ".ts")));
    source_candidates.push(resolve(package_root, normalized.replace(/\.[cm]?js$/, ".tsx")));
  }

  for (const candidate of source_candidates) {
    if (await exists(candidate)) return candidate;
  }
  if (await exists(published)) return published;
  return undefined;
}

export async function packageDirectories(repositoryRoot: string): Promise<string[]> {
  const root_manifest = await readJson<PackageJson>(join(repositoryRoot, "package.json"));
  const directories: string[] = [];
  for (const workspace of root_manifest.workspaces ?? []) {
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

function classify_entry(
  package_name: string,
  subpath: string,
  kind: "typescript" | "asset",
): ApiEntryClassification | undefined {
  if (kind === "asset") return "asset";
  if (package_name === "@sheetwrite/core" && subpath === "./testing") return "test-only";
  if (
    (package_name === "@sheetwrite/wasm" || package_name === "@sheetwrite/formulas") &&
    subpath === "."
  )
    return "internal";
  // `@sheetwrite/core/history` loads the diff kernel; hosts only point at its WASM asset.
  if (package_name === "@sheetwrite/wasm" && subpath === "./history") return "internal";
  // Sheetwrite's own codecs reach core's codec plumbing here; applications do not.
  if (package_name === "@sheetwrite/core" && subpath === "./codec") return "internal";
  if (SUPPORTED_PACKAGES[package_name] === true) return "supported";
  return undefined;
}

async function resolve_entries(
  package_root: string,
  manifest: PackageJson,
): Promise<{ entries: ResolvedEntry[]; issues: ApiIssue[] }> {
  const entries: ResolvedEntry[] = [];
  const issues: ApiIssue[] = [];
  const package_name = manifest.name ?? "";
  for (const [subpath, target] of exported_subpaths(manifest)) {
    const kind = is_typescript_target(target) ? "typescript" : "asset";
    const classification = classify_entry(package_name, subpath, kind);
    if (classification === undefined) {
      issues.push({
        code: "unclassified-entry",
        message: `${package_name} ${subpath} (${target}) has no public API classification`,
        package: package_name,
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
      source: await resolve_source(package_root, target),
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

function entry_project_file(
  repository_root: string,
  index: number,
  source: string,
): EntryProjectFile {
  return {
    source,
    configFileName: join(repository_root, `tsconfig.public-api.${index}.json`),
    contents: `${JSON.stringify({ compilerOptions: ENTRY_COMPILER_OPTIONS, files: [source] }, null, 2)}\n`,
  };
}

async function analyze_entry(
  package_name: string,
  package_root: string,
  entry: ResolvedEntry,
  project: Project | undefined,
): Promise<{ entry: ApiEntryPoint; issues: ApiIssue[] }> {
  const issues: ApiIssue[] = [];
  if (entry.source === undefined) {
    issues.push({
      code: "unresolved-entry",
      message: `${package_name}${entry.subpath === "." ? "" : entry.subpath.slice(1)} cannot resolve ${entry.target}`,
      package: package_name,
      entryPoint: entry.subpath,
    });
    return { entry: { ...entry, exports: [] }, issues };
  }

  const source_file =
    project === undefined ? undefined : await project.program.getSourceFile(entry.source);
  if (project === undefined || source_file === undefined) {
    issues.push({
      code: "parse-error",
      message: `${package_name} ${entry.subpath} was resolved but not parsed`,
      package: package_name,
      entryPoint: entry.subpath,
    });
    return {
      entry: { ...entry, source: posix(relative(package_root, entry.source)), exports: [] },
      issues,
    };
  }

  for (const diagnostic of await project.program.getSyntacticDiagnostics(entry.source)) {
    issues.push({
      code: "parse-error",
      message: diagnosticText(diagnostic),
      package: package_name,
      entryPoint: entry.subpath,
    });
  }
  for (const diagnostic of await project.program.getSemanticDiagnostics()) {
    if (diagnostic.code !== duplicateExportDiagnosticCode) continue;
    issues.push({
      code: "duplicate-export",
      message: diagnosticText(diagnostic),
      package: package_name,
      entryPoint: entry.subpath,
    });
  }

  const checker = project.checker;
  const module_symbol = await checker.getSymbolAtLocation(source_file);
  if (module_symbol === undefined) {
    issues.push({
      code: "parse-error",
      message: `${package_name} ${entry.subpath} is not an external module`,
      package: package_name,
      entryPoint: entry.subpath,
    });
    return {
      entry: { ...entry, source: posix(relative(package_root, entry.source)), exports: [] },
      issues,
    };
  }

  const merged_declaration_symbols: string[] = [];
  const api_exports: ApiExport[] = [];
  for (const exported of await checker.getExportsOfModule(module_symbol)) {
    api_exports.push(
      await describe_export(exported, package_root, project, merged_declaration_symbols),
    );
  }

  api_exports.sort((left, right) => left.name.localeCompare(right.name));
  issues.push(
    ...export_policy_issues(package_name, entry, api_exports, merged_declaration_symbols),
  );

  return {
    entry: {
      subpath: entry.subpath,
      target: entry.target,
      source: posix(relative(package_root, entry.source)),
      kind: entry.kind,
      classification: entry.classification,
      exports: api_exports,
    },
    issues,
  };
}

/**
 * Read one export's declarations, source link, tags and documentation from
 * the compiler. Exports that merge several structural declarations are
 * recorded in `merged_declaration_symbols`.
 */
async function describe_export(
  exported: ApiSymbol,
  package_root: string,
  project: Project,
  merged_declaration_symbols: string[],
): Promise<ApiExport> {
  const target = await resolvedSymbol(exported, project);
  const declarations = await declarationsOf(target, project);
  const structural_declarations = declarations.filter(
    (candidate) =>
      isInterfaceDeclaration(candidate) ||
      isTypeAliasDeclaration(candidate) ||
      isEnumDeclaration(candidate),
  );
  if (structural_declarations.length > 1) merged_declaration_symbols.push(exported.name);

  const owners = new Set(
    declarations.map((declaration) =>
      posix(relative(package_root, declaration.getSourceFile().fileName)),
    ),
  );
  const declaration = declarations[0];
  const source =
    declaration === undefined
      ? ""
      : `${posix(relative(package_root, declaration.getSourceFile().fileName))}#L${
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
function export_policy_issues(
  package_name: string,
  entry: ResolvedEntry,
  api_exports: readonly ApiExport[],
  merged_declaration_symbols: readonly string[],
): ApiIssue[] {
  const issues: ApiIssue[] = [];
  const issue = (code: ApiIssue["code"], message: string, symbol: string): void => {
    issues.push({ code, message, package: package_name, entryPoint: entry.subpath, symbol });
  };

  for (const symbol of merged_declaration_symbols) {
    issue(
      "duplicate-export",
      `${package_name} ${entry.subpath} export ${symbol} merges multiple structural declarations; the joined signature cannot render as one declaration`,
      symbol,
    );
  }

  for (const api_export of api_exports) {
    if (api_export.owners.length > 1) {
      issue(
        "duplicate-export",
        `${package_name} ${entry.subpath} gives ${api_export.name} multiple owners: ${api_export.owners.join(", ")}`,
        api_export.name,
      );
    }

    if (api_export.jsDocTags.includes("deprecated")) {
      issue(
        "deprecated-symbol",
        `${package_name} ${entry.subpath} exports deprecated symbol ${api_export.name}`,
        api_export.name,
      );
    }

    if (entry.classification !== "supported") continue;

    if (api_export.documentation.trim().length === 0) {
      issue(
        "missing-documentation",
        `${package_name} ${entry.subpath} export ${api_export.name} has no source JSDoc summary`,
        api_export.name,
      );
    }

    const error_contract_issue = unstableErrorContract(api_export);
    if (error_contract_issue !== null) {
      issue(
        "unstable-error-contract",
        `${package_name} ${entry.subpath} export ${error_contract_issue}`,
        api_export.name,
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
  const package_entries: Array<{
    name: string;
    packageRoot: string;
    entries: ResolvedEntry[];
  }> = [];
  for (const package_root of await packageDirectories(repositoryRoot)) {
    const package_manifest = await readJson<PackageJson>(join(package_root, "package.json"));
    if (package_manifest.name === undefined || package_manifest.private === true) continue;
    const resolved = await resolve_entries(package_root, package_manifest);
    issues.push(...resolved.issues);
    package_entries.push({
      name: package_manifest.name,
      packageRoot: package_root,
      entries: resolved.entries,
    });
  }

  // Each entry point is analyzed in its own single-root project, reproducing
  // the program the classic compiler API built for it — including the closure
  // of files that program contained, which drives the diagnostics reported.
  const project_files = [
    ...new Set(
      package_entries.flatMap(({ entries }) =>
        entries.flatMap((entry) => (entry.source === undefined ? [] : [entry.source])),
      ),
    ),
  ].map((source, index) => entry_project_file(repositoryRoot, index, source));
  const virtual_configs = new Map(
    project_files.map((file) => [file.configFileName, file.contents]),
  );
  const config_by_source = new Map(project_files.map((file) => [file.source, file.configFileName]));
  const api = new API({
    cwd: repositoryRoot,
    fs: {
      fileExists: (file_name) => (virtual_configs.has(file_name) ? true : undefined),
      readFile: (file_name) => virtual_configs.get(file_name),
    },
  });
  try {
    const snapshot = await api.updateSnapshot({
      openProjects: project_files.map((file) => file.configFileName),
    });
    try {
      for (const { name, packageRoot: package_root, entries } of package_entries) {
        const entry_points: ApiEntryPoint[] = [];
        for (const entry of entries) {
          if (entry.kind === "asset") {
            entry_points.push({ ...entry, exports: [] });
            continue;
          }
          const config_file_name =
            entry.source === undefined ? undefined : config_by_source.get(entry.source);
          const project =
            config_file_name === undefined ? undefined : snapshot.getProject(config_file_name);
          const analyzed = await analyze_entry(name, package_root, entry, project);
          entry_points.push(analyzed.entry);
          issues.push(...analyzed.issues);
        }
        if (entry_points.length > 0) packages.push({ name, entryPoints: entry_points });
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
  const core_root = core?.entryPoints.find((entry) => entry.subpath === ".");
  const all_exports = new Set(
    packages.flatMap((pkg) =>
      pkg.entryPoints.flatMap((entry) => entry.exports.map((item) => item.name)),
    ),
  );
  for (const name of FORBIDDEN_EXPORTS) {
    if (!all_exports.has(name)) continue;
    issues.push({
      code: "forbidden-export",
      message: `Forbidden compatibility export: ${name}`,
      symbol: name,
    });
  }
  const core_exports = new Set(core_root?.exports.map((item) => item.name) ?? []);
  for (const name of REQUIRED_CORE_EXPORTS) {
    if (core_exports.has(name)) continue;
    issues.push({
      code: "missing-export",
      message: `Missing canonical @sheetwrite/core export: ${name}`,
      package: "@sheetwrite/core",
      entryPoint: ".",
      symbol: name,
    });
  }
  if (
    core_root !== undefined &&
    (core_root.source === "dist/index.d.ts" || core_root.source === "src/index.ts")
  ) {
    const built_declarations = core_root.source.startsWith("dist/");
    for (const [domain_name, domain] of Object.entries(PUBLIC_TYPE_DOMAINS)) {
      const expected_owner = built_declarations
        ? `dist/types/${domain_name}.d.ts`
        : `src/types/${domain_name}.ts`;
      for (const name of domain.exports) {
        const api_export = core_root.exports.find((item) => item.name === name);
        if (api_export === undefined) continue;
        if (api_export.owners.length === 1 && api_export.owners[0] === expected_owner) continue;
        issues.push({
          code: "wrong-owner",
          message: `@sheetwrite/core ${name} must be owned by ${expected_owner}; found ${api_export.owners.join(", ") || "none"}`,
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

function format_issues(issues: readonly ApiIssue[]): string {
  return issues.map((issue) => `${issue.code}: ${issue.message}`).join("\n");
}

if (import.meta.main) {
  const mode = process.argv[2];
  const repository_root = resolve(process.argv[3] ?? join(import.meta.dir, ".."));
  if (mode !== "check" && mode !== "baseline") {
    throw new Error("Usage: bun scripts/public-api.ts <check|baseline> [repository-root]");
  }
  const result = await analyzePublicApi(repository_root);
  if (mode === "baseline") {
    if (result.issues.length > 0) throw new Error(format_issues(result.issues));
    const baseline = await writePublicApiBaseline(repository_root, result.manifest);
    const export_count = Object.keys(baseline.exports).length;
    process.stdout.write(`Public API baseline lists ${export_count} exports\n`);
  } else {
    const baseline = await readPublicApiBaseline(repository_root);
    const issues = [...result.issues, ...checkPublicApiBaseline(result.manifest, baseline)];
    if (issues.length > 0) throw new Error(format_issues(issues));
    process.stdout.write("Public API policy check passed\n");
  }
}
