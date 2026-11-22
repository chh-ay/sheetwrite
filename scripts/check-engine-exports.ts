import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import {
  isBindingElement,
  isCallExpression,
  isClassDeclaration,
  isConstructorDeclaration,
  isElementAccessExpression,
  isFunctionDeclaration,
  isIdentifier,
  isMethodDeclaration,
  isInterfaceDeclaration,
  isPropertyAccessExpression,
  isNewExpression,
  isPropertyDeclaration,
  isStringLiteral,
  isTypeAliasDeclaration,
  type Node,
  SyntaxKind,
} from "typescript/unstable/ast";
import { API, SymbolFlags, type Project } from "typescript/unstable/async";

const BINDINGS = [
  "packages/wasm/pkg/sheetwrite_wasm.d.ts",
  "packages/formulas/pkg/sheetwrite_wasm.d.ts",
  "packages/wasm/pkg-history/sheetwrite_history.d.ts",
  "packages/queries/pkg/sheetwrite_queries.d.ts",
] as const;

// wasm-bindgen generates these; they are not exports of a Sheetwrite crate.
const GLUE_FUNCTIONS = new Set(["__wbg_init", "initSync"]);
// A declaration alone never counts: a caller must use the structural contract.
const ENGINE_CONTRACTS: Readonly<Record<string, string>> = {
  "packages/core/src/store/wasm-contract.ts:RecomputingCellStore": "CellStore",
  "packages/core/src/store/wasm-contract.ts:PivotOutputCells": "PivotOutput",
  "packages/core/src/store/wasm-contract.ts:PivotFieldList": "PivotFields",
  "packages/core/src/external-link.ts:ExternalLinkEngine": "CellStore",
};

const RUST_BINDING_SOURCES = [
  "packages/wasm/src",
  "packages/wasm/history/src",
  "packages/queries/engine/src",
] as const;
const CAMEL_CASE = /^[a-z][A-Za-z0-9]*$/u;

function rust_files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return rust_files(path);
    return entry.name.endsWith(".rs") ? [path] : [];
  });
}

function code_without_literals(line: string): string {
  return line
    .replace(/\/\/.*$/u, "")
    .replace(/"(?:\\.|[^"\\])*"/gu, '""')
    .replace(/'(?:\\.|[^'\\])'/gu, "''");
}

/** Every exported Rust function and method must name its JavaScript binding in camelCase. */
function binding_name_issues(root: string): string[] {
  const issues: string[] = [];
  for (const source_root of RUST_BINDING_SOURCES) {
    const directory = resolve(root, source_root);
    if (!existsSync(directory)) continue;
    for (const path of rust_files(directory)) {
      const lines = readFileSync(path, "utf8").split("\n");
      const exported_impl_depths: number[] = [];
      let attributes: string[] = [];
      let attribute_depth = 0;
      let depth = 0;
      for (const [index, line] of lines.entries()) {
        const trimmed = line.trim();
        if (attribute_depth > 0 || trimmed.startsWith("#[")) {
          attributes.push(trimmed);
          attribute_depth += (line.match(/\[/gu)?.length ?? 0) - (line.match(/\]/gu)?.length ?? 0);
          continue;
        }
        const attribute_text = attributes.join(" ");
        const is_binding_attribute = /wasm_bindgen/u.test(attribute_text);
        const inside_exported_impl = exported_impl_depths.at(-1) === depth;
        if (
          /^pub\s+(?:async\s+)?fn\s+\w+/u.test(trimmed) &&
          (is_binding_attribute || inside_exported_impl) &&
          !/\bconstructor\b/u.test(attribute_text)
        ) {
          const js_name = /js_name\s*=\s*"?([A-Za-z_][A-Za-z0-9_]*)"?/u.exec(attribute_text)?.[1];
          if (js_name === undefined || !CAMEL_CASE.test(js_name)) {
            issues.push(
              `${relative(root, path)}:${index + 1}: exported Rust function needs a camelCase js_name`,
            );
          }
        }
        const code = code_without_literals(line);
        if (is_binding_attribute && /^impl\b/u.test(trimmed)) exported_impl_depths.push(depth + 1);
        depth += (code.match(/\{/gu)?.length ?? 0) - (code.match(/\}/gu)?.length ?? 0);
        while ((exported_impl_depths.at(-1) ?? -1) > depth) exported_impl_depths.pop();
        if (trimmed !== "" && !trimmed.startsWith("///")) attributes = [];
      }
    }
  }
  return issues;
}

interface EngineExport {
  readonly binding: string;
  readonly name: string;
  readonly publicReason?: string;
  readonly callers: Set<string>;
}

export interface EngineExportAudit {
  readonly exports: readonly EngineExport[];
  readonly issues: readonly string[];
}

function source_files(directory: string): string[] {
  const paths: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (
      entry.name.startsWith(".") ||
      [
        "node_modules",
        "dist",
        "pkg",
        "pkg-history",
        "target",
        "out",
        "build",
        "coverage",
        "test-results",
      ].includes(entry.name)
    )
      continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) paths.push(...source_files(path));
    else if (/\.[cm]?[jt]sx?$/.test(entry.name) && !entry.name.endsWith(".d.ts")) paths.push(path);
  }
  return paths;
}

async function public_reason(node: Node, project: Project): Promise<string | undefined> {
  const symbol = await project.checker.getSymbolAtLocation(node);
  const tag = (await symbol?.getJsDocTags(project.checker))?.find(
    (candidate) => candidate.name === "enginePublic",
  );
  return tag?.text?.trim();
}

async function binding_exports(binding: string, project: Project): Promise<EngineExport[]> {
  const source = await project.program.getSourceFile(binding);
  if (source === undefined) throw new Error(`Cannot parse engine declarations: ${binding}`);
  const exports: EngineExport[] = [];
  for (const declaration of source.statements) {
    if (isFunctionDeclaration(declaration) && declaration.name !== undefined) {
      const name = declaration.name.text;
      if (!GLUE_FUNCTIONS.has(name)) {
        exports.push({
          binding,
          name,
          publicReason: await public_reason(declaration.name, project),
          callers: new Set(),
        });
      }
    } else if (isClassDeclaration(declaration) && declaration.name !== undefined) {
      for (const member of declaration.members) {
        if (isConstructorDeclaration(member)) {
          if (!member.modifiers?.some((modifier) => modifier.kind === SyntaxKind.PrivateKeyword)) {
            exports.push({
              binding,
              name: `${declaration.name.text}.constructor`,
              callers: new Set(),
              publicReason: await public_reason(declaration.name, project),
            });
          }
          continue;
        }
        // Resource release methods and Symbol.dispose are generated glue.
        if (!isMethodDeclaration(member) && !isPropertyDeclaration(member)) continue;
        if (!isIdentifier(member.name) || member.name.text === "free") continue;
        exports.push({
          binding,
          name: `${declaration.name.text}.${member.name.text}`,
          publicReason: await public_reason(member.name, project),
          callers: new Set(),
        });
      }
    }
  }
  return exports;
}

function declaration_key(node: Node): string | undefined {
  const parent = node.parent;
  if (
    (isMethodDeclaration(node) || isPropertyDeclaration(node)) &&
    parent !== undefined &&
    isClassDeclaration(parent)
  ) {
    if (parent.name !== undefined && isIdentifier(node.name))
      return `${parent.name.text}.${node.name.text}`;
  }
  if (isFunctionDeclaration(node) && node.name !== undefined) return node.name.text;
  if (isClassDeclaration(node) && node.name !== undefined) return `${node.name.text}.constructor`;
  return undefined;
}

function caller_references(node: Node, references: Node[]): void {
  if (isPropertyAccessExpression(node)) references.push(node.name);
  else if ((isCallExpression(node) || isNewExpression(node)) && isIdentifier(node.expression))
    references.push(node.expression);
  else if (isElementAccessExpression(node) && isStringLiteral(node.argumentExpression))
    references.push(node.argumentExpression);
  else if (isBindingElement(node)) {
    const property = node.propertyName ?? node.name;
    if (property !== undefined) references.push(property);
  }
  node.forEachChild((child) => caller_references(child, references));
}

async function collect_callers(
  root: string,
  project: Project,
  callers: readonly string[],
  exports: readonly EngineExport[],
): Promise<void> {
  const by_name = new Map<string, EngineExport[]>();
  const binding_paths = new Set(exports.map((entry) => entry.binding));
  for (const entry of exports) {
    const entries = by_name.get(entry.name) ?? [];
    entries.push(entry);
    by_name.set(entry.name, entries);
  }
  for (const caller of callers) {
    const source = await project.program.getSourceFile(caller);
    if (source === undefined) throw new Error(`Cannot parse caller: ${caller}`);
    const references: Node[] = [];
    caller_references(source, references);
    for (const candidate of await project.checker.getSymbolAtLocation(references)) {
      if (candidate === undefined) continue;
      let symbol =
        candidate.flags & SymbolFlags.Alias
          ? await project.checker.getAliasedSymbol(candidate)
          : candidate;
      const value_declaration = await symbol.valueDeclaration?.resolve(project);
      if (value_declaration !== undefined && isBindingElement(value_declaration)) {
        const property = value_declaration.propertyName ?? value_declaration.name;
        if (property !== undefined && (isIdentifier(property) || isStringLiteral(property))) {
          const type = await project.checker.getTypeAtLocation(value_declaration.parent);
          const original =
            type === undefined
              ? undefined
              : await project.checker.getPropertyOfType(type, property.text);
          if (original !== undefined) {
            symbol =
              original.flags & SymbolFlags.Alias
                ? await project.checker.getAliasedSymbol(original)
                : original;
          }
        }
      }
      for (const handle of symbol.declarations) {
        const declaration = await handle.resolve(project);
        if (declaration === undefined) continue;
        const path = declaration.getSourceFile().fileName;
        const key = declaration_key(declaration);
        if (binding_paths.has(path) && key !== undefined) {
          // Default/full bindings describe the same API; a caller through either is enough.
          for (const entry of by_name.get(key) ?? []) entry.callers.add(relative(root, caller));
        } else {
          let owner = declaration.parent;
          while (
            owner !== undefined &&
            !isInterfaceDeclaration(owner) &&
            !isTypeAliasDeclaration(owner)
          )
            owner = owner.parent;
          if (owner === undefined) continue;
          const engine_class = ENGINE_CONTRACTS[`${relative(root, path)}:${owner.name.text}`];
          if (engine_class === undefined) continue;
          for (const entry of by_name.get(`${engine_class}.${symbol.name}`) ?? [])
            entry.callers.add(relative(root, caller));
        }
      }
    }
  }
}

/** Audit built bindings. Only executable package/test/bench sources count, not generated glue or declarations. */
export async function auditEngineExports(root: string): Promise<EngineExportAudit> {
  const binding_paths = BINDINGS.map((binding) => resolve(root, binding));
  for (const binding of binding_paths) {
    if (!existsSync(binding))
      throw new Error(`Missing ${relative(root, binding)}; run bun run build:packages first`);
  }
  const callers = ["packages", "test", "bench"].flatMap((directory) => {
    const path = resolve(root, directory);
    return existsSync(path) ? source_files(path) : [];
  });
  const config = resolve(root, "tsconfig.engine-export-audit.json");
  const config_text = JSON.stringify({
    compilerOptions: {
      allowJs: true,
      module: "esnext",
      moduleResolution: "bundler",
      target: "esnext",
      skipLibCheck: true,
      noEmit: true,
    },
    files: [...binding_paths, ...callers],
  });
  const api = new API({
    cwd: root,
    fs: {
      fileExists: (path) => (path === config ? true : undefined),
      readFile: (path) => (path === config ? config_text : undefined),
    },
  });
  try {
    const snapshot = await api.updateSnapshot({ openProjects: [config] });
    try {
      const project = snapshot.getProject(config);
      if (project === undefined) throw new Error("Cannot open engine export audit project");
      const exports = (
        await Promise.all(binding_paths.map((binding) => binding_exports(binding, project)))
      ).flat();
      await collect_callers(root, project, callers, exports);
      const issues = exports
        .filter((entry) => entry.callers.size === 0 && !entry.publicReason)
        .map(
          (entry) =>
            `${relative(root, entry.binding)}: ${entry.name} has no package/test/bench caller; remove it or document @enginePublic with a reason`,
        );
      return { exports, issues: [...binding_name_issues(root), ...issues] };
    } finally {
      await snapshot.dispose();
    }
  } finally {
    await api.close();
  }
}

if (import.meta.main) {
  const root = resolve(import.meta.dir, "..");
  const audit = await auditEngineExports(root);
  if (process.argv.includes("--report")) {
    for (const entry of audit.exports) {
      process.stdout.write(
        `${relative(root, entry.binding)}\t${entry.name}\t${[...entry.callers].join(", ") || entry.publicReason || "UNCALLED"}\n`,
      );
    }
  }
  if (audit.issues.length > 0) {
    process.stderr.write(`${audit.issues.join("\n")}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write(
      `Engine export name and caller check passed (${audit.exports.length} bindings)\n`,
    );
  }
}
