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
  isJSDocParameterTag,
  isJSDocReturnTag,
  isJSDocSeeTag,
  isJSDocThrowsTag,
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

function normalize_text(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|\s)\/\/[^\n\r]*/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * `TypeFormatFlags` is not part of the TypeScript 7 API surface, but its values
 * are unchanged; these are the two flags the manifest renders with.
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
function has_modifier(node: Node, kind: SyntaxKind): boolean {
  const modifiers = (node as ModifiersBase).modifiers;
  return modifiers?.some((modifier) => modifier.kind === kind) === true;
}

/**
 * Comment text of the JSDoc blocks documenting a node, in source order. A
 * variable declaration is documented by the statement that declares it alone,
 * mirroring where the compiler looks for its comments.
 */
function js_doc_comment_texts(node: Node): string[] {
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
      const comment = getTextOfJSDocComment(tag.comment) ?? "";
      // `@param {Type} name - text` keeps the name and text: the reference shows the declared type.
      if (isJSDocParameterTag(tag)) {
        if (comment.trim() !== "") comments.push(`@param ${tag.name.getText()} ${comment.trim()}`);
        continue;
      }
      if (isJSDocReturnTag(tag)) {
        if (comment.trim() !== "") comments.push(`@returns ${comment.trim()}`);
        continue;
      }
      // `@throws {TypeError} when …` keeps its type as code: it may not be a linkable export.
      if (isJSDocThrowsTag(tag)) {
        const type = tag.typeExpression?.getText().replace(/^\{\s*|\s*\}$/g, "");
        const text = [type === undefined ? undefined : `\`${type}\``, comment.trim()]
          .filter(Boolean)
          .join(" ");
        if (text !== "") comments.push(`@throws ${text}`);
        continue;
      }
      if (!["example", "see"].includes(tag.tagName.text)) continue;
      const reference = isJSDocSeeTag(tag) ? tag.nameExpression?.getText() : undefined;
      const text = [reference, comment].filter(Boolean).join(" ");
      comments.push(`@${tag.tagName.text}\n${text}`);
    }
  }
  return comments;
}

/** JSDoc comment text of a node, as `getJSDocCommentsAndTags` joined it. */
function js_doc_comment_text(node: Node): string {
  return js_doc_comment_texts(node).join("\n").trim();
}

export function mergeDocumentation(sources: readonly string[]): string {
  const summaries: string[] = [];
  const tags: string[] = [];
  for (const source of sources) {
    for (const block of source.split(/(?=^@(?:example|see|param|returns|throws)\b)/m)) {
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
    for (const comment of js_doc_comment_texts(declaration)) {
      if (!comments.includes(comment)) comments.push(comment);
    }
  }
  if (comments.length > 0) return mergeDocumentation(comments);
  if (visited.has(symbol)) return "";
  visited.add(symbol);
  for (const declaration of declarations) {
    const inherited = await inherited_member_documentation(declaration, project, visited);
    if (inherited.length > 0) return inherited;
  }
  return "";
}

/** Documentation a member declaration inherits from the base type declaring it. */
async function inherited_member_documentation(
  declaration: Node,
  project: Project,
  visited: Set<ApiSymbol>,
): Promise<string> {
  const name = (declaration as Partial<NamedElement>).name?.getText();
  if (name === undefined) return "";
  const static_member = has_modifier(declaration, SyntaxKind.StaticKeyword);
  for (const clause of (declaration.parent as Partial<HeritageCarrier>).heritageClauses ?? []) {
    for (const base of clause.types) {
      const base_type = await project.checker.getTypeAtLocation(base);
      if (base_type === undefined) continue;
      // The static side of a base type is reachable through its value symbol.
      const base_symbol = static_member ? await base_type.getSymbol() : undefined;
      const inherited_type =
        base_symbol === undefined ? base_type : await project.checker.getTypeOfSymbol(base_symbol);
      if (inherited_type === undefined) continue;
      const member = await project.checker.getPropertyOfType(inherited_type, name);
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
async function signature_text(
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
async function signature_documentation(signature: Signature, project: Project): Promise<string> {
  const declaration = await signature.declaration?.resolve(project);
  if (declaration === undefined) return "";
  return js_doc_comment_texts(declaration).join("\n");
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

async function is_private_symbol(symbol: ApiSymbol, project: Project): Promise<boolean> {
  const declarations = await declarationsOf(symbol, project);
  return (
    declarations.length > 0 &&
    declarations.every((declaration) => has_modifier(declaration, SyntaxKind.PrivateKeyword))
  );
}

async function public_property_signature(
  symbol: ApiSymbol,
  project: Project,
  prefix = "",
): Promise<string | undefined> {
  if ((await is_private_symbol(symbol, project)) || symbol.name === "prototype") return undefined;
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
  // A class's construct signatures are its `constructor` members; an interface's are `new`.
  const collect_from_type = async (type: Type, construct_name = "new"): Promise<void> => {
    for (const property of await checker.getPropertiesOfType(type)) {
      if ((await is_private_symbol(property, project)) || property.name === "prototype") continue;
      record(property.name, (await symbolDocumentation(property, project)).trim());
    }
    const signature_kinds = [
      [SignatureKind.Call, "call"],
      [SignatureKind.Construct, construct_name],
    ] as const;
    for (const [kind, name] of signature_kinds) {
      for (const signature of await checker.getSignaturesOfType(type, kind)) {
        record(name, (await signature_documentation(signature, project)).trim());
      }
    }
    for (const info of await checker.getIndexInfosOfType(type)) {
      const declaration = await info.declaration?.resolve(project);
      if (declaration === undefined) continue;
      record("index", js_doc_comment_text(declaration));
    }
  };
  const declarations = await declarationsOf(symbol, project);
  if (symbol.flags & (SymbolFlags.Interface | SymbolFlags.Class)) {
    await collect_from_type(await checker.getDeclaredTypeOfSymbol(symbol));
  }
  const class_declaration = declarations.find(isClassDeclaration);
  if (class_declaration !== undefined) {
    await collect_from_type(
      await checker.getTypeOfSymbolAtLocation(symbol, class_declaration),
      "constructor",
    );
  }
  const alias_declaration = declarations.find(isTypeAliasDeclaration);
  if (alias_declaration !== undefined) {
    const alias_type = await checker.getTypeAtLocation(alias_declaration.type);
    if (alias_type !== undefined) await collect_from_type(alias_type);
  }
  return [...docs.entries()]
    .map(([name, documentation]) => ({ name, documentation }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

async function class_signature(symbol: ApiSymbol, project: Project): Promise<string> {
  const checker = project.checker;
  const declaration = (await declarationsOf(symbol, project)).find(isClassDeclaration);
  if (declaration === undefined) return `class ${symbol.name}`;
  const instance_type = await checker.getDeclaredTypeOfSymbol(symbol);
  const value_type = await checker.getTypeOfSymbolAtLocation(symbol, declaration);
  const heritage = declaration.heritageClauses
    ?.map((clause) => clause.getText(declaration.getSourceFile()).replace(/\s+/g, " ").trim())
    .join(" ");
  const constructors = (
    await Promise.all(
      (await checker.getSignaturesOfType(value_type, SignatureKind.Construct)).map((signature) =>
        signature_text(signature, declaration, project),
      ),
    )
  )
    // `(args): Instance` is a call signature — invalid inside a class body.
    .map((signature) => `constructor${signature.replace(/\)\s*:\s*[^:]*$/, ")")}`)
    // A default constructor adds nothing the class name doesn't already say.
    .filter((signature) => signature !== "constructor()");
  const source_file = declaration.getSourceFile();
  const declared_here = async (property: ApiSymbol): Promise<ApiSymbol | undefined> => {
    const member_declarations = await declarationsOf(property, project);
    return member_declarations.some(
      (member_declaration) =>
        member_declaration.getSourceFile().fileName === source_file.fileName &&
        member_declaration.pos >= declaration.pos &&
        member_declaration.end <= declaration.end,
    )
      ? property
      : undefined;
  };
  // Inherited platform members (Error.name/message/stack) are noise here, so
  // only properties declared in the class body are listed.
  const declared_members = async (type: Type): Promise<ApiSymbol[]> =>
    (await Promise.all((await checker.getPropertiesOfType(type)).map(declared_here))).filter(
      (property): property is ApiSymbol => property !== undefined,
    );
  const members = (
    await Promise.all(
      (await declared_members(instance_type)).map((property) =>
        public_property_signature(property, project),
      ),
    )
  ).filter((signature): signature is string => signature !== undefined);
  const static_members = (
    await Promise.all(
      (await declared_members(value_type)).map((property) =>
        public_property_signature(property, project, "static "),
      ),
    )
  ).filter((signature): signature is string => signature !== undefined);
  const body = [...constructors, ...members.sort(), ...static_members.sort()].join("; ");
  const head = heritage ? `class ${symbol.name} ${heritage}` : `class ${symbol.name}`;
  return body.length > 0 ? `${head} { ${body} }` : `${head} {}`;
}
/**
 * True when a heritage base resolves to declarations owned by this repository
 * rather than a dependency or the TypeScript libs. Workspace packages resolve
 * through realpath, so third-party bases are exactly the ones that still live
 * under `node_modules`.
 */
async function is_sheetwrite_owned_base(
  base: ExpressionWithTypeArguments,
  project: Project,
): Promise<boolean> {
  const type = await project.checker.getTypeAtLocation(base);
  if (type === undefined) return false;
  const alias_symbol = await type.getAliasSymbol();
  const symbol = alias_symbol ?? (await type.getSymbol());
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
async function interface_signature(
  symbol: ApiSymbol,
  declaration: InterfaceDeclaration,
  project: Project,
): Promise<string> {
  const checker = project.checker;
  const source_file = declaration.getSourceFile();
  const external_heritage: string[] = [];
  let owned_bases = 0;
  for (const clause of declaration.heritageClauses ?? []) {
    for (const base of clause.types) {
      if (await is_sheetwrite_owned_base(base, project)) owned_bases += 1;
      else external_heritage.push(normalize_text(base.getText(source_file)));
    }
  }
  if (owned_bases === 0) return normalize_text(declaration.getText());

  const members: string[] = [];
  const seen = new Set<string>();
  for (const member of declaration.members) {
    const text = normalize_text(member.getText(source_file));
    members.push(text.endsWith(";") || text.endsWith(",") ? text : `${text};`);
    // Call and index signatures carry no name, so only named members are seen.
    const name = (member as Partial<NamedElement>).name?.getText(source_file);
    if (name !== undefined) seen.add(name.replace(/^["']|["']$/g, ""));
  }
  for (const property of await checker.getPropertiesOfType(
    await checker.getDeclaredTypeOfSymbol(symbol),
  )) {
    const name = property.name;
    if (seen.has(name) || (await is_private_symbol(property, project)) || name === "prototype") {
      continue;
    }
    const member_declaration = (await declarationsOf(property, project))[0];
    if (member_declaration === undefined) continue;
    if (member_declaration.getSourceFile().fileName.includes("node_modules")) continue;
    seen.add(name);
    const text = normalize_text(member_declaration.getText());
    members.push(text.endsWith(";") || text.endsWith(",") ? text : `${text};`);
  }

  const modifiers = declaration.modifiers?.map((modifier) => modifier.getText(source_file)) ?? [];
  const type_parameters =
    declaration.typeParameters === undefined || declaration.typeParameters.length === 0
      ? ""
      : `<${declaration.typeParameters
          .map((parameter) => normalize_text(parameter.getText(source_file)))
          .join(", ")}>`;
  const heritage = external_heritage.length > 0 ? ` extends ${external_heritage.join(", ")}` : "";
  const head = `${[...modifiers, "interface"].join(" ")} ${declaration.name.text}${type_parameters}${heritage}`;
  return members.length > 0 ? `${head} { ${members.join(" ")} }` : `${head} {}`;
}

export async function declarationSignature(symbol: ApiSymbol, project: Project): Promise<string> {
  const checker = project.checker;
  const declarations = await declarationsOf(symbol, project);
  if (symbol.flags & SymbolFlags.Class) return class_signature(symbol, project);
  if (symbol.flags & (SymbolFlags.Interface | SymbolFlags.TypeAlias | SymbolFlags.Enum)) {
    const interface_declarations = declarations.filter(isInterfaceDeclaration);
    const [only_interface_declaration] = interface_declarations;
    if (
      interface_declarations.length === 1 &&
      only_interface_declaration !== undefined &&
      only_interface_declaration.heritageClauses !== undefined
    ) {
      return interface_signature(symbol, only_interface_declaration, project);
    }
    return declarations
      .map((declaration) => normalize_text(declaration.getText()))
      .sort()
      .join(" | ");
  }

  const location = declarations[0];
  if (location === undefined) return symbol.name;
  const type = await checker.getTypeOfSymbolAtLocation(symbol, location);
  const call_signatures = await checker.getSignaturesOfType(type, SignatureKind.Call);
  if (call_signatures.length > 0) {
    const rendered = await Promise.all(
      call_signatures.map((signature) => signature_text(signature, location, project)),
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
    const comment = js_doc_comment_text(declaration.parent.parent);
    if (comment.length > 0) return comment;
  }
  return "";
}

export async function collectTags(symbol: ApiSymbol, project: Project): Promise<string[]> {
  const tags = new Set((await symbol.getJsDocTags(project.checker)).map((tag) => tag.name));
  for (const declaration of await declarationsOf(symbol, project)) {
    const visit = (node: Node): void => {
      if (isBlock(node)) return;
      if (has_modifier(node, SyntaxKind.PrivateKeyword)) return;
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
