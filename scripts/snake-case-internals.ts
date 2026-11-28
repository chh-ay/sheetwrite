/**
 * Renames internal camelCase identifiers to snake_case using the TypeScript checker.
 *
 * Renamed: non-exported functions, local variables, parameters whose names are not
 * emitted in declaration files, and private class members (`private` or `#name`).
 * Comment mentions inside the symbol's scope written as code (in backticks, as a
 * `@param` name or as a `{@link}` target) are updated; bare mentions are reported for
 * review, and a mention after `.` is a property path and stays.
 *
 * Never renamed: exported or re-exported names, anything declared outside the target
 * files, object and interface property keys (they can cross persisted, wire, public or
 * DOM boundaries), public and protected class members, and parameter properties.
 * Shorthand properties and destructured bindings keep their key and only rename the
 * local (`{ rowIndex }` becomes `{ rowIndex: row_index }`). A name is reported as a
 * conflict instead when its snake_case form is already bound, when another renamed
 * name in the file maps to the same form, or when the file uses the old name in a value
 * position the checker resolves to no symbol.
 *
 * Conflicts are settled in `snake-case-internals.names.json`: per file, the old name and
 * the snake_case name to use instead. A picked name still must not be bound already, but
 * an unresolved use of the old name no longer blocks it: picking a name records that the
 * use was checked.
 *
 * A `private` member is also renamed where it is named by text: `target["name"]`, a
 * reflective call such as `Reflect.get(target, "name")` or `spyOn(target, "name")`. When
 * a reflective call's target does not have the member (it is untyped, or typed as a
 * public interface), the string follows the private members with that name in every
 * project and is reported for review; when they do not all get one new name, it is a
 * conflict. So `apply` and `check` plan every project once before the real pass.
 * `target["name"]` and `target.name` on a value without the member are data keys and
 * stay. Uses through an instantiated type, which the checker gives their own symbol,
 * are matched by the member's declaration.
 * A key of a type literal reached by a double cast, `value as unknown as { name: … }`,
 * is how a test reads private state with types; it follows the private members with that
 * name in the same way, with every use of the key.
 *
 * Every run plans from the type checker's view of the current files, so it can be
 * re-run at any time: output is sorted, and a second `apply` changes nothing.
 *
 * Usage: `bun scripts/snake-case-internals.ts <check|apply> [--project <tsconfig.json>]...
 * [--include <dir>]...`. Without `--project` it runs every `packages/*\/tsconfig.json`,
 * then `tsconfig.verification.json`, `bench/tsconfig.json` and `docs/tsconfig.json`. A
 * file below a nested `tsconfig.json` (a fixture or consumer project) belongs to that
 * project and is skipped.
 * Generated `*.gen.ts` files are skipped too: their generator rewrites them.
 * `.mjs` modules and the `<script>` blocks and markup expressions of `.svelte` components
 * are planned with the project whose directory holds them; a `{name}` attribute becomes
 * `name={new_name}`, so the attribute keeps its name.
 * `check` lists every pending rename and conflict and exits 1 when any exist; `apply`
 * rewrites the files. Conflicts need a hand-picked name in the names file.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";

import {
  NodeFlags,
  SyntaxKind,
  isArrowFunction,
  isAsExpression,
  isBindingElement,
  isCallExpression,
  isClassDeclaration,
  isClassExpression,
  isElementAccessExpression,
  isExportAssignment,
  isExportSpecifier,
  isFunctionDeclaration,
  isFunctionExpression,
  isIdentifier,
  isMethodSignatureDeclaration,
  isNoSubstitutionTemplateLiteral,
  isObjectBindingPattern,
  isParameterDeclaration,
  isPrivateIdentifier,
  isPropertyAccessExpression,
  isPropertySignatureDeclaration,
  isShorthandPropertyAssignment,
  isStringLiteral,
  isTypeLiteralNode,
  isVariableDeclaration,
  isVariableDeclarationList,
  isVariableStatement,
  type Node,
  type SourceFile,
} from "typescript/unstable/ast";
import {
  API,
  SymbolFlags,
  TypeFlags,
  type Checker,
  type Project,
  type Symbol,
} from "typescript/unstable/async";

export type RenameKind = "function" | "variable" | "parameter" | "private member";

/** One symbol the codemod renames, with every occurrence it rewrites. */
export interface PlannedRename {
  readonly kind: RenameKind;
  readonly file: string;
  readonly line: number;
  readonly oldName: string;
  readonly newName: string;
}

/** A symbol that would be renamed but whose new name is already taken. */
export interface RenameConflict {
  readonly file: string;
  readonly line: number;
  readonly oldName: string;
  readonly newName: string;
  readonly reason: string;
}

/**
 * A line for a reviewer: a bare comment mention of a renamed name, left unchanged, or a
 * use matched by name only, renamed.
 */
export interface CommentMention {
  readonly file: string;
  readonly line: number;
  readonly oldName: string;
  readonly newName: string;
  readonly source: "comment" | "name only";
}

export interface RenamePlan {
  readonly renames: readonly PlannedRename[];
  readonly conflicts: readonly RenameConflict[];
  readonly mentions: readonly CommentMention[];
  readonly edits: ReadonlyMap<string, readonly TextEdit[]>;
  /** The project's own `private` members, for name-only uses in other projects. */
  readonly privateMembers: PrivateMemberNames;
}

/** Hand-picked new names: absolute file name, then old name to new name. */
export type PickedNames = ReadonlyMap<string, ReadonlyMap<string, string>>;

/**
 * Each `private` member's old name, to the names members with that name end with: the new
 * name, or the old name when a conflict keeps it.
 */
export type PrivateMemberNames = ReadonlyMap<string, ReadonlySet<string>>;

interface TextEdit {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

interface Occurrence {
  readonly file: SourceFile;
  readonly name: Node;
  /** The occurrence is a key-less shorthand or binding, so the key must be spelled out. */
  readonly keeps_key: boolean;
  /** The occurrence is a string literal; only the text inside its quotes changes. */
  readonly is_string: boolean;
}

interface Candidate {
  readonly kind: RenameKind;
  readonly declaration: Node;
  readonly file: SourceFile;
  readonly oldName: string;
  readonly newName: string;
  /** The new name comes from the names file instead of `toSnakeCase`. */
  readonly picked: boolean;
  /** The member is an ECMAScript `#name`, renamed lexically within its class. */
  readonly is_private_name: boolean;
  /** The same file uses the old name somewhere the checker resolved to no symbol. */
  unresolved_use: boolean;
  readonly occurrences: Occurrence[];
}

const CAMEL_CASE = /^(_*|#)[a-z][a-z0-9]*[A-Z][A-Za-z0-9]*$/;

/** Convert `parseXMLPart` to `parse_xml_part`, keeping a leading `_` or `#`. */
export function toSnakeCase(name: string): string {
  const prefix = /^(_*|#)/.exec(name)?.[0] ?? "";
  const body = name.slice(prefix.length);
  const words = body
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .toLowerCase();

  return prefix + words;
}

function is_camel_case(name: string): boolean {
  return CAMEL_CASE.test(name);
}

function has_modifier(node: Node, kind: SyntaxKind): boolean {
  if (!("modifiers" in node)) return false;

  const modifiers = node.modifiers as readonly Node[] | undefined;
  return modifiers?.some((modifier) => modifier.kind === kind) ?? false;
}

function is_ambient(node: Node): boolean {
  for (let current: Node | undefined = node; current; current = current.parent) {
    if ((current.flags & NodeFlags.Ambient) !== 0) return true;
    if (current.kind === SyntaxKind.ModuleDeclaration) return true;
    if (has_modifier(current, SyntaxKind.DeclareKeyword)) return true;
  }

  return false;
}

/** The declaration a binding element ultimately belongs to: a variable or a parameter. */
function binding_root(node: Node): Node {
  let current = node;
  while (
    isBindingElement(current) ||
    isObjectBindingPattern(current) ||
    current.kind === SyntaxKind.ArrayBindingPattern
  ) {
    current = current.parent;
  }

  return current;
}

function is_exported_variable(declaration: Node): boolean {
  const list = declaration.parent;
  if (!isVariableDeclarationList(list)) return false;

  const statement = list.parent;
  return isVariableStatement(statement) && has_modifier(statement, SyntaxKind.ExportKeyword);
}

function is_exported_function(declaration: Node): boolean {
  return (
    has_modifier(declaration, SyntaxKind.ExportKeyword) ||
    has_modifier(declaration, SyntaxKind.DefaultKeyword)
  );
}

function is_class_member(node: Node): boolean {
  return isClassDeclaration(node.parent) || isClassExpression(node.parent);
}

/**
 * Whether a parameter name appears in emitted declarations: a signature without a body,
 * an exported function, a non-private class member, or a function stored in an exported
 * variable.
 */
function is_emitted_parameter(parameter: Node): boolean {
  const owner = parameter.parent;
  if (!("body" in owner) || owner.body === undefined) return true;
  if (isFunctionDeclaration(owner)) return is_exported_function(owner);
  if (is_class_member(owner)) return !has_modifier(owner, SyntaxKind.PrivateKeyword);

  if (isArrowFunction(owner) || isFunctionExpression(owner)) {
    let holder = owner.parent;
    while (
      holder.kind === SyntaxKind.ParenthesizedExpression ||
      holder.kind === SyntaxKind.AsExpression ||
      holder.kind === SyntaxKind.SatisfiesExpression
    ) {
      holder = holder.parent;
    }

    return isVariableDeclaration(holder) && is_exported_variable(holder);
  }

  return false;
}

/** Classify the declaration that `name` names, or return undefined when it must keep its name. */
function classify(name: Node): RenameKind | undefined {
  const declaration = name.parent;
  if (!("name" in declaration) || declaration.name !== name) return undefined;
  if (is_ambient(declaration)) return undefined;

  if (isFunctionDeclaration(declaration)) {
    return is_exported_function(declaration) ? undefined : "function";
  }

  if (isVariableDeclaration(declaration)) {
    return is_exported_variable(declaration) ? undefined : "variable";
  }

  if (isParameterDeclaration(declaration)) {
    if (declaration.modifiers !== undefined && declaration.modifiers.length > 0) return undefined;
    return is_emitted_parameter(declaration) ? undefined : "parameter";
  }

  if (isBindingElement(declaration)) {
    const root = binding_root(declaration);
    if (isVariableDeclaration(root)) return is_exported_variable(root) ? undefined : "variable";
    if (isParameterDeclaration(root)) return is_emitted_parameter(root) ? undefined : "parameter";
    return undefined;
  }

  const is_member =
    declaration.kind === SyntaxKind.PropertyDeclaration ||
    declaration.kind === SyntaxKind.MethodDeclaration ||
    declaration.kind === SyntaxKind.GetAccessor ||
    declaration.kind === SyntaxKind.SetAccessor;
  if (is_member && is_class_member(declaration)) {
    const is_private =
      isPrivateIdentifier(name) || has_modifier(declaration, SyntaxKind.PrivateKeyword);
    return is_private ? "private member" : undefined;
  }

  return undefined;
}

const KEY_PARENTS = new Set<SyntaxKind>([
  SyntaxKind.PropertyAccessExpression,
  SyntaxKind.PropertyAssignment,
  SyntaxKind.PropertySignature,
  SyntaxKind.PropertyDeclaration,
  SyntaxKind.MethodSignature,
  SyntaxKind.MethodDeclaration,
  SyntaxKind.GetAccessor,
  SyntaxKind.SetAccessor,
  SyntaxKind.EnumMember,
  SyntaxKind.QualifiedName,
  SyntaxKind.JsxAttribute,
  SyntaxKind.NamedTupleMember,
]);

/**
 * Whether `name` is a property key, member name or tuple label, which can never refer to
 * a local.
 */
function is_key_position(name: Node): boolean {
  const parent = name.parent;
  if (isBindingElement(parent)) return parent.propertyName === name;
  if (!KEY_PARENTS.has(parent.kind) || !("name" in parent)) return false;

  return parent.name === name;
}

/** A member named by text: `target["name"]` or `Reflect.get(target, "name")`. */
interface MemberReference {
  readonly file: SourceFile;
  readonly name: Node;
  readonly target: Node;
}

/**
 * A key of a type literal written in a double cast, `value as unknown as { name: … }`, with
 * every use of it: a test's view of private members the checker cannot match.
 */
interface CastView {
  readonly file: SourceFile;
  readonly name: Node;
  readonly occurrences: readonly Occurrence[];
}

/** Calls whose second argument names a member of their first. */
const REFLECTIVE_CALLS = new Set([
  "Reflect.defineProperty",
  "Reflect.deleteProperty",
  "Reflect.get",
  "Reflect.getOwnPropertyDescriptor",
  "Reflect.has",
  "Reflect.set",
  "Object.defineProperty",
  "Object.getOwnPropertyDescriptor",
  "Object.hasOwn",
  "spyOn",
  "jest.spyOn",
  "vi.spyOn",
]);

function callee_name(callee: Node): string | undefined {
  if (isIdentifier(callee)) return callee.text;
  if (isPropertyAccessExpression(callee) && isIdentifier(callee.expression)) {
    return `${callee.expression.text}.${text_of(callee.name)}`;
  }

  return undefined;
}

/**
 * The value a string literal names a member of: `target["name"]`, or the second argument
 * of a reflective call. Other strings are data (keys, ids, wire names) and stay.
 */
function string_member_target(literal: Node): Node | undefined {
  const parent = literal.parent;
  if (isElementAccessExpression(parent)) {
    return parent.argumentExpression === literal ? parent.expression : undefined;
  }
  if (!isCallExpression(parent)) return undefined;
  if (!REFLECTIVE_CALLS.has(callee_name(parent.expression) ?? "")) return undefined;

  return parent.arguments[1] === literal ? parent.arguments[0] : undefined;
}

/** Whether `name` is a key of a type literal, or of one nested in it, cast to by `as unknown as`. */
function is_cast_view_key(name: Node): boolean {
  const member = name.parent;
  const is_key =
    (isPropertySignatureDeclaration(member) || isMethodSignatureDeclaration(member)) &&
    member.name === name;
  if (!is_key) return false;

  let literal = member.parent;
  while (isTypeLiteralNode(literal)) {
    const owner = literal.parent;
    if (isAsExpression(owner) && owner.type === literal) {
      return (
        isAsExpression(owner.expression) && owner.expression.type.kind === SyntaxKind.UnknownKeyword
      );
    }
    if (!isPropertySignatureDeclaration(owner)) return false;
    literal = owner.parent;
  }

  return false;
}

function names_in(
  node: Node,
  collect: (name: Node) => void,
  collect_string: (literal: Node) => void,
): void {
  if (isIdentifier(node) || isPrivateIdentifier(node)) collect(node);
  else if (isStringLiteral(node) || isNoSubstitutionTemplateLiteral(node)) collect_string(node);
  node.forEachChild((child) => {
    names_in(child, collect, collect_string);
  });
}

function line_of(file: SourceFile, node: Node): number {
  return file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
}

function text_of(name: Node): string {
  if (isIdentifier(name) || isPrivateIdentifier(name)) return name.text;
  if (isStringLiteral(name) || isNoSubstitutionTemplateLiteral(name)) return name.text;
  throw new Error(`expected an identifier, found ${SyntaxKind[name.kind]}`);
}

function member_names(declaration: Node): Set<string> {
  const names = new Set<string>();
  const owner = declaration.parent;
  owner.forEachChild((member) => {
    if ("name" in member && member.name !== undefined) {
      const member_name = member.name as Node;
      if (isIdentifier(member_name) || isPrivateIdentifier(member_name))
        names.add(member_name.text);
    }
  });

  return names;
}

function is_target(file_name: string, include: readonly string[]): boolean {
  if (file_name.endsWith(".d.ts") || file_name.includes(`${sep}node_modules${sep}`)) return false;
  if (file_name.endsWith(".gen.ts")) return false;
  // `allowJs` is on only for the `.mjs` files; other JavaScript it pulls in is not checked.
  if (/\.(?:c?js|jsx)$/.test(file_name)) return false;
  return include.some(
    (directory) => file_name === directory || file_name.startsWith(directory + sep),
  );
}

/** Whether a directory between the file and the project's own directory has a tsconfig.json. */
function in_nested_project(
  file_name: string,
  project_directory: string,
  nested: Map<string, boolean>,
): boolean {
  for (
    let directory = dirname(file_name);
    directory.startsWith(project_directory + sep);
    directory = dirname(directory)
  ) {
    let has_config = nested.get(directory);
    if (has_config === undefined) {
      has_config = existsSync(join(directory, "tsconfig.json"));
      nested.set(directory, has_config);
    }
    if (has_config) return true;
  }

  return false;
}

/** The suffix of a `.svelte` component's TypeScript view, a file beside it that only the plan sees. */
const SVELTE_VIEW_SUFFIX = ".snake-case.ts";
/** The project the plan opens instead of a project that has `.mjs` or `.svelte` files. */
const EXTRA_FILES_CONFIG = "tsconfig.snake-case.json";

/** The file a name lives in: the component, for a name in a `.svelte` component's view. */
function source_file_name(file_name: string): string {
  const absolute = resolve(file_name);

  return absolute.endsWith(`.svelte${SVELTE_VIEW_SUFFIX}`)
    ? absolute.slice(0, -SVELTE_VIEW_SUFFIX.length)
    : absolute;
}

/**
 * The `.mjs` modules and `.svelte` components below `directories`, outside nested projects,
 * that git tracks or would track. No `include` pattern lists them, so the plan adds them to
 * the project itself. A directory outside a git work tree has none.
 */
function extra_files(
  directories: readonly string[],
  project_directory: string,
  nested: Map<string, boolean>,
): string[] {
  const found = new Set<string>();
  for (const directory of directories) {
    const listed = spawnSync(
      "git",
      ["ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", "*.mjs", "*.svelte"],
      { cwd: directory, encoding: "utf8" },
    );
    if (listed.status !== 0) continue;

    for (const listed_name of listed.stdout.split("\0")) {
      if (listed_name === "") continue;

      const absolute = resolve(directory, listed_name);
      if (existsSync(absolute) && !in_nested_project(absolute, project_directory, nested)) {
        found.add(absolute);
      }
    }
  }

  return [...found].sort();
}

/** A `.svelte` component as TypeScript, with the component's offsets and lines. */
interface SvelteView {
  readonly source: string;
  readonly code: string;
  /**
   * Each `{name}` attribute by where its name starts, with the offsets of its braces: a
   * rename there rewrites the attribute as `name={new_name}`.
   */
  readonly shorthands: ReadonlyMap<number, { readonly start: number; readonly end: number }>;
}

/** A markup tag whose keyword is followed by an expression: `{#if x}`, `{@render x()}`. */
const SVELTE_EXPRESSION_TAG = /^\s*(?:#if|:else\s+if|#key|#await|@html|@render|@debug)(?=\s)/;
/** A markup tag that declares names or closes a block: `{#snippet x()}`, `{:then x}`, `{/if}`. */
const SVELTE_BLANK_TAG = /^\s*(?:#snippet|:then|:catch|:else|\/)/;
const SVELTE_EACH_TAG = /^\s*#each(?=\s)/;
const SVELTE_CONST_TAG = /^\s*@const(?=\s)/;
const SVELTE_SPREAD = /^\s*\.\.\./;
const SVELTE_BLOCK = /<(script|style)\b[^>]*>/y;
const SVELTE_START_TAG = /<[A-Za-z]/y;
const IDENTIFIER = /^\s*[A-Za-z_$][\w$]*\s*$/;

/** The index of the `}` that closes the `{` at `open`, skipping strings; the length when none does. */
function closing_brace(source: string, open: number): number {
  let depth = 0;
  let quote = "";
  for (let index = open; index < source.length; index++) {
    const unit = source.charAt(index);
    if (quote !== "") {
      if (unit === "\\") index++;
      else if (unit === quote) quote = "";
    } else if (unit === '"' || unit === "'" || unit === "`") {
      quote = unit;
    } else if (unit === "{") {
      depth++;
    } else if (unit === "}" && --depth === 0) {
      return index;
    }
  }

  return source.length;
}

/**
 * The component's `<script>` blocks as they are and each markup `{…}` expression as a
 * statement, with everything else blanked to spaces. Every UTF-16 unit and line break
 * keeps its offset, so a planned edit applies to the component unchanged.
 */
function svelte_view(source: string): SvelteView {
  const code = source
    .split("")
    .map((unit): string => (unit === "\n" || unit === "\r" ? unit : " "));
  const shorthands = new Map<number, { start: number; end: number }>();
  const keep = (start: number, end: number): void => {
    for (let index = start; index < end; index++) code[index] = source.charAt(index);
  };

  // Keeps the `{…}` at `open` as a statement and returns the index after it.
  const expression = (open: number, is_attribute: boolean): number => {
    const close = closing_brace(source, open);
    const inner_start = open + 1;
    const inner = source.slice(inner_start, close);
    code[open] = ";";
    if (close < source.length) code[close] = ";";

    // A tag that declares names or closes a block stays blank: the names it declares stay
    // unresolved, like any name the component does not bind.
    const tag = SVELTE_EXPRESSION_TAG.exec(inner);
    if (tag) {
      keep(inner_start + tag[0].length, close);
    } else if (SVELTE_EACH_TAG.test(inner)) {
      const list_start = inner_start + (SVELTE_EACH_TAG.exec(inner)?.[0].length ?? 0);
      const item = source.indexOf(" as ", list_start);
      keep(list_start, item < 0 || item > close ? close : item);
    } else if (SVELTE_CONST_TAG.test(inner)) {
      // `{@const name = value}` declares `name` for the markup: keep it as `const name = value`.
      keep(inner_start, close);
      code[inner_start + inner.indexOf("@")] = " ";
    } else if (!SVELTE_BLANK_TAG.test(inner)) {
      keep(inner_start + (SVELTE_SPREAD.exec(inner)?.[0].length ?? 0), close);
      if (is_attribute && IDENTIFIER.test(inner)) {
        shorthands.set(inner_start + inner.search(/\S/), { start: open, end: close + 1 });
      }
    }

    return close + 1;
  };

  // Reads a start tag's attributes and returns the index after its `>`.
  const start_tag = (open: number): number => {
    let quote = "";
    let after_equals = false;
    for (let index = open + 1; index < source.length;) {
      const unit = source.charAt(index);
      if (unit === "{") {
        index = expression(index, quote === "" && !after_equals);
        after_equals = false;
        continue;
      }

      if (quote !== "") {
        if (unit === quote) quote = "";
      } else if (unit === '"' || unit === "'") {
        quote = unit;
      } else if (unit === ">") {
        return index + 1;
      }
      if (!/\s/.test(unit)) after_equals = unit === "=";
      index++;
    }

    return source.length;
  };

  for (let index = 0; index < source.length;) {
    if (source.startsWith("<!--", index)) {
      const end = source.indexOf("-->", index);
      index = end < 0 ? source.length : end + "-->".length;
      continue;
    }

    SVELTE_BLOCK.lastIndex = index;
    const block = SVELTE_BLOCK.exec(source);
    if (block) {
      const body_start = index + block[0].length;
      const close = source.indexOf(`</${block[1]}`, body_start);
      const body_end = close < 0 ? source.length : close;
      if (block[1] === "script") keep(body_start, body_end);
      const after = source.indexOf(">", body_end);
      index = after < 0 ? source.length : after + 1;
      continue;
    }

    SVELTE_START_TAG.lastIndex = index;
    if (SVELTE_START_TAG.test(source)) index = start_tag(index);
    else if (source.charAt(index) === "{") index = expression(index, false);
    else index++;
  }

  return { source, code: code.join(""), shorthands };
}

const SCOPE_KINDS = new Set<SyntaxKind>([
  SyntaxKind.Block,
  SyntaxKind.SourceFile,
  SyntaxKind.ForStatement,
  SyntaxKind.ForInStatement,
  SyntaxKind.ForOfStatement,
  SyntaxKind.CatchClause,
]);

/**
 * The source range whose comments may name the symbol: a parameter's owner with its
 * doc comment, a private member's class, or the block a local or function lives in.
 */
function comment_scope(candidate: Candidate): { start: number; end: number } {
  const declaration = candidate.declaration;
  if (candidate.kind === "private member") {
    return { start: declaration.parent.getStart(candidate.file), end: declaration.parent.end };
  }

  if (candidate.kind === "parameter") {
    let parameter = declaration;
    while (!isParameterDeclaration(parameter)) parameter = parameter.parent;
    const owner = parameter.parent;
    let documented: Node = owner;
    if (isArrowFunction(owner) || isFunctionExpression(owner)) {
      while (!isVariableStatement(documented) && !SCOPE_KINDS.has(documented.kind)) {
        documented = documented.parent;
      }
    }

    const start = SCOPE_KINDS.has(documented.kind)
      ? owner.getStart(candidate.file)
      : documented.getFullStart();
    return { start, end: owner.end };
  }

  let scope = declaration.parent;
  while (!SCOPE_KINDS.has(scope.kind)) scope = scope.parent;

  return {
    start: scope.kind === SyntaxKind.SourceFile ? 0 : scope.getStart(candidate.file),
    end: scope.end,
  };
}

/** Collect the trivia (whitespace and comments) ranges between tokens inside `range`. */
function trivia_in(
  file: SourceFile,
  range: { start: number; end: number },
): Array<[number, number]> {
  const ranges = new Map<number, number>();
  const visit = (node: Node): void => {
    if (node.end < range.start || node.pos > range.end) return;

    const start = Math.max(node.pos, range.start);
    const end = Math.min(node.getStart(file), range.end);
    if (end > start) ranges.set(start, end);
    node.forEachChild(visit);
  };
  visit(file);
  if (file.endOfFileToken.pos < range.end) {
    ranges.set(file.endOfFileToken.pos, Math.min(file.end, range.end));
  }

  return [...ranges];
}

/**
 * Rename mentions of the old name in comments within the symbol's scope. A mention
 * written as code (in backticks, as a `@param` name or as a `{@link}` target) is
 * rewritten. A bare mention may name an OOXML or DOM term with the same spelling, so it
 * is only reported for review. Mentions after a `.` are property paths and stay.
 */
function comment_edits(candidate: Candidate): { edits: TextEdit[]; mentions: CommentMention[] } {
  const text = candidate.file.text;
  const escaped = candidate.oldName.replaceAll("$", "\\$");
  const pattern = new RegExp(`(?<![\\w$#.])${escaped}(?![\\w$])`, "g");
  const code_prefix = /(`|@param\s+(\{[^}]*\}\s+)?\[?|\{@link(code|plain)?\s+)$/;
  const edits: TextEdit[] = [];
  const mentions: CommentMention[] = [];
  for (const [start, end] of trivia_in(candidate.file, comment_scope(candidate))) {
    const trivia = text.slice(start, end);
    for (const match of trivia.matchAll(pattern)) {
      const name_start = start + match.index;
      if (code_prefix.test(trivia.slice(0, match.index))) {
        edits.push({
          start: name_start,
          end: name_start + candidate.oldName.length,
          text: candidate.newName,
        });
        continue;
      }

      mentions.push({
        file: candidate.file.fileName,
        line: candidate.file.getLineAndCharacterOfPosition(name_start).line + 1,
        oldName: candidate.oldName,
        newName: candidate.newName,
        source: "comment",
      });
    }
  }

  return { edits, mentions };
}

async function find_conflict(
  checker: Checker,
  candidate: Candidate,
  symbol_names: ReadonlyMap<string, string>,
): Promise<string | undefined> {
  if (candidate.unresolved_use && !candidate.picked) {
    return `the checker resolves some \`${candidate.oldName}\` in this file to no symbol`;
  }

  const other_old_name = symbol_names.get(`${candidate.file.fileName}\0${candidate.newName}`);
  if (other_old_name !== undefined && other_old_name !== candidate.oldName) {
    return `\`${other_old_name}\` in the same file also becomes \`${candidate.newName}\``;
  }

  if (candidate.kind === "private member") {
    return member_names(candidate.declaration).has(candidate.newName)
      ? "the class already has a member with that name"
      : undefined;
  }

  for (const occurrence of candidate.occurrences) {
    const existing = await checker.resolveName(
      candidate.newName,
      SymbolFlags.Value | SymbolFlags.Type,
      occurrence.name,
      false,
    );
    if (existing !== undefined)
      return `\`${candidate.newName}\` already resolves at line ${line_of(occurrence.file, occurrence.name)}`;
  }

  return undefined;
}

/** A symbol's declaration; an instantiated (transient) symbol shares its original's. */
function declaration_key(symbol: Symbol): string | undefined {
  const declaration = symbol.valueDeclaration;
  return declaration && `${declaration.path}\0${declaration.index}`;
}

/**
 * Resolve the uses of `private` members named by text. When the target's type has a
 * private member of this project with that name, the use joins its occurrences. A
 * reflective call on a target without the member is returned as a name-only use, which
 * `planRenames` matches against the private members of every project.
 */
async function add_member_references(
  checker: Checker,
  candidates: ReadonlyMap<number, Candidate>,
  by_declaration: ReadonlyMap<string, Candidate>,
  references: readonly MemberReference[],
): Promise<MemberReference[]> {
  const local_names = new Set<string>();
  for (const candidate of candidates.values()) {
    if (candidate.kind === "private member" && !candidate.is_private_name) {
      local_names.add(candidate.oldName);
    }
  }

  // `target["name"]` can only name a member of this project; reflective calls can name any.
  const named = references.filter(
    (reference) =>
      !isElementAccessExpression(reference.name.parent) || local_names.has(text_of(reference.name)),
  );
  const name_only: MemberReference[] = [];
  if (named.length === 0) return name_only;

  const types = await checker.getTypeAtLocation(named.map((reference) => reference.target));
  for (const [index, reference] of named.entries()) {
    const name = text_of(reference.name);
    const type = types[index];
    const typed = type !== undefined && (type.flags & (TypeFlags.Any | TypeFlags.Unknown)) === 0;
    const property =
      type !== undefined && typed ? await checker.getPropertyOfType(type, name) : undefined;
    if (property === undefined) {
      // `target["name"]` on a value without the member reads data.
      if (!isElementAccessExpression(reference.name.parent)) name_only.push(reference);
      continue;
    }

    const key = declaration_key(property);
    const owner = key === undefined ? undefined : by_declaration.get(key);
    owner?.occurrences.push({
      file: reference.file,
      name: reference.name,
      keeps_key: false,
      is_string: true,
    });
  }

  return name_only;
}

async function collect_candidates(
  project: Project,
  files: readonly SourceFile[],
  picked_names: PickedNames,
): Promise<{
  candidates: Map<number, Candidate>;
  name_only: MemberReference[];
  views: CastView[];
}> {
  const candidates = new Map<number, Candidate>();
  const exported = new Set<number>();
  const uses = new Map<number, Occurrence[]>();
  const declaration_counts = new Map<number, number>();
  const use_symbols = new Map<number, Symbol>();
  /** `file\0name` for names the checker resolved to no symbol. */
  const unresolved = new Set<string>();
  const private_names = new Map<SourceFile, Node[]>();
  const references: MemberReference[] = [];
  const view_keys = new Map<number, { file: SourceFile; name: Node }>();

  for (const file of files) {
    const names: Node[] = [];
    names_in(
      file,
      (name) => names.push(name),
      (literal) => {
        const target = string_member_target(literal);
        if (target && is_camel_case(text_of(literal))) {
          references.push({ file, name: literal, target });
        }
      },
    );
    const symbols = await project.checker.getSymbolAtLocation(names);

    for (const [index, name] of names.entries()) {
      const parent = name.parent;
      let symbol: Symbol | undefined = symbols[index];
      let keeps_key = false;

      if (isPrivateIdentifier(name)) {
        const listed = private_names.get(file);
        if (listed) listed.push(name);
        else private_names.set(file, [name]);
      }

      if (isExportSpecifier(parent)) {
        const local = await project.checker.getExportSpecifierLocalTargetSymbol(parent);
        if (local) exported.add(local.id);
        continue;
      }

      if (isExportAssignment(parent) && symbol) exported.add(symbol.id);

      if (isShorthandPropertyAssignment(parent) && parent.name === name) {
        symbol = await project.checker.getShorthandAssignmentValueSymbol(parent);
        keeps_key = true;
      }

      // A rest element (`...rest`) has no key to keep.
      if (
        isBindingElement(parent) &&
        parent.name === name &&
        parent.propertyName === undefined &&
        parent.dotDotDotToken === undefined &&
        isObjectBindingPattern(parent.parent)
      ) {
        keeps_key = true;
      }

      if (!symbol) {
        if (!is_key_position(name)) unresolved.add(`${file.fileName}\0${text_of(name)}`);
        continue;
      }

      const occurrence = { file, name, keeps_key, is_string: false };
      use_symbols.set(symbol.id, symbol);
      const listed = uses.get(symbol.id);
      if (listed) listed.push(occurrence);
      else uses.set(symbol.id, [occurrence]);

      const old_name = text_of(name);
      if (!is_camel_case(old_name)) continue;

      if (is_cast_view_key(name)) view_keys.set(symbol.id, { file, name });

      const kind = classify(name);
      if (kind === undefined) continue;

      declaration_counts.set(symbol.id, (declaration_counts.get(symbol.id) ?? 0) + 1);
      if (symbol.declarations.length === 1 && !candidates.has(symbol.id)) {
        const picked = picked_names.get(source_file_name(file.fileName))?.get(old_name);
        candidates.set(symbol.id, {
          kind,
          declaration: parent,
          file,
          oldName: old_name,
          newName: picked ?? toSnakeCase(old_name),
          picked: picked !== undefined,
          is_private_name: isPrivateIdentifier(name),
          unresolved_use: false,
          occurrences: [],
        });
      }
    }
  }

  for (const [symbol_id, candidate] of candidates) {
    if (exported.has(symbol_id) || declaration_counts.get(symbol_id) !== 1) {
      candidates.delete(symbol_id);
      continue;
    }

    // A `#name` is lexically scoped to its class, so every `#name` in the class body is
    // this member, even where the checker cannot type the receiver.
    if (candidate.is_private_name) {
      const owner = candidate.declaration.parent;
      const same_class = (private_names.get(candidate.file) ?? []).filter(
        (name) =>
          text_of(name) === candidate.oldName && name.pos >= owner.pos && name.end <= owner.end,
      );
      candidate.occurrences.push(
        ...same_class.map((name) => ({
          file: candidate.file,
          name,
          keeps_key: false,
          is_string: false,
        })),
      );
      continue;
    }

    candidate.unresolved_use = unresolved.has(`${candidate.file.fileName}\0${candidate.oldName}`);
    candidate.occurrences.push(...(uses.get(symbol_id) ?? []));
  }

  // A member reached through an instantiated type has a transient symbol of its own that
  // shares the member's declaration.
  const by_declaration = new Map<string, Candidate>();
  for (const [symbol_id, candidate] of candidates) {
    const symbol = use_symbols.get(symbol_id);
    const key = symbol && declaration_key(symbol);
    if (key !== undefined && !candidate.is_private_name) by_declaration.set(key, candidate);
  }
  for (const [symbol_id, symbol] of use_symbols) {
    if (candidates.has(symbol_id)) continue;

    const key = declaration_key(symbol);
    const candidate = key === undefined ? undefined : by_declaration.get(key);
    candidate?.occurrences.push(...(uses.get(symbol_id) ?? []));
  }

  const name_only = await add_member_references(
    project.checker,
    candidates,
    by_declaration,
    references,
  );

  const views = [...view_keys].map(([symbol_id, key]) => ({
    ...key,
    occurrences: uses.get(symbol_id) ?? [],
  }));

  return { candidates, name_only, views };
}

/**
 * Plan every rename in the target files of one TypeScript project. `picked_names`
 * replaces the snake_case form of a name in one file, for names that conflict.
 * `other_members` lists the private members of the other projects, which a reflective
 * call here may name.
 */
export async function planRenames(
  project_path: string,
  include: readonly string[],
  picked_names: PickedNames = new Map(),
  other_members: PrivateMemberNames = new Map(),
): Promise<RenamePlan> {
  const config = resolve(project_path);
  const project_directory = dirname(config);
  const directories =
    include.length > 0 ? include.map((directory) => resolve(directory)) : [project_directory];
  const nested = new Map<string, boolean>();

  // No project lists the `.mjs` and `.svelte` files, so the plan opens a project of its
  // own that adds them: each `.mjs` file as it is, and each component as its TypeScript
  // view. Both files exist only for TypeScript, through its file system callbacks.
  const extras = extra_files(directories, project_directory, nested);
  const svelte_views = new Map<string, SvelteView>();
  const virtual_files = new Map<string, string>();
  let opened = config;
  if (extras.length > 0) {
    const roots = extras.map((file_name) => {
      if (!file_name.endsWith(".svelte")) return file_name;

      const view = svelte_view(readFileSync(file_name, "utf8"));
      svelte_views.set(file_name + SVELTE_VIEW_SUFFIX, view);
      virtual_files.set(file_name + SVELTE_VIEW_SUFFIX, view.code);
      return file_name + SVELTE_VIEW_SUFFIX;
    });
    opened = join(project_directory, EXTRA_FILES_CONFIG);
    virtual_files.set(
      opened,
      JSON.stringify({
        extends: `./${basename(config)}`,
        compilerOptions: { allowJs: true },
        files: roots,
      }),
    );
  }
  const api = new API({
    cwd: project_directory,
    fs: {
      fileExists: (file_name) => virtual_files.has(file_name) || undefined,
      readFile: (file_name) => virtual_files.get(file_name),
    },
  });

  try {
    const snapshot = await api.updateSnapshot({ openProjects: [opened] });
    const project = snapshot
      .getProjects()
      .find((candidate) => resolve(candidate.configFileName) === opened);
    if (!project) throw new Error(`TypeScript did not load ${opened}`);

    const files: SourceFile[] = [];
    for (const file_name of await project.program.getSourceFileNames()) {
      const absolute = resolve(file_name);
      if (!is_target(absolute, directories)) continue;
      if (in_nested_project(absolute, project_directory, nested)) continue;

      const file = await project.program.getSourceFile(file_name);
      if (file) files.push(file);
    }

    const { candidates, name_only, views } = await collect_candidates(project, files, picked_names);
    const symbol_names = new Map<string, string>();
    for (const candidate of candidates.values()) {
      symbol_names.set(`${candidate.file.fileName}\0${candidate.newName}`, candidate.oldName);
    }

    const renames: PlannedRename[] = [];
    const conflicts: RenameConflict[] = [];
    const mentions = new Map<string, CommentMention>();
    const edits = new Map<string, TextEdit[]>();
    const private_members = new Map<string, Set<string>>();
    for (const candidate of candidates.values()) {
      const summary = {
        file: candidate.file.fileName,
        line: line_of(candidate.file, candidate.declaration),
        oldName: candidate.oldName,
        newName: candidate.newName,
      };
      const reason = await find_conflict(project.checker, candidate, symbol_names);
      if (candidate.kind === "private member" && !candidate.is_private_name) {
        const names = private_members.get(candidate.oldName) ?? new Set<string>();
        names.add(reason === undefined ? candidate.newName : candidate.oldName);
        private_members.set(candidate.oldName, names);
      }
      if (reason !== undefined) {
        conflicts.push({ ...summary, reason });
        continue;
      }

      renames.push({ kind: candidate.kind, ...summary });
      for (const occurrence of candidate.occurrences) {
        // A string keeps its quotes; only the name between them changes.
        const quote = occurrence.is_string ? 1 : 0;
        const start = occurrence.name.getStart(occurrence.file) + quote;
        const text = occurrence.keeps_key
          ? `${candidate.oldName}: ${candidate.newName}`
          : candidate.newName;
        const file_edits = edits.get(occurrence.file.fileName) ?? [];
        file_edits.push({ start, end: occurrence.name.end - quote, text });
        edits.set(occurrence.file.fileName, file_edits);
      }

      const comments = comment_edits(candidate);
      const file_edits = edits.get(candidate.file.fileName) ?? [];
      file_edits.push(...comments.edits);
      edits.set(candidate.file.fileName, file_edits);
      for (const mention of comments.mentions) {
        mentions.set(`${mention.file}\0${mention.line}\0${mention.oldName}`, mention);
      }
    }

    // A private member named by text only, by a reflective call on a target without the
    // member or by a key of a double cast's type, follows the private members with that
    // name, here and in the other projects, when they all get one new name.
    const follow_private_member = (
      file: SourceFile,
      name: Node,
      what: string,
    ): string | undefined => {
      const old_name = text_of(name);
      const names = new Set([
        ...(private_members.get(old_name) ?? []),
        ...(other_members.get(old_name) ?? []),
      ]);
      if (names.size === 0 || (names.size === 1 && names.has(old_name))) return undefined;

      const line = line_of(file, name);
      const [new_name] = [...names];
      if (names.size > 1 || new_name === undefined) {
        conflicts.push({
          file: file.fileName,
          line,
          oldName: old_name,
          newName: [...names].sort().join(" or "),
          reason: `${what} names a private member by text, and the private members with that name do not all get one new name`,
        });
        return undefined;
      }

      const mention: CommentMention = {
        file: file.fileName,
        line,
        oldName: old_name,
        newName: new_name,
        source: "name only",
      };
      mentions.set(`${mention.file}\0${mention.line}\0${mention.oldName}`, mention);
      return new_name;
    };

    for (const reference of name_only) {
      const new_name = follow_private_member(reference.file, reference.name, "a reflective call");
      if (new_name === undefined) continue;

      const file_edits = edits.get(reference.file.fileName) ?? [];
      file_edits.push({
        start: reference.name.getStart(reference.file) + 1,
        end: reference.name.end - 1,
        text: new_name,
      });
      edits.set(reference.file.fileName, file_edits);
    }

    for (const view of views) {
      const new_name = follow_private_member(view.file, view.name, "a double cast's type");
      if (new_name === undefined) continue;

      for (const occurrence of view.occurrences) {
        const file_edits = edits.get(occurrence.file.fileName) ?? [];
        file_edits.push({
          start: occurrence.name.getStart(occurrence.file),
          end: occurrence.name.end,
          text: new_name,
        });
        edits.set(occurrence.file.fileName, file_edits);
      }
    }

    const by_position = (
      left: { readonly file: string; readonly line: number; readonly oldName: string },
      right: { readonly file: string; readonly line: number; readonly oldName: string },
    ): number =>
      left.file.localeCompare(right.file) ||
      left.line - right.line ||
      left.oldName.localeCompare(right.oldName);
    renames.sort(by_position);
    conflicts.sort(by_position);

    // A name in a component's view is reported and edited in the component. The offsets
    // are the component's; a `{name}` attribute spells out its attribute name.
    const in_source = <Entry extends { readonly file: string }>(entry: Entry): Entry => ({
      ...entry,
      file: source_file_name(entry.file),
    });
    const source_edits = new Map<string, readonly TextEdit[]>();
    for (const [file_name, file_edits] of edits) {
      const view = svelte_views.get(resolve(file_name));
      source_edits.set(
        source_file_name(file_name),
        view === undefined
          ? file_edits
          : file_edits.map((edit) => {
              const attribute = view.shorthands.get(edit.start);
              if (attribute === undefined) return edit;

              const old_name = view.source.slice(edit.start, edit.end);
              return { ...attribute, text: `${old_name}={${edit.text}}` };
            }),
      );
    }

    return {
      renames: renames.map(in_source),
      conflicts: conflicts.map(in_source),
      mentions: [...mentions.values()].sort(by_position).map(in_source),
      edits: source_edits,
      privateMembers: private_members,
    };
  } finally {
    await api.close();
  }
}

/**
 * Rewrite each file with its planned edits, applied from the end so offsets stay valid.
 * Symbols with the same old name can share a comment mention; it is rewritten once.
 */
export function applyPlan(plan: RenamePlan): void {
  for (const [file_name, file_edits] of plan.edits) {
    const ordered = [...file_edits].sort((left, right) => right.start - left.start);
    let text = readFileSync(file_name, "utf8");
    let previous_start = -1;
    for (const edit of ordered) {
      if (edit.start === previous_start) continue;

      text = text.slice(0, edit.start) + edit.text + text.slice(edit.end);
      previous_start = edit.start;
    }

    writeFileSync(file_name, text);
  }
}

function report(plan: RenamePlan, root: string): string {
  const lines = plan.renames.map(
    (rename) =>
      `${relative(root, rename.file)}:${rename.line} ${rename.kind} ${rename.oldName} -> ${rename.newName}`,
  );
  for (const conflict of plan.conflicts) {
    lines.push(
      `${relative(root, conflict.file)}:${conflict.line} conflict ${conflict.oldName} -> ${conflict.newName}: ${conflict.reason}`,
    );
  }
  for (const mention of plan.mentions) {
    const what =
      mention.source === "comment"
        ? `comment mentions ${mention.oldName} (now ${mention.newName})`
        : `${mention.oldName} matched by name only, renamed to ${mention.newName}`;
    lines.push(`${relative(root, mention.file)}:${mention.line} review ${what}`);
  }
  lines.push(
    `${plan.renames.length} renames, ${plan.conflicts.length} conflicts, ${plan.mentions.length} lines to review`,
  );

  return `${lines.join("\n")}\n`;
}

interface CliOptions {
  readonly mode: "check" | "apply";
  readonly projects: readonly string[];
  readonly include: readonly string[];
}

const PICKED_NAME = /^(_*|#)[a-z][a-z0-9_]*$/;

/**
 * Read the names file: `{ "<file from the repository root>": { "<oldName>": "<new_name>" } }`.
 * Every picked name must be snake_case and keep the old name's `_` or `#` prefix.
 */
function read_picked_names(names_file: string, root: string): PickedNames {
  const parsed = JSON.parse(readFileSync(names_file, "utf8")) as Record<
    string,
    Record<string, string>
  >;
  const picked = new Map<string, Map<string, string>>();
  for (const [file, names] of Object.entries(parsed)) {
    for (const [old_name, new_name] of Object.entries(names)) {
      const prefix = /^(_*|#)/.exec(old_name)?.[0] ?? "";
      if (!PICKED_NAME.test(new_name) || !new_name.startsWith(prefix)) {
        throw new Error(`${names_file}: ${file} ${old_name} -> ${new_name} is not snake_case`);
      }
    }
    picked.set(resolve(root, file), new Map(Object.entries(names)));
  }

  return picked;
}

/**
 * Every workspace package project in a stable order, then the scripts, bench and docs
 * projects, for runs without `--project`.
 */
function default_projects(root: string): string[] {
  const packages = join(root, "packages");

  return [
    ...readdirSync(packages)
      .sort()
      .map((name) => join(packages, name, "tsconfig.json")),
    join(root, "tsconfig.verification.json"),
    join(root, "bench/tsconfig.json"),
    join(root, "docs/tsconfig.json"),
  ].filter((project) => existsSync(project));
}

function parse_arguments(args: readonly string[]): CliOptions {
  const [mode, ...rest] = args;
  if (mode !== "check" && mode !== "apply") {
    throw new Error(
      "usage: bun scripts/snake-case-internals.ts <check|apply> [--project <tsconfig.json>]... [--include <dir>]...",
    );
  }

  const projects: string[] = [];
  const include: string[] = [];
  for (let index = 0; index < rest.length; index += 2) {
    const flag = rest[index];
    const value = rest[index + 1];
    if (value === undefined) throw new Error(`${flag} needs a value`);
    if (flag === "--project") projects.push(value);
    else if (flag === "--include") include.push(value);
    else throw new Error(`unknown option ${flag}`);
  }

  return {
    mode,
    projects: projects.length > 0 ? projects : default_projects(process.cwd()),
    include,
  };
}

if (import.meta.main) {
  const options = parse_arguments(process.argv.slice(2));
  const root = resolve(import.meta.dir, "..");
  const picked_names = read_picked_names(
    join(import.meta.dir, "snake-case-internals.names.json"),
    root,
  );
  let pending = 0;

  // A reflective call in one project can name a private member of another, so every
  // project is planned once to collect those members.
  const private_members = new Map<string, Set<string>>();
  for (const project of options.projects) {
    const plan = await planRenames(project, options.include, picked_names);
    for (const [old_name, names] of plan.privateMembers) {
      const all = private_members.get(old_name) ?? new Set<string>();
      for (const name of names) all.add(name);
      private_members.set(old_name, all);
    }
  }

  // Projects run one after another so each plan sees the files the previous apply rewrote.
  for (const project of options.projects) {
    const plan = await planRenames(project, options.include, picked_names, private_members);
    process.stdout.write(`${relative(process.cwd(), project)}\n${report(plan, process.cwd())}`);
    pending += plan.renames.length + plan.conflicts.length;

    if (options.mode === "apply") applyPlan(plan);
  }

  if (options.mode === "check" && pending > 0) process.exitCode = 1;
}
