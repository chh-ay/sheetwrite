/**
 * Renames internal camelCase identifiers to snake_case using the TypeScript checker.
 *
 * Renamed: non-exported functions, local variables, parameters whose names are not
 * emitted in declaration files, and private class members (`private` or `#name`).
 * Comments inside the symbol's scope that mention the old name, including `@param`
 * tags, are updated; a mention after `.` is a property path and stays.
 *
 * Never renamed: exported or re-exported names, anything declared outside the target
 * files, object and interface property keys (they can cross persisted, wire, public or
 * DOM boundaries), public and protected class members, parameter properties, and names
 * whose snake_case form would collide with another binding. Shorthand properties and
 * destructured bindings keep their key and only rename the local
 * (`{ rowIndex }` becomes `{ rowIndex: row_index }`).
 *
 * Every run plans from the type checker's view of the current files, so it can be
 * re-run at any time: output is sorted, and a second `apply` changes nothing.
 *
 * Usage: `bun scripts/snake-case-internals.ts <check|apply> [--project <tsconfig.json>]...
 * [--include <dir>]...`. Without `--project` it runs every `packages/*\/tsconfig.json`.
 * `check` lists every pending rename and conflict and exits 1 when any exist; `apply`
 * rewrites the files. Conflicts need a hand-picked name.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

import {
  NodeFlags,
  SyntaxKind,
  isArrowFunction,
  isBindingElement,
  isClassDeclaration,
  isClassExpression,
  isExportAssignment,
  isExportSpecifier,
  isFunctionDeclaration,
  isFunctionExpression,
  isIdentifier,
  isObjectBindingPattern,
  isParameterDeclaration,
  isPrivateIdentifier,
  isShorthandPropertyAssignment,
  isVariableDeclaration,
  isVariableDeclarationList,
  isVariableStatement,
  type Node,
  type SourceFile,
} from "typescript/unstable/ast";
import {
  API,
  SymbolFlags,
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

/** A bare comment mention of a renamed name, left unchanged for a reviewer to judge. */
export interface CommentMention {
  readonly file: string;
  readonly line: number;
  readonly oldName: string;
  readonly newName: string;
}

export interface RenamePlan {
  readonly renames: readonly PlannedRename[];
  readonly conflicts: readonly RenameConflict[];
  readonly mentions: readonly CommentMention[];
  readonly edits: ReadonlyMap<string, readonly TextEdit[]>;
}

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
}

interface Candidate {
  readonly kind: RenameKind;
  readonly declaration: Node;
  readonly file: SourceFile;
  readonly oldName: string;
  readonly newName: string;
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
]);

/** Whether `name` is a property key or member name, which can never refer to a local. */
function is_key_position(name: Node): boolean {
  const parent = name.parent;
  if (isBindingElement(parent)) return parent.propertyName === name;
  if (!KEY_PARENTS.has(parent.kind) || !("name" in parent)) return false;

  return parent.name === name;
}

function names_in(node: Node, collect: (name: Node) => void): void {
  if (isIdentifier(node) || isPrivateIdentifier(node)) collect(node);
  node.forEachChild((child) => {
    names_in(child, collect);
  });
}

function line_of(file: SourceFile, node: Node): number {
  return file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
}

function text_of(name: Node): string {
  if (isIdentifier(name) || isPrivateIdentifier(name)) return name.text;
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
  return include.some(
    (directory) => file_name === directory || file_name.startsWith(directory + sep),
  );
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
 * written as code (in backticks or as a `@param` name) is rewritten. A bare mention
 * may name an OOXML or DOM term with the same spelling, so it is only reported for
 * review. Mentions after a `.` are property paths and stay.
 */
function comment_edits(candidate: Candidate): { edits: TextEdit[]; mentions: CommentMention[] } {
  const text = candidate.file.text;
  const escaped = candidate.oldName.replaceAll("$", "\\$");
  const pattern = new RegExp(`(?<![\\w$#.])${escaped}(?![\\w$])`, "g");
  const code_prefix = /(`|@param\s+(\{[^}]*\}\s+)?\[?)$/;
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
  if (candidate.unresolved_use) {
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

async function collect_candidates(
  project: Project,
  files: readonly SourceFile[],
): Promise<Map<number, Candidate>> {
  const candidates = new Map<number, Candidate>();
  const exported = new Set<number>();
  const uses = new Map<number, Occurrence[]>();
  const declaration_counts = new Map<number, number>();
  /** `file\0name` for names the checker resolved to no symbol. */
  const unresolved = new Set<string>();
  const private_names = new Map<SourceFile, Node[]>();

  for (const file of files) {
    const names: Node[] = [];
    names_in(file, (name) => names.push(name));
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

      if (
        isBindingElement(parent) &&
        parent.name === name &&
        parent.propertyName === undefined &&
        isObjectBindingPattern(parent.parent)
      ) {
        keeps_key = true;
      }

      if (!symbol) {
        if (!is_key_position(name)) unresolved.add(`${file.fileName}\0${text_of(name)}`);
        continue;
      }

      const occurrence = { file, name, keeps_key };
      const listed = uses.get(symbol.id);
      if (listed) listed.push(occurrence);
      else uses.set(symbol.id, [occurrence]);

      const old_name = text_of(name);
      if (!is_camel_case(old_name)) continue;

      const kind = classify(name);
      if (kind === undefined) continue;

      declaration_counts.set(symbol.id, (declaration_counts.get(symbol.id) ?? 0) + 1);
      if (symbol.declarations.length === 1 && !candidates.has(symbol.id)) {
        candidates.set(symbol.id, {
          kind,
          declaration: parent,
          file,
          oldName: old_name,
          newName: toSnakeCase(old_name),
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
        ...same_class.map((name) => ({ file: candidate.file, name, keeps_key: false })),
      );
      continue;
    }

    candidate.unresolved_use = unresolved.has(`${candidate.file.fileName}\0${candidate.oldName}`);
    candidate.occurrences.push(...(uses.get(symbol_id) ?? []));
  }

  return candidates;
}

/** Plan every rename in the target files of one TypeScript project. */
export async function planRenames(
  project_path: string,
  include: readonly string[],
): Promise<RenamePlan> {
  const config = resolve(project_path);
  const directories =
    include.length > 0 ? include.map((directory) => resolve(directory)) : [dirname(config)];
  const api = new API({ cwd: dirname(config) });

  try {
    const snapshot = await api.updateSnapshot({ openProjects: [config] });
    const project = snapshot
      .getProjects()
      .find((candidate) => resolve(candidate.configFileName) === config);
    if (!project) throw new Error(`TypeScript did not load ${config}`);

    const files: SourceFile[] = [];
    for (const file_name of await project.program.getSourceFileNames()) {
      if (!is_target(resolve(file_name), directories)) continue;

      const file = await project.program.getSourceFile(file_name);
      if (file) files.push(file);
    }

    const candidates = await collect_candidates(project, files);
    const symbol_names = new Map<string, string>();
    for (const candidate of candidates.values()) {
      symbol_names.set(`${candidate.file.fileName}\0${candidate.newName}`, candidate.oldName);
    }

    const renames: PlannedRename[] = [];
    const conflicts: RenameConflict[] = [];
    const mentions = new Map<string, CommentMention>();
    const edits = new Map<string, TextEdit[]>();
    for (const candidate of candidates.values()) {
      const summary = {
        file: candidate.file.fileName,
        line: line_of(candidate.file, candidate.declaration),
        oldName: candidate.oldName,
        newName: candidate.newName,
      };
      const reason = await find_conflict(project.checker, candidate, symbol_names);
      if (reason !== undefined) {
        conflicts.push({ ...summary, reason });
        continue;
      }

      renames.push({ kind: candidate.kind, ...summary });
      for (const occurrence of candidate.occurrences) {
        const start = occurrence.name.getStart(occurrence.file);
        const text = occurrence.keeps_key
          ? `${candidate.oldName}: ${candidate.newName}`
          : candidate.newName;
        const file_edits = edits.get(occurrence.file.fileName) ?? [];
        file_edits.push({ start, end: occurrence.name.end, text });
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

    const by_position = (left: CommentMention, right: CommentMention): number =>
      left.file.localeCompare(right.file) ||
      left.line - right.line ||
      left.oldName.localeCompare(right.oldName);
    renames.sort(by_position);
    conflicts.sort(by_position);

    return { renames, conflicts, mentions: [...mentions.values()].sort(by_position), edits };
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
    lines.push(
      `${relative(root, mention.file)}:${mention.line} review comment mentions ${mention.oldName} (now ${mention.newName})`,
    );
  }
  lines.push(
    `${plan.renames.length} renames, ${plan.conflicts.length} conflicts, ${plan.mentions.length} comments to review`,
  );

  return `${lines.join("\n")}\n`;
}

interface CliOptions {
  readonly mode: "check" | "apply";
  readonly projects: readonly string[];
  readonly include: readonly string[];
}

/** Every workspace package project, in a stable order, for runs without `--project`. */
function package_projects(root: string): string[] {
  const packages = join(root, "packages");

  return readdirSync(packages)
    .sort()
    .map((name) => join(packages, name, "tsconfig.json"))
    .filter((project) => existsSync(project));
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
    projects: projects.length > 0 ? projects : package_projects(process.cwd()),
    include,
  };
}

if (import.meta.main) {
  const options = parse_arguments(process.argv.slice(2));
  let pending = 0;

  // Projects run one after another so each plan sees the files the previous apply rewrote.
  for (const project of options.projects) {
    const plan = await planRenames(project, options.include);
    process.stdout.write(`${relative(process.cwd(), project)}\n${report(plan, process.cwd())}`);
    pending += plan.renames.length + plan.conflicts.length;

    if (options.mode === "apply") applyPlan(plan);
  }

  if (options.mode === "check" && pending > 0) process.exitCode = 1;
}
