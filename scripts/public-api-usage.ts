import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  type Expression,
  isAwaitExpression,
  isCallExpression,
  isElementAccessExpression,
  isExportDeclaration,
  isIdentifier,
  isImportDeclaration,
  isImportTypeNode,
  isLiteralTypeNode,
  isNamedExports,
  isNamespaceImport,
  isObjectBindingPattern,
  isParenthesizedExpression,
  isPropertyAccessExpression,
  isQualifiedName,
  isStringLiteral,
  isVariableDeclaration,
  type Node,
  type SourceFile,
  SyntaxKind,
} from "typescript/unstable/ast";
import { API } from "typescript/unstable/async";

import {
  IGNORED_SOURCE_DIRECTORIES,
  type PublicApiBaseline,
  publicApiEntryKey,
  SOURCE_FILE_PATTERN,
} from "./public-api-baseline.js";
import {
  type ApiIssue,
  exists,
  packageDirectories,
  type PackageJson,
  type PublicApiManifest,
} from "./public-api.js";
import { readJson } from "./script-io.js";

async function sourceFiles(directory: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    if (entry.isDirectory() && IGNORED_SOURCE_DIRECTORIES[entry.name] === true) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await sourceFiles(path)));
    else if (entry.isFile() && SOURCE_FILE_PATTERN.test(entry.name)) files.push(path);
  }
  return files;
}

function scriptFragments(path: string, source: string): string[] {
  if (!/\.(?:svelte|vue)$/.test(path)) return [source];
  return [...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(
    (match) => match[1] ?? "",
  );
}

function collectImportedNames(
  sourceFile: SourceFile,
  specifiers: ReadonlyMap<string, string>,
  consumed: Map<string, Set<string>>,
): void {
  const record = (specifier: string, name: string): void => {
    const key = specifiers.get(specifier);
    if (key === undefined) return;
    const names = consumed.get(key) ?? new Set<string>();
    names.add(name);
    consumed.set(key, names);
  };
  const namespaceSpecifiers = new Map<string, string>();
  const dynamicImportSpecifier = (expression: Expression): string | undefined => {
    let current = expression;
    while (isAwaitExpression(current) || isParenthesizedExpression(current)) {
      current = current.expression;
    }
    if (!isCallExpression(current) || current.expression.kind !== SyntaxKind.ImportKeyword) {
      return undefined;
    }
    const argument = current.arguments[0];
    return current.arguments.length === 1 && argument !== undefined && isStringLiteral(argument)
      ? argument.text
      : undefined;
  };
  const visit = (node: Node): void => {
    if (
      isImportDeclaration(node) &&
      isStringLiteral(node.moduleSpecifier) &&
      node.importClause !== undefined
    ) {
      const specifier = node.moduleSpecifier.text;
      if (node.importClause.name !== undefined) record(specifier, "default");
      const bindings = node.importClause.namedBindings;
      if (bindings !== undefined) {
        if (isNamespaceImport(bindings)) {
          namespaceSpecifiers.set(bindings.name.text, specifier);
        } else {
          for (const element of bindings.elements) {
            record(specifier, element.propertyName?.text ?? element.name.text);
          }
        }
      }
    } else if (
      isExportDeclaration(node) &&
      node.moduleSpecifier !== undefined &&
      isStringLiteral(node.moduleSpecifier) &&
      node.exportClause !== undefined &&
      isNamedExports(node.exportClause)
    ) {
      const specifier = node.moduleSpecifier.text;
      for (const element of node.exportClause.elements) {
        record(specifier, element.propertyName?.text ?? element.name.text);
      }
    } else if (isVariableDeclaration(node) && node.initializer !== undefined) {
      const dynamicSpecifier = dynamicImportSpecifier(node.initializer);
      if (dynamicSpecifier !== undefined) {
        if (isIdentifier(node.name)) {
          namespaceSpecifiers.set(node.name.text, dynamicSpecifier);
        } else if (isObjectBindingPattern(node.name)) {
          for (const element of node.name.elements) {
            const importedName = element.propertyName ?? element.name;
            if (
              importedName !== undefined &&
              (isIdentifier(importedName) || isStringLiteral(importedName))
            ) {
              record(dynamicSpecifier, importedName.text);
            }
          }
        }
      } else if (
        isObjectBindingPattern(node.name) &&
        isIdentifier(node.initializer) &&
        namespaceSpecifiers.has(node.initializer.text)
      ) {
        const specifier = namespaceSpecifiers.get(node.initializer.text) ?? "";
        for (const element of node.name.elements) {
          const importedName = element.propertyName ?? element.name;
          if (
            importedName !== undefined &&
            (isIdentifier(importedName) || isStringLiteral(importedName))
          ) {
            record(specifier, importedName.text);
          }
        }
      }
    } else if (isPropertyAccessExpression(node)) {
      const dynamicSpecifier = dynamicImportSpecifier(node.expression);
      if (dynamicSpecifier !== undefined) {
        record(dynamicSpecifier, node.name.text);
      } else if (isIdentifier(node.expression)) {
        record(namespaceSpecifiers.get(node.expression.text) ?? "", node.name.text);
      }
    } else if (
      isElementAccessExpression(node) &&
      node.argumentExpression !== undefined &&
      isStringLiteral(node.argumentExpression)
    ) {
      const dynamicSpecifier = dynamicImportSpecifier(node.expression);
      if (dynamicSpecifier !== undefined) {
        record(dynamicSpecifier, node.argumentExpression.text);
      } else if (isIdentifier(node.expression)) {
        record(namespaceSpecifiers.get(node.expression.text) ?? "", node.argumentExpression.text);
      }
    } else if (
      isQualifiedName(node) &&
      isIdentifier(node.left) &&
      namespaceSpecifiers.has(node.left.text)
    ) {
      record(namespaceSpecifiers.get(node.left.text) ?? "", node.right.text);
    } else if (
      isImportTypeNode(node) &&
      isLiteralTypeNode(node.argument) &&
      isStringLiteral(node.argument.literal) &&
      node.qualifier !== undefined
    ) {
      record(node.argument.literal.text, node.qualifier.getText(sourceFile).split(".")[0] ?? "");
    }
    node.forEachChild(visit);
  };
  visit(sourceFile);
}

async function crossWorkspaceConsumers(
  repositoryRoot: string,
  manifest: PublicApiManifest,
): Promise<Map<string, Set<string>>> {
  const packageRoots = await packageDirectories(repositoryRoot);
  const packageWorkspaces = await Promise.all(
    packageRoots.map(async (root) => ({
      root,
      manifest: await readJson<PackageJson>(join(root, "package.json")),
    })),
  );
  const owningRoots = new Map(
    packageWorkspaces
      .filter(
        (workspace): workspace is { root: string; manifest: PackageJson & { name: string } } =>
          workspace.manifest.name !== undefined,
      )
      .map((workspace) => [workspace.manifest.name, workspace.root]),
  );
  const explicitConsumerRoots = await Promise.all(
    ["bench", "docs", "scripts", "test"].map(async (directory) => {
      const path = join(repositoryRoot, directory);
      return (await exists(path)) ? path : undefined;
    }),
  );
  const consumerRoots = [...new Set([...packageRoots, ...explicitConsumerRoots])].filter(
    (root): root is string => root !== undefined,
  );
  const consumed = new Map<string, Set<string>>();
  const virtualSources = new Map<string, string>();
  const parseTargets: Array<{ path: string; specifiers: ReadonlyMap<string, string> }> = [];
  for (const consumerRoot of consumerRoots) {
    const specifiers = new Map<string, string>();
    for (const pkg of manifest.packages) {
      if (owningRoots.get(pkg.name) === consumerRoot) continue;
      for (const entry of pkg.entryPoints) {
        if (entry.kind !== "typescript") continue;
        specifiers.set(
          entry.subpath === "." ? pkg.name : `${pkg.name}/${entry.subpath.slice(2)}`,
          publicApiEntryKey(pkg.name, entry.subpath),
        );
      }
    }
    if (specifiers.size === 0) continue;
    for (const path of await sourceFiles(consumerRoot)) {
      const source = await readFile(path, "utf8");
      // The manifest only reads import bindings, so each file — and each
      // `<script>` block — is parsed standalone as TSX through the API server,
      // which has no text-to-AST entry point of its own.
      scriptFragments(path, source).forEach((fragment, index) => {
        const virtualPath = `${path}.${index}.tsx`;
        virtualSources.set(virtualPath, fragment);
        parseTargets.push({ path: virtualPath, specifiers });
      });
    }
  }
  if (parseTargets.length === 0) return consumed;

  const api = new API({
    cwd: repositoryRoot,
    fs: {
      // Virtual paths hold synthetic fragments; the untouched callbacks keep
      // every other read on the real filesystem.
      fileExists: (fileName) => (virtualSources.has(fileName) ? true : undefined),
      readFile: (fileName) => virtualSources.get(fileName),
    },
  });
  try {
    const snapshot = await api.updateSnapshot({
      openFiles: parseTargets.map((target) => target.path),
    });
    try {
      for (const target of parseTargets) {
        const project = await snapshot.getDefaultProjectForFile(target.path);
        const sourceFile =
          project === undefined ? undefined : await project.program.getSourceFile(target.path);
        if (sourceFile === undefined) continue;
        collectImportedNames(sourceFile, target.specifiers, consumed);
      }
    } finally {
      await snapshot.dispose();
    }
  } finally {
    await api.close();
  }
  return consumed;
}

export async function findUnusedPublicExports(
  repositoryRoot: string,
  manifest: PublicApiManifest,
  baseline: PublicApiBaseline,
): Promise<ApiIssue[]> {
  const intended = new Map(
    baseline.intentionalExports.map((entry) => [
      publicApiEntryKey(entry.package, entry.entryPoint),
      new Set(entry.exports),
    ]),
  );
  const consumed = await crossWorkspaceConsumers(repositoryRoot, manifest);
  const issues: ApiIssue[] = [];
  for (const pkg of manifest.packages) {
    for (const entry of pkg.entryPoints) {
      if (entry.kind !== "typescript") continue;
      const key = publicApiEntryKey(pkg.name, entry.subpath);
      const intentionalNames = intended.get(key);
      const consumedNames = consumed.get(key);
      for (const apiExport of entry.exports) {
        if (
          intentionalNames?.has(apiExport.name) === true ||
          consumedNames?.has(apiExport.name) === true
        ) {
          continue;
        }
        issues.push({
          code: "unused-export",
          message: `${pkg.name} ${entry.subpath} exports ${apiExport.name} without an intentional public contract or cross-workspace consumer`,
          package: pkg.name,
          entryPoint: entry.subpath,
          symbol: apiExport.name,
        });
      }
    }
  }
  return issues.sort((left, right) =>
    [left.package ?? "", left.entryPoint ?? "", left.symbol ?? ""]
      .join("\0")
      .localeCompare([right.package ?? "", right.entryPoint ?? "", right.symbol ?? ""].join("\0")),
  );
}
