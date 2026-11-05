import {
  type ExpressionWithTypeArguments,
  getJSDocTags,
  getTextOfJSDocComment,
  type HeritageClause,
  type InterfaceDeclaration,
  isBlock,
  isClassDeclaration,
  isExportSpecifier,
  isInterfaceDeclaration,
  isJSDoc,
  isJSDocSeeTag,
  isTypeAliasDeclaration,
  isVariableStatement,
  type ModifiersBase,
  type Node,
  type NodeArray,
  type PropertyName,
  SyntaxKind,
} from "typescript/unstable/ast";
import {
  type Diagnostic,
  NodeBuilderFlags,
  type Project,
  type Signature,
  SignatureKind,
  type Symbol as ApiSymbol,
  SymbolFlags,
  type Type,
} from "typescript/unstable/async";

import type { ApiExport, ApiMemberDoc } from "./public-api.js";

function normalizeText(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|\s)\/\/[^\n\r]*/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * `TypeFormatFlags` is not part of the TypeScript 7 API surface, but its values
 * are unchanged; these are the two flags the manifest has always rendered with.
 */
const TYPE_FORMAT_FLAGS = {
  NoTruncation: 1,
  UseAliasDefinedOutsideCurrentScope: 1 << 14,
} as const;

const TYPE_STRING_FLAGS =
  TYPE_FORMAT_FLAGS.NoTruncation | TYPE_FORMAT_FLAGS.UseAliasDefinedOutsideCurrentScope;

/**
 * TypeScript 7 renders signatures as declaration nodes. These are the builder
 * flags classic `Checker.signatureToString` used: the flags mapped from
 * `TypeFormatFlags` plus `IgnoreErrors | WriteTypeParametersInQualifiedName`.
 */
const SIGNATURE_BUILDER_FLAGS =
  NodeBuilderFlags.NoTruncation |
  NodeBuilderFlags.UseAliasDefinedOutsideCurrentScope |
  NodeBuilderFlags.IgnoreErrors |
  NodeBuilderFlags.WriteTypeParametersInQualifiedName;

/** TypeScript reports an ambiguous duplicate re-export under this code. */
export const duplicateExportDiagnosticCode = 2308;

/** `flattenDiagnosticMessageText` with the newline separator the report used. */
export function diagnosticText(diagnostic: Diagnostic, indent = 0): string {
  const chain = diagnostic.messageChain ?? [];
  return `${"\n".repeat(indent)}${diagnostic.text}${chain
    .map((message) => diagnosticText(message, indent + 1))
    .join("")}`;
}

/** Every member except call and index signatures carries a name. */
type NamedElement = Node & { readonly name?: PropertyName };

/** Types that can carry heritage clauses, so members can inherit documents. */
type HeritageCarrier = Node & { readonly heritageClauses?: NodeArray<HeritageClause> };

/**
 * `Symbol.declarations` holds node handles; the analysis walks real AST nodes.
 * Handles that no longer resolve are dropped, as if the declaration were absent.
 */
export async function declarationsOf(symbol: ApiSymbol, project: Project): Promise<Node[]> {
  const declarations = await Promise.all(
    symbol.declarations.map((handle) => handle.resolve(project)),
  );
  return declarations.filter((declaration): declaration is Node => declaration !== undefined);
}

/** `getModifiers` reported syntactic modifiers, so only the written ones count. */
function hasModifier(node: Node, kind: SyntaxKind): boolean {
  const modifiers = (node as ModifiersBase).modifiers;
  return modifiers?.some((modifier) => modifier.kind === kind) === true;
}

/**
 * Comment text of the JSDoc blocks documenting a node, in source order. A
 * variable declaration is documented by the statement that declares it alone,
 * mirroring where the compiler looks for its comments.
 */
function jsDocCommentTexts(node: Node): string[] {
  const hosts = [node];
  const statement = node.parent?.parent;
  if (
    statement !== undefined &&
    isVariableStatement(statement) &&
    statement.declarationList.declarations.length === 1 &&
    statement.declarationList.declarations[0] === node
  ) {
    hosts.push(statement);
  }
  const comments: string[] = [];
  for (const host of hosts) {
    // Only the last block written on a node documents it; earlier blocks are
    // stray prose the compiler ignores.
    const block = (host.jsDoc ?? []).filter(isJSDoc).at(-1);
    if (block === undefined) continue;
    const comment = getTextOfJSDocComment(block.comment);
    if (comment !== undefined && comment.length > 0) comments.push(comment);
    // Inherited framework props keep their summaries, not upstream documentation tags.
    if (host.getSourceFile().fileName.includes("node_modules")) continue;
    for (const tag of block.tags ?? []) {
      if (!["example", "see"].includes(tag.tagName.text)) continue;
      const comment = getTextOfJSDocComment(tag.comment) ?? "";
      const reference = isJSDocSeeTag(tag) ? tag.nameExpression?.getText() : undefined;
      const text = [reference, comment].filter(Boolean).join(" ");
      comments.push(`@${tag.tagName.text}\n${text}`);
    }
  }
  return comments;
}

/** JSDoc comment text of a node, as `getJSDocCommentsAndTags` joined it. */
function jsDocCommentText(node: Node): string {
  return jsDocCommentTexts(node).join("\n").trim();
}

export function mergeDocumentation(sources: readonly string[]): string {
  const summaries: string[] = [];
  const tags: string[] = [];
  for (const source of sources) {
    for (const block of source.split(/(?=^@(?:example|see)\b)/m)) {
      const text = block.trim();
      if (text.length === 0) continue;
      (text.startsWith("@") ? tags : summaries).push(text);
    }
  }
  // Re-export prose must precede tags, or it becomes part of the last tag's body.
  return [...new Set(summaries), ...new Set(tags)].join("\n");
}

/**
 * Documentation of a symbol, as the classic `getDocumentationComment` reported
 * it: the JSDoc comments its own declarations carry, or — when they carry none
 * — the comments of the same-named member it inherits from a base type, which
 * is how implemented-interface documentation reaches a class member. Comments
 * come from the AST because the API server renders `{@link …}` links as plain
 * text, while the manifest documents them as links.
 */
export async function symbolDocumentation(
  symbol: ApiSymbol,
  project: Project,
  visited: Set<ApiSymbol> = new Set(),
): Promise<string> {
  const declarations = await declarationsOf(symbol, project);
  const comments: string[] = [];
  for (const declaration of declarations) {
    for (const comment of jsDocCommentTexts(declaration)) {
      if (!comments.includes(comment)) comments.push(comment);
    }
  }
  if (comments.length > 0) return mergeDocumentation(comments);
  if (visited.has(symbol)) return "";
  visited.add(symbol);
  for (const declaration of declarations) {
    const inherited = await inheritedMemberDocumentation(declaration, project, visited);
    if (inherited.length > 0) return inherited;
  }
  return "";
}

/** Documentation a member declaration inherits from the base type declaring it. */
async function inheritedMemberDocumentation(
  declaration: Node,
  project: Project,
  visited: Set<ApiSymbol>,
): Promise<string> {
  const name = (declaration as Partial<NamedElement>).name?.getText();
  if (name === undefined) return "";
  const staticMember = hasModifier(declaration, SyntaxKind.StaticKeyword);
  for (const clause of (declaration.parent as Partial<HeritageCarrier>).heritageClauses ?? []) {
    for (const base of clause.types) {
      const baseType = await project.checker.getTypeAtLocation(base);
      if (baseType === undefined) continue;
      // The static side of a base type is reachable through its value symbol.
      const baseSymbol = staticMember ? await baseType.getSymbol() : undefined;
      const inheritedType =
        baseSymbol === undefined ? baseType : await project.checker.getTypeOfSymbol(baseSymbol);
      if (inheritedType === undefined) continue;
      const member = await project.checker.getPropertyOfType(inheritedType, name);
      if (member === undefined || visited.has(member)) continue;
      const documentation = await symbolDocumentation(member, project, visited);
      if (documentation.length > 0) return documentation;
    }
  }
  return "";
}

/**
 * Classic `Checker.signatureToString` printed call signatures through a
 * single-line writer that turned every line break into one space and dropped
 * indentation, and deferred the trailing semicolon; the emitter keeps the
 * declaration's own line breaks and terminates it.
 */
async function signatureText(
  signature: Signature,
  declaration: Node,
  project: Project,
): Promise<string> {
  const node = await project.checker.signatureToSignatureDeclaration(
    signature,
    SyntaxKind.CallSignature,
    declaration,
    SIGNATURE_BUILDER_FLAGS,
  );
  if (node === undefined) return "";
  return (await project.emitter.printNode(node)).replace(/\n[ \t]*/g, " ").replace(/;$/, "");
}

/** Documentation attached to a signature's declaration. */
async function signatureDocumentation(signature: Signature, project: Project): Promise<string> {
  const declaration = await signature.declaration?.resolve(project);
  if (declaration === undefined) return "";
  return jsDocCommentTexts(declaration).join("\n");
}

export function symbolKind(symbol: ApiSymbol): string {
  const flags = symbol.flags;
  if (flags & SymbolFlags.Class) return "class";
  if (flags & SymbolFlags.Interface) return "interface";
  if (flags & SymbolFlags.TypeAlias) return "type";
  if (flags & SymbolFlags.Enum) return "enum";
  if (flags & SymbolFlags.Function) return "function";
  if (flags & SymbolFlags.Variable) return "variable";
  if (flags & SymbolFlags.NamespaceModule) return "namespace";
  return "symbol";
}

async function isPrivateSymbol(symbol: ApiSymbol, project: Project): Promise<boolean> {
  const declarations = await declarationsOf(symbol, project);
  return (
    declarations.length > 0 &&
    declarations.every((declaration) => hasModifier(declaration, SyntaxKind.PrivateKeyword))
  );
}

async function publicPropertySignature(
  symbol: ApiSymbol,
  project: Project,
  prefix = "",
): Promise<string | undefined> {
  if ((await isPrivateSymbol(symbol, project)) || symbol.name === "prototype") return undefined;
  const location = (await declarationsOf(symbol, project))[0];
  if (location === undefined) return undefined;
  const checker = project.checker;
  const type = await checker.getTypeOfSymbolAtLocation(symbol, location);
  const optional = symbol.flags & SymbolFlags.Optional ? "?" : "";
  return `${prefix}${symbol.name}${optional}: ${await checker.typeToString(
    type,
    location,
    TYPE_STRING_FLAGS,
  )}`;
}

export async function memberDocumentation(
  symbol: ApiSymbol,
  project: Project,
): Promise<ApiMemberDoc[]> {
  const checker = project.checker;
  const docs = new Map<string, string>();
  const record = (name: string, documentation: string): void => {
    if (documentation.length > 0 && !docs.has(name)) docs.set(name, documentation);
  };
  const collectFromType = async (type: Type): Promise<void> => {
    for (const property of await checker.getPropertiesOfType(type)) {
      if ((await isPrivateSymbol(property, project)) || property.name === "prototype") continue;
      record(property.name, (await symbolDocumentation(property, project)).trim());
    }
    const signatureKinds = [
      [SignatureKind.Call, "call"],
      [SignatureKind.Construct, "new"],
    ] as const;
    for (const [kind, name] of signatureKinds) {
      for (const signature of await checker.getSignaturesOfType(type, kind)) {
        record(name, (await signatureDocumentation(signature, project)).trim());
      }
    }
    for (const info of await checker.getIndexInfosOfType(type)) {
      const declaration = await info.declaration?.resolve(project);
      if (declaration === undefined) continue;
      record("index", jsDocCommentText(declaration));
    }
  };
  const declarations = await declarationsOf(symbol, project);
  if (symbol.flags & (SymbolFlags.Interface | SymbolFlags.Class)) {
    await collectFromType(await checker.getDeclaredTypeOfSymbol(symbol));
  }
  const classDeclaration = declarations.find(isClassDeclaration);
  if (classDeclaration !== undefined) {
    await collectFromType(await checker.getTypeOfSymbolAtLocation(symbol, classDeclaration));
  }
  const aliasDeclaration = declarations.find(isTypeAliasDeclaration);
  if (aliasDeclaration !== undefined) {
    const aliasType = await checker.getTypeAtLocation(aliasDeclaration.type);
    if (aliasType !== undefined) await collectFromType(aliasType);
  }
  return [...docs.entries()]
    .map(([name, documentation]) => ({ name, documentation }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

async function classSignature(symbol: ApiSymbol, project: Project): Promise<string> {
  const checker = project.checker;
  const declaration = (await declarationsOf(symbol, project)).find(isClassDeclaration);
  if (declaration === undefined) return `class ${symbol.name}`;
  const instanceType = await checker.getDeclaredTypeOfSymbol(symbol);
  const valueType = await checker.getTypeOfSymbolAtLocation(symbol, declaration);
  const heritage = declaration.heritageClauses
    ?.map((clause) => clause.getText(declaration.getSourceFile()).replace(/\s+/g, " ").trim())
    .join(" ");
  const constructors = (
    await Promise.all(
      (await checker.getSignaturesOfType(valueType, SignatureKind.Construct)).map((signature) =>
        signatureText(signature, declaration, project),
      ),
    )
  )
    // `(args): Instance` is a call signature — invalid inside a class body.
    .map((signature) => `constructor${signature.replace(/\)\s*:\s*[^:]*$/, ")")}`)
    // A default constructor adds nothing the class name doesn't already say.
    .filter((signature) => signature !== "constructor()");
  const sourceFile = declaration.getSourceFile();
  const declaredHere = async (property: ApiSymbol): Promise<ApiSymbol | undefined> => {
    const memberDeclarations = await declarationsOf(property, project);
    return memberDeclarations.some(
      (memberDeclaration) =>
        memberDeclaration.getSourceFile().fileName === sourceFile.fileName &&
        memberDeclaration.pos >= declaration.pos &&
        memberDeclaration.end <= declaration.end,
    )
      ? property
      : undefined;
  };
  // Inherited platform members (Error.name/message/stack) are noise here, so
  // only properties declared in the class body are listed.
  const declaredMembers = async (type: Type): Promise<ApiSymbol[]> =>
    (await Promise.all((await checker.getPropertiesOfType(type)).map(declaredHere))).filter(
      (property): property is ApiSymbol => property !== undefined,
    );
  const members = (
    await Promise.all(
      (await declaredMembers(instanceType)).map((property) =>
        publicPropertySignature(property, project),
      ),
    )
  ).filter((signature): signature is string => signature !== undefined);
  const staticMembers = (
    await Promise.all(
      (await declaredMembers(valueType)).map((property) =>
        publicPropertySignature(property, project, "static "),
      ),
    )
  ).filter((signature): signature is string => signature !== undefined);
  const body = [...constructors, ...members.sort(), ...staticMembers.sort()].join("; ");
  const head = heritage ? `class ${symbol.name} ${heritage}` : `class ${symbol.name}`;
  return body.length > 0 ? `${head} { ${body} }` : `${head} {}`;
}
/**
 * True when a heritage base resolves to declarations owned by this repository
 * rather than a dependency or the TypeScript libs. Workspace packages resolve
 * through realpath, so third-party bases are exactly the ones that still live
 * under `node_modules`.
 */
async function isSheetwriteOwnedBase(
  base: ExpressionWithTypeArguments,
  project: Project,
): Promise<boolean> {
  const type = await project.checker.getTypeAtLocation(base);
  if (type === undefined) return false;
  const aliasSymbol = await type.getAliasSymbol();
  const symbol = aliasSymbol ?? (await type.getSymbol());
  if (symbol === undefined) return false;
  const declarations = await declarationsOf(symbol, project);
  if (declarations.length === 0) return false;
  return declarations.every(
    (declaration) => !declaration.getSourceFile().fileName.includes("node_modules"),
  );
}

/**
 * Interface signature with Sheetwrite-owned heritage flattened: members
 * inherited from bases declared in this repository are inlined so adapter and
 * option pages document their full usable surface, while framework/library
 * bases (React/Vue/Svelte attributes, lib utility types) stay heritage-only
 * and never dump third-party internals into the manifest.
 */
async function interfaceSignature(
  symbol: ApiSymbol,
  declaration: InterfaceDeclaration,
  project: Project,
): Promise<string> {
  const checker = project.checker;
  const sourceFile = declaration.getSourceFile();
  const externalHeritage: string[] = [];
  let ownedBases = 0;
  for (const clause of declaration.heritageClauses ?? []) {
    for (const base of clause.types) {
      if (await isSheetwriteOwnedBase(base, project)) ownedBases += 1;
      else externalHeritage.push(normalizeText(base.getText(sourceFile)));
    }
  }
  if (ownedBases === 0) return normalizeText(declaration.getText());

  const members: string[] = [];
  const seen = new Set<string>();
  for (const member of declaration.members) {
    const text = normalizeText(member.getText(sourceFile));
    members.push(text.endsWith(";") || text.endsWith(",") ? text : `${text};`);
    // Call and index signatures carry no name, so only named members are seen.
    const name = (member as Partial<NamedElement>).name?.getText(sourceFile);
    if (name !== undefined) seen.add(name.replace(/^["']|["']$/g, ""));
  }
  for (const property of await checker.getPropertiesOfType(
    await checker.getDeclaredTypeOfSymbol(symbol),
  )) {
    const name = property.name;
    if (seen.has(name) || (await isPrivateSymbol(property, project)) || name === "prototype") {
      continue;
    }
    const memberDeclaration = (await declarationsOf(property, project))[0];
    if (memberDeclaration === undefined) continue;
    if (memberDeclaration.getSourceFile().fileName.includes("node_modules")) continue;
    seen.add(name);
    const text = normalizeText(memberDeclaration.getText());
    members.push(text.endsWith(";") || text.endsWith(",") ? text : `${text};`);
  }

  const modifiers = declaration.modifiers?.map((modifier) => modifier.getText(sourceFile)) ?? [];
  const typeParameters =
    declaration.typeParameters === undefined || declaration.typeParameters.length === 0
      ? ""
      : `<${declaration.typeParameters
          .map((parameter) => normalizeText(parameter.getText(sourceFile)))
          .join(", ")}>`;
  const heritage = externalHeritage.length > 0 ? ` extends ${externalHeritage.join(", ")}` : "";
  const head = `${[...modifiers, "interface"].join(" ")} ${declaration.name.text}${typeParameters}${heritage}`;
  return members.length > 0 ? `${head} { ${members.join(" ")} }` : `${head} {}`;
}

export async function declarationSignature(symbol: ApiSymbol, project: Project): Promise<string> {
  const checker = project.checker;
  const declarations = await declarationsOf(symbol, project);
  if (symbol.flags & SymbolFlags.Class) return classSignature(symbol, project);
  if (symbol.flags & (SymbolFlags.Interface | SymbolFlags.TypeAlias | SymbolFlags.Enum)) {
    const interfaceDeclarations = declarations.filter(isInterfaceDeclaration);
    const [onlyInterfaceDeclaration] = interfaceDeclarations;
    if (
      interfaceDeclarations.length === 1 &&
      onlyInterfaceDeclaration !== undefined &&
      onlyInterfaceDeclaration.heritageClauses !== undefined
    ) {
      return interfaceSignature(symbol, onlyInterfaceDeclaration, project);
    }
    return declarations
      .map((declaration) => normalizeText(declaration.getText()))
      .sort()
      .join(" | ");
  }

  const location = declarations[0];
  if (location === undefined) return symbol.name;
  const type = await checker.getTypeOfSymbolAtLocation(symbol, location);
  const callSignatures = await checker.getSignaturesOfType(type, SignatureKind.Call);
  if (callSignatures.length > 0) {
    const rendered = await Promise.all(
      callSignatures.map((signature) => signatureText(signature, location, project)),
    );
    return rendered.sort().join(" | ");
  }
  return checker.typeToString(type, location, TYPE_STRING_FLAGS);
}

export async function exportStatementDocumentation(
  symbol: ApiSymbol,
  project: Project,
): Promise<string> {
  for (const declaration of await declarationsOf(symbol, project)) {
    if (!isExportSpecifier(declaration)) continue;
    const comment = jsDocCommentText(declaration.parent.parent);
    if (comment.length > 0) return comment;
  }
  return "";
}

export async function collectTags(symbol: ApiSymbol, project: Project): Promise<string[]> {
  const tags = new Set((await symbol.getJsDocTags(project.checker)).map((tag) => tag.name));
  for (const declaration of await declarationsOf(symbol, project)) {
    const visit = (node: Node): void => {
      if (isBlock(node)) return;
      if (hasModifier(node, SyntaxKind.PrivateKeyword)) return;
      for (const tag of getJSDocTags(node)) tags.add(tag.tagName.text);
      node.forEachChild(visit);
    };
    visit(declaration);
  }
  return [...tags].sort();
}

export async function resolvedSymbol(symbol: ApiSymbol, project: Project): Promise<ApiSymbol> {
  let current = symbol;
  const seen = new Set<ApiSymbol>();
  while (current.flags & SymbolFlags.Alias) {
    if (seen.has(current)) break;
    seen.add(current);
    current = await project.checker.getAliasedSymbol(current);
  }
  return current;
}

export function unstableErrorContract(apiExport: ApiExport): string | null {
  if (
    /\berror\??:\s*(?:unknown|Error)\b/.test(apiExport.signature) ||
    /\(\s*_?error:\s*(?:unknown|Error)\b/.test(apiExport.signature)
  ) {
    return `${apiExport.name} exposes an untyped error boundary; use SheetwriteError`;
  }
  if (
    apiExport.kind === "class" &&
    apiExport.name !== "SheetwriteError" &&
    /\bextends (?:Error|RangeError|TypeError|AggregateError|EvalError|ReferenceError|SyntaxError|URIError|DOMException)\b/.test(
      apiExport.signature,
    )
  ) {
    return `${apiExport.name} extends Error directly; public failures must extend SheetwriteError`;
  }
  return null;
}
